import type {
  AssertionDescriptor,
  JsBaselineMetadata,
  NormalizedRecording,
  NormalizedStep,
  ParsedJsInput,
  QueryDescriptor,
  SelectorDescriptor,
  StepId,
} from '../types/recording.js'

type EvidenceMaps = {
  assertions: Map<StepId, AssertionDescriptor[]>
  queries: Map<StepId, QueryDescriptor[]>
  selectors: Map<StepId, SelectorDescriptor[]>
}

function groupByStepId<T extends { stepId: StepId }>(entries: T[]): Map<StepId, T[]> {
  const grouped = new Map<StepId, T[]>()

  for (const entry of entries) {
    const current = grouped.get(entry.stepId) ?? []
    current.push(entry)
    grouped.set(entry.stepId, current)
  }

  return grouped
}

function createEvidenceMaps(baseline: JsBaselineMetadata): EvidenceMaps {
  return {
    assertions: groupByStepId(baseline.assertions),
    queries: groupByStepId(baseline.queries),
    selectors: groupByStepId(baseline.selectors),
  }
}

function isSyncAssertion(assertion?: AssertionDescriptor): boolean {
  return assertion?.kind === 'location' || assertion?.kind === 'document-title'
}

function mergeStepEvidence(step: NormalizedStep, evidenceMaps: EvidenceMaps): NormalizedStep {
  const stepId = step.id
  if (!stepId) {
    return step
  }

  const queryEvidence = evidenceMaps.queries.get(stepId)?.[0]
  const assertionEvidence = evidenceMaps.assertions.get(stepId)?.[0]
  const selectorEvidence = evidenceMaps.selectors.get(stepId)

  return {
    ...step,
    metadata: {
      ...step.metadata,
      ...(queryEvidence ? { query: queryEvidence } : {}),
      ...(assertionEvidence ? { assertion: assertionEvidence } : {}),
      ...(selectorEvidence && selectorEvidence.length > 0
        ? {
            selector: selectorEvidence[0],
            selectors: selectorEvidence,
          }
        : {}),
      ...(isSyncAssertion(assertionEvidence) ? { sync: true } : {}),
    },
  }
}

function normalizeBaselineGroups(
  baseline: JsBaselineMetadata,
  steps: NormalizedStep[]
): JsBaselineMetadata['itGroups'] {
  const stepMap = new Map(steps.map((step) => [step.id, step]))

  return baseline.itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => stepMap.get(step.id) ?? step),
  }))
}

export function normalizeJsBaseline(input: ParsedJsInput): NormalizedRecording {
  const evidenceMaps = createEvidenceMaps(input.baseline)
  const steps = input.recording.steps.map((step) => mergeStepEvidence(step, evidenceMaps))
  const baseline: JsBaselineMetadata = {
    ...input.baseline,
    itGroups: normalizeBaselineGroups(input.baseline, steps),
  }

  return {
    ...input.recording,
    url: input.recording.url ?? input.baseline.environmentUrl,
    baseline,
    steps,
  }
}
