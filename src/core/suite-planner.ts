import type { MockAnalysis } from './mock-intelligence.js'
import { resolveSemanticMarkerAssertion } from './resolver.js'
import type {
  AnalyzedRecording,
  ItGroup,
  JsHelperPlan,
  PlannedMarkerAssertion,
  JsScenarioPlan,
  JsStateSafetyAssessment,
  NormalizedRecording,
  NormalizedStep,
  StepId,
  UnresolvedSemanticMarker,
  UnresolvedSemanticMarkerAssertionResolution,
} from '../types/recording.js'

export type RenderBoundaryKind = 'module' | 'component' | 'unknown'
export type BoundaryConfidence = 'high' | 'medium' | 'low'

export interface RenderBoundaryAssessment {
  kind: RenderBoundaryKind
  confidence: BoundaryConfidence
  resolvedTarget: string | null
  reason: string
  signals: string[]
}

export interface JsSuitePlan {
  itGroups: ItGroup[]
  scenarios: JsScenarioPlan[]
  helpers: JsHelperPlan[]
  stateSafety: JsStateSafetyAssessment
  renderBoundary: RenderBoundaryAssessment
  warnings: string[]
}

function getStepKey(step: NormalizedRecording['steps'][number], index: number): string {
  return step.id ?? `${index}:${step.action}:${step.target ?? ''}:${step.originalType}`
}

function sharesAnyStep(left: NormalizedRecording['steps'], right: NormalizedRecording['steps']): boolean {
  const leftKeys = new Set(left.map((step, index) => getStepKey(step, index)))
  return right.some((step, index) => leftKeys.has(getStepKey(step, index)))
}

function enrichSemanticMarkerContext(
  step: NormalizedRecording['steps'][number],
  stepsById: Map<string, NormalizedRecording['steps'][number]>
): NormalizedRecording['steps'][number] {
  const anchorStepId =
    step.semanticMarkerLink?.anchorStepId ??
    step.unresolvedSemanticMarker?.anchor?.anchorStepId ??
    step.semanticMarkerCandidate?.anchor?.anchorStepId

  if (!anchorStepId) {
    return step
  }

  const anchorStep = stepsById.get(anchorStepId)
  if (!anchorStep) {
    return step
  }

  return {
    ...step,
    metadata: {
      ...step.metadata,
      semanticMarkerAnchorStep: {
        id: anchorStep.id,
        action: anchorStep.action,
        target: anchorStep.target,
        originalType: anchorStep.originalType,
        source: anchorStep.source,
      },
    },
  }
}

function enrichGroupSteps(
  groups: ItGroup[],
  stepsById: Map<string, NormalizedRecording['steps'][number]>
): ItGroup[] {
  return groups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => enrichSemanticMarkerContext(step, stepsById)),
  }))
}

function buildFallbackGroups(
  analyzedRecording: AnalyzedRecording,
  fallbackTitle: string
): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups
  }

  return [
    {
      name: fallbackTitle || 'recorded flow',
      steps: analyzedRecording.steps,
    },
  ]
}

function getSemanticMarkerCandidate(step: NormalizedStep) {
  const metadataCandidate = step.metadata?.semanticMarkerCandidate

  if (
    metadataCandidate &&
    typeof metadataCandidate === 'object' &&
    'stepId' in metadataCandidate &&
    typeof metadataCandidate.stepId === 'string'
  ) {
    return metadataCandidate
  }

  return step.semanticMarkerCandidate
}

function getSemanticMarkerLink(step: NormalizedStep) {
  const metadataLink = step.metadata?.semanticMarkerLink

  if (
    metadataLink &&
    typeof metadataLink === 'object' &&
    'markerStepId' in metadataLink &&
    typeof metadataLink.markerStepId === 'string'
  ) {
    return metadataLink
  }

  return step.semanticMarkerLink
}

function getUnresolvedSemanticMarker(step: NormalizedStep): UnresolvedSemanticMarker | undefined {
  const metadataMarker = step.metadata?.unresolvedSemanticMarker

  if (
    metadataMarker &&
    typeof metadataMarker === 'object' &&
    'stepId' in metadataMarker &&
    typeof metadataMarker.stepId === 'string'
  ) {
    return metadataMarker as UnresolvedSemanticMarker
  }

  return step.unresolvedSemanticMarker
}

function isManagedSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(
    getSemanticMarkerCandidate(step) ||
      getSemanticMarkerLink(step) ||
      getUnresolvedSemanticMarker(step)
  )
}

function filterManagedSemanticMarkerSteps(steps: NormalizedStep[]): NormalizedStep[] {
  return steps.filter((step) => !isManagedSemanticMarkerStep(step))
}

