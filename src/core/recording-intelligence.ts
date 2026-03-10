import type {
  AnalyzedRecording,
  IntentGroup,
  NormalizedRecording,
  NormalizedStep,
  RecordingDiagnostics,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  SemanticMarkerProofSubject,
  UnresolvedSemanticMarker,
} from '../types/recording.js'

export interface VisualCaptureCandidate {
  groupName: string
  reason: 'dialog-state' | 'ambiguous-ui'
  selector?: string
}

export interface NoiseFilterResult {
  steps: NormalizedStep[]
  diagnostics: Pick<
    RecordingDiagnostics,
    | 'removedCursorWander'
    | 'removedDoubleClickNoise'
    | 'removedRedundantClicks'
    | 'preservedSemanticMarkers'
    | 'unresolvedSemanticMarkers'
  >
}

const MAJOR_TRANSITION_PATTERN =
  /\b(add|open|continue|submit|save|confirm|done|create|update|apply|next|finish|start|launch|proceed|review|checkout|complete)\b/i

const STATE_CHANGING_CONTROL_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'switch',
  'tab',
])

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab',
  'textbox',
])

function getAssertionKind(step: NormalizedStep): string | undefined {
  const assertion = step.metadata?.assertion
  if (
    assertion &&
    typeof assertion === 'object' &&
    'kind' in assertion &&
    typeof assertion.kind === 'string'
  ) {
    return assertion.kind
  }

  if (step.target === 'location.href') {
    return 'location'
  }

  if (step.target === 'document.title') {
    return 'document-title'
  }

  return undefined
}

function isSyncAssertionStep(step: NormalizedStep): boolean {
  if (step.action !== 'assert') {
    return false
  }

  return ['location', 'document-title'].includes(getAssertionKind(step) ?? '')
}

function hasPointerMetadata(step: NormalizedStep): boolean {
  return [step.x, step.y, step.offsetX, step.offsetY].some(
    (value) => typeof value === 'number'
  )
}

function isDoubleClickVariant(step: NormalizedStep): boolean {
  return /doubleclick|dblclick|tripleclick/i.test(step.originalType)
}

function isMovementType(step: NormalizedStep): boolean {
  return /hover|mousemove|pointermove|movemouse/i.test(step.originalType)
}

function isCursorWanderStep(step: NormalizedStep): boolean {
  if (isMovementType(step)) {
    return true
  }

  if (step.action === 'unknown' && (hasPointerMetadata(step) || !step.target)) {
    return true
  }

  return step.action === 'scroll' && !step.target && !step.value
}

function normalizedTarget(target?: string): string | undefined {
  const trimmed = target?.trim()
  return trimmed ? trimmed : undefined
}

function getSemanticMarkerCandidate(
  step: NormalizedStep
): SemanticMarkerCandidate | undefined {
  const metadataCandidate = step.metadata?.semanticMarkerCandidate

  if (
    metadataCandidate &&
    typeof metadataCandidate === 'object' &&
    'stepId' in metadataCandidate &&
    typeof metadataCandidate.stepId === 'string'
  ) {
    return metadataCandidate as SemanticMarkerCandidate
  }

  return step.semanticMarkerCandidate
}

function isJsSemanticMarkerGesture(step: NormalizedStep): boolean {
  return (
    step.source === 'js' &&
    step.action === 'click' &&
    isDoubleClickVariant(step) &&
    getSemanticMarkerCandidate(step) !== undefined
  )
}

function isSupportedProofSubject(subject: SemanticMarkerProofSubject): boolean {
  return (
    subject === 'heading' ||
    subject === 'visible-message' ||
    subject === 'concrete-value'
  )
}

function isProofLikeButUnsupportedSubject(
  subject: SemanticMarkerProofSubject
): boolean {
  return subject === 'selector-target'
}

function getQueryRole(step: NormalizedStep): string | undefined {
  const query = step.metadata?.query

  if (
    query &&
    typeof query === 'object' &&
    'role' in query &&
    typeof query.role === 'string'
  ) {
    return query.role.toLowerCase()
  }

  return undefined
}

function isStateChangingControlStep(step: NormalizedStep): boolean {
  return STATE_CHANGING_CONTROL_ROLES.has(getQueryRole(step) ?? '')
}

