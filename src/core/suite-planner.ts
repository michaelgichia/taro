import type { MockAnalysis } from './mock-intelligence.js'
import type { AnalyzedRecording, ItGroup, NormalizedRecording } from '../types/recording.js'

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
  renderBoundary: RenderBoundaryAssessment
  warnings: string[]
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
        'This flow spans multiple user-visible steps and repo evidence shows data/mutation setup around it, so Taro should prefer a container/module boundary rather than a leaf component test.',
      signals,
    }
  }

  if (wizardFlow) {
    return {
      kind: 'unknown',
      confidence: 'low',
      resolvedTarget: null,
      reason:
        'This flow behaves like a stateful wizard, but Taro cannot resolve the owning render target from repo context yet.',
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
  const warnings: string[] = []

  if (renderBoundary.kind === 'module') {
    warnings.push(
      'Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.'
    )
  }

  if (renderBoundary.kind !== 'component' && !renderBoundary.resolvedTarget) {
    warnings.push(
      'Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
  }

  const repeatedTarget = findRepeatedMockTarget(mockAnalysis)
  if (repeatedTarget) {
    warnings.push(
      `Reuse shared mocks for repeated targets such as "${repeatedTarget}" instead of re-mocking internal query hooks inline.`
    )
  }

  return {
    itGroups:
      renderBoundary.kind === 'module'
        ? [
            {
              name: fallbackTitle || 'complete recorded flow',
              steps: analyzedRecording.steps,
            },
          ]
        : buildFallbackGroups(analyzedRecording, fallbackTitle),
    renderBoundary,
    warnings,
  }
}
