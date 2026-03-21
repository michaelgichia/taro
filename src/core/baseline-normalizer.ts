import type {
  AssertionDescriptor,
  JsBaselineMetadata,
  NormalizedRecording,
  NormalizedStep,
  ParsedJsInput,
  QueryDescriptor,
  SelectorDescriptor,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  StepId,
  UnresolvedSemanticMarker,
} from "#types/recording.ts";

type EvidenceMaps = {
  assertions: Map<StepId, AssertionDescriptor[]>;
  queries: Map<StepId, QueryDescriptor[]>;
  semanticMarkerCandidates: Map<StepId, SemanticMarkerCandidate[]>;
  selectors: Map<StepId, SelectorDescriptor[]>;
};

function groupByStepId<T extends { stepId: StepId }>(
  entries: T[]
): Map<StepId, T[]> {
  const grouped = new Map<StepId, T[]>();

  for (const entry of entries) {
    const current = grouped.get(entry.stepId) ?? [];
    current.push(entry);
    grouped.set(entry.stepId, current);
  }

  return grouped;
}

function createEvidenceMaps(baseline: JsBaselineMetadata): EvidenceMaps {
  return {
    assertions: groupByStepId(baseline.assertions),
    queries: groupByStepId(baseline.queries),
    semanticMarkerCandidates: groupByStepId(
      baseline.semanticMarkerCandidates ?? []
    ),
    selectors: groupByStepId(baseline.selectors),
  };
}

function isSyncAssertion(assertion?: AssertionDescriptor): boolean {
  return assertion?.kind === "location" || assertion?.kind === "document-title";
}

function isSemanticMarkerCandidate(
  value: unknown
): value is SemanticMarkerCandidate {
  return (
    typeof value === "object" &&
    value !== null &&
    "stepId" in value &&
    typeof value.stepId === "string" &&
    "originalGesture" in value &&
    value.originalGesture === "dblClick"
  );
}

function isSemanticMarkerLink(value: unknown): value is SemanticMarkerLink {
  return (
    typeof value === "object" &&
    value !== null &&
    "markerStepId" in value &&
    typeof value.markerStepId === "string" &&
    "anchorStepId" in value &&
    typeof value.anchorStepId === "string"
  );
}

function isUnresolvedSemanticMarker(
  value: unknown
): value is UnresolvedSemanticMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    "stepId" in value &&
    typeof value.stepId === "string" &&
    "reason" in value &&
    typeof value.reason === "string"
  );
}

function getMetadataEntry<T>(
  step: NormalizedStep,
  key: string,
  guard: (value: unknown) => value is T
): T | undefined {
  const value = step.metadata?.[key];
  return guard(value) ? value : undefined;
}

function mergeStepEvidence(
  step: NormalizedStep,
  evidenceMaps: EvidenceMaps
): NormalizedStep {
  const stepId = step.id;
  if (!stepId) {
    return step;
  }

  const queryEvidence = evidenceMaps.queries.get(stepId)?.[0];
  const assertionEvidence = evidenceMaps.assertions.get(stepId)?.[0];
  const selectorEvidence = evidenceMaps.selectors.get(stepId);
  const semanticMarkerCandidate =
    step.semanticMarkerCandidate ??
    getMetadataEntry(
      step,
      "semanticMarkerCandidate",
      isSemanticMarkerCandidate
    ) ??
    evidenceMaps.semanticMarkerCandidates.get(stepId)?.[0];
  const semanticMarkerLink =
    step.semanticMarkerLink ??
    getMetadataEntry(step, "semanticMarkerLink", isSemanticMarkerLink);
  const unresolvedSemanticMarker =
    step.unresolvedSemanticMarker ??
    getMetadataEntry(
      step,
      "unresolvedSemanticMarker",
      isUnresolvedSemanticMarker
    );

  return {
    ...step,
    ...(semanticMarkerCandidate ? { semanticMarkerCandidate } : {}),
    ...(semanticMarkerLink ? { semanticMarkerLink } : {}),
    ...(unresolvedSemanticMarker ? { unresolvedSemanticMarker } : {}),
    metadata: {
      ...step.metadata,
      ...(queryEvidence ? { query: queryEvidence } : {}),
      ...(assertionEvidence ? { assertion: assertionEvidence } : {}),
      ...(semanticMarkerCandidate ? { semanticMarkerCandidate } : {}),
      ...(semanticMarkerLink ? { semanticMarkerLink } : {}),
      ...(unresolvedSemanticMarker ? { unresolvedSemanticMarker } : {}),
      ...(selectorEvidence && selectorEvidence.length > 0
        ? { selector: selectorEvidence[0], selectors: selectorEvidence }
        : {}),
      ...(isSyncAssertion(assertionEvidence) ? { sync: true } : {}),
    },
  };
}

function normalizeBaselineGroups(
  baseline: JsBaselineMetadata,
  steps: NormalizedStep[]
): JsBaselineMetadata["itGroups"] {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  return baseline.itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => stepMap.get(step.id) ?? step),
  }));
}

export function normalizeJsBaseline(input: ParsedJsInput): NormalizedRecording {
  const evidenceMaps = createEvidenceMaps(input.baseline);
  const steps = input.recording.steps.map((step) =>
    mergeStepEvidence(step, evidenceMaps)
  );
  const baseline: JsBaselineMetadata = {
    ...input.baseline,
    itGroups: normalizeBaselineGroups(input.baseline, steps),
  };

  return {
    ...input.recording,
    url: input.recording.url ?? input.baseline.environmentUrl,
    baseline,
    steps,
  };
}
