import type {
  AnalyzedRecording,
  IntentGroup,
  NormalizedRecording,
  NormalizedStep,
  RecordingDiagnostics,
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
    'removedCursorWander' | 'removedDoubleClickNoise' | 'removedRedundantClicks'
  >
}

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

function isSameClickTarget(current: NormalizedStep, candidate: NormalizedStep): boolean {
  return (
    current.action === 'click' &&
    candidate.action === 'click' &&
    normalizedTarget(current.target) !== undefined &&
    normalizedTarget(current.target) === normalizedTarget(candidate.target)
  )
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
  const filtered: NormalizedStep[] = []

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!

    if (isCursorWanderStep(step)) {
      removedCursorWander += 1
      continue
    }

    if (step.action !== 'click' || !normalizedTarget(step.target)) {
      filtered.push(step)
      continue
    }

    const cluster: NormalizedStep[] = [step]

    for (let nextIndex = index + 1; nextIndex < steps.length; nextIndex += 1) {
      const candidate = steps[nextIndex]!

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
    },
  }
}

export function analyzeRecording(recording: NormalizedRecording): AnalyzedRecording {
  const filtered = filterNoiseSteps(recording.steps)
  const intentGroups = inferIntentGroups(filtered.steps)

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
  }
}