function isMajorTransitionStep(step: NormalizedStep): boolean {
  if (step.action === 'navigate') {
    return true
  }

  if (step.action !== 'click') {
    return false
  }

  if (isJsSemanticMarkerGesture(step)) {
    return false
  }

  const target = normalizedTarget(step.target)
  if (!target) {
    return false
  }

  if (isStateChangingControlStep(step)) {
    return true
  }

  if (getQueryRole(step)) {
    return false
  }

  return MAJOR_TRANSITION_PATTERN.test(target)
}

function findNearestPriorMajorTransitionStep(
  steps: NormalizedStep[],
  markerIndex: number
): NormalizedStep | undefined {
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const candidate = steps[index]!

    if (isSyncAssertionStep(candidate)) {
      continue
    }

    if (isMajorTransitionStep(candidate)) {
      return candidate
    }
  }

  return undefined
}

function buildSemanticMarkerLink(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  anchorStep: NormalizedStep
): SemanticMarkerLink | undefined {
  const markerStepId = step.id ?? candidate.stepId
  const anchorStepId = anchorStep.id

  if (!markerStepId || !anchorStepId) {
    return undefined
  }

  const relation =
    normalizedTarget(anchorStep.target) === normalizedTarget(step.target)
      ? 'same-target'
      : 'follows'

  return {
    markerStepId,
    anchorStepId,
    relation,
    proofSubject: candidate.proofSubject,
    target: candidate.target ?? step.target,
    proofText: candidate.proofText,
    line: candidate.line ?? step.line,
    sourceContext: candidate.sourceContext,
    query: candidate.query,
    selector: candidate.selector,
  }
}

function buildUnresolvedSemanticMarker(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  reason: UnresolvedSemanticMarker['reason']
): UnresolvedSemanticMarker | undefined {
  const stepId = step.id ?? candidate.stepId

  if (!stepId) {
    return undefined
  }

  return {
    stepId,
    reason,
    proofSubject: candidate.proofSubject,
    target: candidate.target ?? step.target,
    proofText: candidate.proofText,
    line: candidate.line ?? step.line,
    sourceContext: candidate.sourceContext,
    query: candidate.query,
    selector: candidate.selector,
    anchor: candidate.anchor,
  }
}

function applySemanticMarkerState(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  semanticMarkerLink?: SemanticMarkerLink,
  unresolvedSemanticMarker?: UnresolvedSemanticMarker
): NormalizedStep {
  const nextCandidate: SemanticMarkerCandidate = {
    ...candidate,
    status: semanticMarkerLink ? 'qualified' : 'unresolved',
    anchor: semanticMarkerLink
      ? {
          anchorStepId: semanticMarkerLink.anchorStepId,
          relation: semanticMarkerLink.relation,
        }
      : candidate.anchor,
  }

  return {
    ...step,
    semanticMarkerCandidate: nextCandidate,
    semanticMarkerLink,
    unresolvedSemanticMarker,
    metadata: {
      ...(step.metadata ?? {}),
      semanticMarkerCandidate: nextCandidate,
      ...(semanticMarkerLink ? { semanticMarkerLink } : {}),
      ...(unresolvedSemanticMarker ? { unresolvedSemanticMarker } : {}),
    },
  }
}

function annotateSemanticMarkers(steps: NormalizedStep[]): NormalizedStep[] {
  return steps.map((step, index) => {
    if (!isJsSemanticMarkerGesture(step)) {
      return step
    }

    const candidate = getSemanticMarkerCandidate(step)
    if (!candidate) {
      return step
    }

    if (isSupportedProofSubject(candidate.proofSubject)) {
      const anchorStep = findNearestPriorMajorTransitionStep(steps, index)
      const semanticMarkerLink = anchorStep
        ? buildSemanticMarkerLink(step, candidate, anchorStep)
        : undefined

      if (semanticMarkerLink) {
        return applySemanticMarkerState(step, candidate, semanticMarkerLink)
      }

      const unresolvedSemanticMarker = buildUnresolvedSemanticMarker(
        step,
        candidate,
        'missing-anchor'
      )

      return unresolvedSemanticMarker
        ? applySemanticMarkerState(step, candidate, undefined, unresolvedSemanticMarker)
        : step
    }

    if (isProofLikeButUnsupportedSubject(candidate.proofSubject)) {
      const unresolvedSemanticMarker = buildUnresolvedSemanticMarker(
        step,
        candidate,
        'unsupported-proof-subject'
      )

      return unresolvedSemanticMarker
        ? applySemanticMarkerState(step, candidate, undefined, unresolvedSemanticMarker)
        : step
    }

    return step
  })
}