function getHelperPlacement(params: {
  anchorStepId: StepId
  helperRefs: string[]
  helperStepsByName: Map<string, Set<string>>
}): PlannedMarkerAssertion['placement'] | null {
  const { anchorStepId, helperRefs, helperStepsByName } = params

  for (const helperRef of helperRefs) {
    if (helperStepsByName.get(helperRef)?.has(anchorStepId)) {
      return {
        kind: 'after-helper',
        helperName: helperRef,
        stepId: anchorStepId,
      }
    }
  }

  return null
}

function collectScenarioMarkerState(params: {
  group: ItGroup
  helperRefs: string[]
  helperStepsByName: Map<string, Set<string>>
}) {
  const { group, helperRefs, helperStepsByName } = params
  const markerAssertions: PlannedMarkerAssertion[] = []
  const unresolvedMarkerAssertions: UnresolvedSemanticMarkerAssertionResolution[] = []

  for (const step of group.steps) {
    if (!isManagedSemanticMarkerStep(step)) {
      continue
    }

    const resolution = resolveSemanticMarkerAssertion(step)
    if (resolution.status === 'unresolved') {
      unresolvedMarkerAssertions.push(resolution)
      continue
    }

    const placement =
      getHelperPlacement({
        anchorStepId: resolution.anchorStepId,
        helperRefs,
        helperStepsByName,
      }) ?? {
        kind: 'after-step' as const,
        stepId: resolution.anchorStepId,
      }

    markerAssertions.push({
      markerStepId: resolution.markerStepId,
      anchorStepId: resolution.anchorStepId,
      placement,
      assertion: resolution.assertion,
    })
  }

  return {
    markerAssertions,
    unresolvedMarkerAssertions,
  }
}

function sanitizeIdentifierPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const normalized = part.toLowerCase()
      return index === 0
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join('')
}