function isSameClickTarget(current: NormalizedStep, candidate: NormalizedStep): boolean {
  return (
    current.action === 'click' &&
    candidate.action === 'click' &&
    normalizedTarget(current.target) !== undefined &&
    normalizedTarget(current.target) === normalizedTarget(candidate.target)
  )
}

function isPreservedSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker)
}

function isInteractiveTarget(step: NormalizedStep): boolean {
  const role = step.semanticMarkerCandidate?.query?.role?.toLowerCase()
  return role ? INTERACTIVE_ROLES.has(role) : false
}

function pickRepresentativeClick(cluster: NormalizedStep[]): NormalizedStep {
  return cluster.find((step) => !isDoubleClickVariant(step)) ?? cluster[0]!
}

function deriveIntentLabel(steps: NormalizedStep[]): string {
  const meaningfulSteps = steps.filter((step) => !isSyncAssertionStep(step))
  const navigateStep = meaningfulSteps.find((step) => step.action === 'navigate')
  if (navigateStep) {
    return navigateStep.target ? `navigate to ${navigateStep.target}` : 'navigation flow'
  }

  const submitStep = meaningfulSteps.find(
    (step) =>
      step.action === 'click' &&
      /save|submit|confirm|continue|done|create|update/i.test(step.target ?? '')
  )
  if (submitStep?.target) {
    return `submit ${submitStep.target}`
  }

  const fillStep = meaningfulSteps.find(
    (step) => step.action === 'fill' || step.action === 'select'
  )
  if (fillStep?.target) {
    return `edit ${fillStep.target}`
  }

  const clickStep = meaningfulSteps.find((step) => step.action === 'click')
  if (clickStep?.target && meaningfulSteps.some((step) => step.action === 'assert')) {
    return `confirm ${clickStep.target}`
  }

  if (clickStep?.target) {
    return `interact with ${clickStep.target}`
  }

  return 'recorded flow'
}

function isDialogLikeText(value?: string): boolean {
  return /dialog|modal|drawer|sheet|popover/i.test(value ?? '')
}

function findGroupSelector(group: IntentGroup): string | undefined {
  return group.steps.find((step) => step.action !== 'navigate' && step.target)?.target
}

export function inferIntentGroups(steps: NormalizedStep[]): IntentGroup[] {
  if (steps.length === 0) {
    return []
  }

  const groups: IntentGroup[] = []
  let currentGroup: NormalizedStep[] = []

  const flushGroup = (): void => {
    if (currentGroup.length === 0) {
      return
    }

    groups.push({
      name: deriveIntentLabel(currentGroup),
      steps: [...currentGroup],
    })
    currentGroup = []
  }

  for (const step of steps) {
    if (isSyncAssertionStep(step)) {
      continue
    }

    if (step.action === 'navigate') {
      flushGroup()
      currentGroup = [step]
      continue
    }

    if (currentGroup.length === 1 && currentGroup[0]?.action === 'navigate') {
      flushGroup()
    }

    currentGroup.push(step)

    if (step.action === 'assert') {
      flushGroup()
    }
  }

  flushGroup()
  return groups
}

export function findVisualCaptureCandidates(
  analyzedRecording: AnalyzedRecording
): VisualCaptureCandidate[] {
  return analyzedRecording.intentGroups.flatMap((group) => {
    const joinedTargets = group.steps
      .map((step) => step.target ?? '')
      .join(' ')

    const hasDialogState =
      isDialogLikeText(group.name) ||
      isDialogLikeText(joinedTargets) ||
      group.steps.some(
        (step) =>
          step.action === 'assert' &&
          /open|confirm|add|dialog|modal/i.test(step.target ?? '')
      )

    if (!hasDialogState) {
      return []
    }

    return [
      {
        groupName: group.name,
        reason: 'dialog-state' as const,
        selector: findGroupSelector(group),
      },
    ]
  })
}

export function filterNoiseSteps(steps: NormalizedStep[]): NoiseFilterResult {
  let removedRedundantClicks = 0
  let removedDoubleClickNoise = 0
  let removedCursorWander = 0
  let preservedSemanticMarkers = 0
  let unresolvedSemanticMarkers = 0
  const filtered: NormalizedStep[] = []
  const annotatedSteps = annotateSemanticMarkers(steps)

  for (let index = 0; index < annotatedSteps.length; index += 1) {
    const step = annotatedSteps[index]!

    if (isCursorWanderStep(step)) {
      removedCursorWander += 1
      continue
    }

    if (step.action !== 'click' || !normalizedTarget(step.target)) {
      filtered.push(step)
      continue
    }

    const cluster: NormalizedStep[] = [step]

    for (
      let nextIndex = index + 1;
      nextIndex < annotatedSteps.length;
      nextIndex += 1
    ) {
      const candidate = annotatedSteps[nextIndex]!

      if (isCursorWanderStep(candidate)) {
        removedCursorWander += 1
        index = nextIndex
        continue
      }

      if (!isSameClickTarget(step, candidate)) {
        break
      }

      cluster.push(candidate)
      index = nextIndex
    }

    const markerGestures = cluster.filter((candidate) => isJsSemanticMarkerGesture(candidate))
    const preservedMarkers = cluster.filter((candidate) =>
      isPreservedSemanticMarkerStep(candidate)
    )

    if (preservedMarkers.length > 0 || markerGestures.length > 0) {
      preservedSemanticMarkers += preservedMarkers.filter((candidate) =>
        Boolean(candidate.semanticMarkerLink)
      ).length
      unresolvedSemanticMarkers += preservedMarkers.filter((candidate) =>
        Boolean(candidate.unresolvedSemanticMarker)
      ).length

      const markerIsInteractive = [...preservedMarkers, ...markerGestures].some((candidate) =>
        isInteractiveTarget(candidate)
      )
      let keptInteractiveClick = false
      let seenMarkerGesture = false

      for (const candidate of cluster) {
        if (isPreservedSemanticMarkerStep(candidate)) {
          filtered.push(candidate)
          seenMarkerGesture = true
          continue
        }

        if (isJsSemanticMarkerGesture(candidate)) {
          seenMarkerGesture = true
          removedDoubleClickNoise += 1
          continue
        }

        if (isDoubleClickVariant(candidate)) {
          removedDoubleClickNoise += 1
          continue
        }

        if (markerIsInteractive && seenMarkerGesture && !keptInteractiveClick) {
          filtered.push(candidate)
          keptInteractiveClick = true
          continue
        }

        removedRedundantClicks += 1
      }

      continue
    }

    const extraClicks = cluster.length - 1
    if (extraClicks > 0) {
      const removedDoubleClicks = cluster
        .slice(1)
        .filter((candidate) => isDoubleClickVariant(candidate)).length

      removedDoubleClickNoise += removedDoubleClicks
      removedRedundantClicks += extraClicks - removedDoubleClicks
    }

    filtered.push(pickRepresentativeClick(cluster))
  }

  return {
    steps: filtered,
    diagnostics: {
      removedCursorWander,
      removedDoubleClickNoise,
      removedRedundantClicks,
      preservedSemanticMarkers,
      unresolvedSemanticMarkers,
    },
  }
}

export function analyzeRecording(recording: NormalizedRecording): AnalyzedRecording {
  const filtered = filterNoiseSteps(recording.steps)
  const intentGroups = inferIntentGroups(filtered.steps)
  const semanticMarkerLinks = filtered.steps.flatMap((step) =>
    step.semanticMarkerLink ? [step.semanticMarkerLink] : []
  )
  const unresolvedSemanticMarkers = filtered.steps.flatMap((step) =>
    step.unresolvedSemanticMarker ? [step.unresolvedSemanticMarker] : []
  )

  return {
    ...recording,
    steps: filtered.steps,
    diagnostics: {
      ...filtered.diagnostics,
      rawStepCount: recording.rawStepCount,
      filteredStepCount: filtered.steps.length,
      intentGroupCount: intentGroups.length,
    },
    intentGroups,
    semanticMarkerLinks,
    unresolvedSemanticMarkers,
  }
}