function toHelperName(groupName: string, index: number): string {
  const normalized = sanitizeIdentifierPart(groupName)
  return normalized ? `plan${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : `planScenario${index + 1}`
}

function inferScenarioGoal(groupName: string): JsScenarioPlan['goal'] {
  if (/validation|error|required|missing/i.test(groupName)) {
    return 'validation'
  }

  if (/review|summary|confirm/i.test(groupName)) {
    return 'review'
  }

  if (/save|submit|pending|success|failure|mutation/i.test(groupName)) {
    return 'mutation-state'
  }

  return 'flow'
}

function hasMutationSignals(mockAnalysis: MockAnalysis | null): boolean {
  if (!mockAnalysis) {
    return false
  }

  return (
    mockAnalysis.mutationLifecycles.length > 0 ||
    mockAnalysis.repeatedTargets.length > 0
  )
}

function findRepeatedMockTarget(mockAnalysis: MockAnalysis | null): string | null {
  return mockAnalysis?.recommendations[0]?.target ?? null
}

function isWizardFlow(recording: NormalizedRecording): boolean {
  const actionableSteps = recording.steps.filter((step) =>
    ['click', 'fill', 'select'].includes(step.action)
  )
  const milestoneClicks = recording.steps.filter((step) => {
    if (step.action !== 'click' || !step.target) {
      return false
    }

    return /^(continue|save|submit)$/i.test(step.target) || /(review|dialog)/i.test(step.target)
  })
  const hasFormInput = recording.steps.some((step) => step.action === 'fill' || step.action === 'select')
  const hasReviewLanguage = recording.steps.some((step) => /(review|invoice|details)/i.test(step.target ?? ''))

  return actionableSteps.length >= 6 && hasFormInput && (milestoneClicks.length >= 2 || hasReviewLanguage)
}

function assessStateSafety(params: {
  recording: NormalizedRecording
  analyzedRecording: AnalyzedRecording
  mockAnalysis: MockAnalysis | null
}): JsStateSafetyAssessment {
  const { recording, analyzedRecording, mockAnalysis } = params
  const wizardFlow = isWizardFlow(recording)

  if (wizardFlow && hasMutationSignals(mockAnalysis)) {
    return {
      status: 'single-flow-required',
      reason:
        'This flow spans multiple wizard steps and repo evidence shows mutation-driven state, so downstream tests should share one coordinated flow unless setup recreation is proven.',
    }
  }

  if (wizardFlow) {
    return {
      status: 'unknown',
      reason:
        'This flow looks stateful, but repo evidence is not strong enough yet to prove whether multi-test recreation is safe.',
    }
  }

  if (analyzedRecording.intentGroups.length > 1) {
    return {
      status: 'safe-multi-it',
      reason:
        'Intent groups are already separated into user-visible milestones and no mutation-heavy wizard state was detected.',
    }
  }

  return {
    status: 'safe-multi-it',
    reason: 'No mutation-heavy wizard state was detected, so scenario splitting is safe when it improves readability.',
  }
}

export function assessRenderBoundary(params: {
  recording: NormalizedRecording
  mockAnalysis: MockAnalysis | null
}): RenderBoundaryAssessment {
  const { recording, mockAnalysis } = params
  const signals: string[] = []
  const wizardFlow = isWizardFlow(recording)
  const mutationSignals = hasMutationSignals(mockAnalysis)

  if (wizardFlow) {
    signals.push('multi-step wizard flow')
  }

  if (mockAnalysis?.mutationLifecycles.length) {
    signals.push('existing tests model mutation lifecycle states')
  }

  if (mockAnalysis?.repeatedTargets.length) {
    signals.push('repo already shares repeated mock targets')
  }

  if (wizardFlow && mutationSignals) {
    return {
      kind: 'module',
      confidence: 'medium',
      resolvedTarget: null,
      reason:
        'This flow spans multiple user-visible steps and repo evidence shows data/mutation setup around it, so Tayo should prefer a container/module boundary rather than a leaf component test.',
      signals,
    }
  }

  if (wizardFlow) {
    return {
      kind: 'unknown',
      confidence: 'low',
      resolvedTarget: null,
      reason:
        'This flow behaves like a stateful wizard, but Tayo cannot resolve the owning render target from repo context yet.',
      signals,
    }
  }

  return {
    kind: 'component',
    confidence: 'low',
    resolvedTarget: null,
    reason:
      'No stateful flow or repo-level mutation signals were detected, so a focused component boundary is acceptable.',
    signals,
  }
}

export function planJsSuite(params: {
  recording: NormalizedRecording
  analyzedRecording: AnalyzedRecording
  mockAnalysis: MockAnalysis | null
  fallbackTitle: string
}): JsSuitePlan {
  const { recording, analyzedRecording, mockAnalysis, fallbackTitle } = params
  const renderBoundary = assessRenderBoundary({ recording, mockAnalysis })
  const stateSafety = assessStateSafety({ recording, analyzedRecording, mockAnalysis })
  const warnings: string[] = []
  const stepsById = new Map(
    analyzedRecording.steps
      .filter((step): step is typeof step & { id: string } => Boolean(step.id))
      .map((step) => [step.id, step])
  )

  if (renderBoundary.kind === 'module') {
    warnings.push(
      'Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.'
    )
  }

  if (renderBoundary.kind !== 'component' && !renderBoundary.resolvedTarget) {
    warnings.push(
      'Tayo could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
  }

  const repeatedTarget = findRepeatedMockTarget(mockAnalysis)
  if (repeatedTarget) {
    warnings.push(
      `Reuse shared mocks for repeated targets such as "${repeatedTarget}" instead of re-mocking internal query hooks inline.`
    )
  }

  const baseGroups = enrichGroupSteps(
    renderBoundary.kind === 'module'
      ? [
          {
            name: fallbackTitle || 'complete recorded flow',
            steps: analyzedRecording.steps,
          },
        ]
      : buildFallbackGroups(analyzedRecording, fallbackTitle),
    stepsById
  )

  const helperGroups = enrichGroupSteps(analyzedRecording.intentGroups, stepsById)
  const helpers = helperGroups.map((group, index) => ({
    name: toHelperName(group.name, index),
    sourceGroup: group.name,
    purpose: `Navigate the UI through "${group.name}" without hiding assertions.`,
    steps: filterManagedSemanticMarkerSteps(group.steps),
    assertionPolicy: 'sync-only' as const,
  }))
  const helperStepsByName = new Map(
    helpers.map((helper) => [
      helper.name,
      new Set(
        helper.steps
          .filter((step): step is typeof step & { id: string } => Boolean(step.id))
          .map((step) => step.id)
      ),
    ])
  )

  const scenarios = baseGroups.map((group, index) => {
    const helperRefs =
      stateSafety.status === 'safe-multi-it'
        ? helpers
            .filter((helper) => sharesAnyStep(group.steps, helper.steps))
            .map((helper) => helper.name)
        : []
    const markerState = collectScenarioMarkerState({
      group,
      helperRefs,
      helperStepsByName,
    })

    return {
      name: group.name,
      goal: inferScenarioGoal(group.name),
      steps: filterManagedSemanticMarkerSteps(group.steps),
      helperRefs,
      requiresFreshRender: true,
      markerAssertions: markerState.markerAssertions,
      unresolvedMarkerAssertions: markerState.unresolvedMarkerAssertions,
    }
  })

  if (stateSafety.status !== 'safe-multi-it' && baseGroups.length > 1) {
    warnings.push(
      'Keep this flow in a single end-to-end scenario until Tayo can prove that downstream state can be recreated safely per test.'
    )
  }

  return {
    itGroups: baseGroups,
    scenarios,
    helpers,
    stateSafety,
    renderBoundary,
    warnings,
  }
}
