import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  StepId,
  UnresolvedSemanticMarkerAssertionResolution,
} from "#types/recording.ts";
import type {
  MarkerCoverageTotals,
  MarkerReviewDiagnostics,
  ScoreResult,
} from "#types/score.ts";
import type { JsSuitePlan } from "#core/suite-planner.ts";

const EMPTY_MARKER_DIAGNOSTICS: MarkerReviewDiagnostics = {
  canonicalRecoveries: 0,
  placementConflicts: 0,
  placementCorrections: 0,
};

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

export function summarizeCleanup(analyzedRecording: AnalyzedRecording): void {
  const { diagnostics } = analyzedRecording;
  const parts: string[] = [];

  if (diagnostics.removedRedundantClicks > 0) {
    parts.push(`${diagnostics.removedRedundantClicks} redundant click(s)`);
  }

  if ((diagnostics.preservedSemanticMarkers ?? 0) > 0) {
    parts.push(
      `${diagnostics.preservedSemanticMarkers} preserved semantic marker(s)`
    );
  }

  if ((diagnostics.unresolvedSemanticMarkers ?? 0) > 0) {
    parts.push(
      `${diagnostics.unresolvedSemanticMarkers} unresolved semantic marker(s)`
    );
  }

  if (diagnostics.removedDoubleClickNoise > 0) {
    parts.push(
      `${diagnostics.removedDoubleClickNoise} dblClick noise event(s)`
    );
  }

  if (diagnostics.removedCursorWander > 0) {
    parts.push(`${diagnostics.removedCursorWander} cursor wander step(s)`);
  }

  if (diagnostics.intentGroupCount > 1) {
    parts.push(`${diagnostics.intentGroupCount} intent groups`);
  }

  if (parts.length === 0) {
    return;
  }

  log(`[taro] Recording cleanup: ${parts.join(", ")}`);
}

function collectPlannedMarkerAssertions(
  suitePlan: JsSuitePlan
): PlannedMarkerAssertion[] {
  return suitePlan.scenarios.flatMap(
    (scenario) => scenario.markerAssertions ?? []
  );
}

export function collectUnresolvedMarkerAssertions(
  suitePlan: JsSuitePlan
): UnresolvedSemanticMarkerAssertionResolution[] {
  const seenMarkerStepIds = new Set<string>();
  const unresolvedMarkers: UnresolvedSemanticMarkerAssertionResolution[] = [];

  for (const scenario of suitePlan.scenarios) {
    for (const unresolvedMarker of scenario.unresolvedMarkerAssertions ?? []) {
      if (seenMarkerStepIds.has(unresolvedMarker.markerStepId)) {
        continue;
      }

      seenMarkerStepIds.add(unresolvedMarker.markerStepId);
      unresolvedMarkers.push(unresolvedMarker);
    }
  }

  return unresolvedMarkers;
}

export function buildMarkerReviewDiagnostics(
  suitePlan: JsSuitePlan | null
): MarkerReviewDiagnostics {
  if (!suitePlan) {
    return EMPTY_MARKER_DIAGNOSTICS;
  }

  let canonicalRecoveries = 0;
  let placementCorrections = 0;

  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    if (markerAssertion.diagnostics?.canonicalRecovery) {
      canonicalRecoveries += 1;
    }
    if (markerAssertion.diagnostics?.placementCorrection) {
      placementCorrections += 1;
    }
  }

  const placementConflicts = collectUnresolvedMarkerAssertions(
    suitePlan
  ).filter((marker) => marker.reason === "boundary-placement-conflict").length;

  return { canonicalRecoveries, placementConflicts, placementCorrections };
}

function countPlannedScenarioMarkers(
  scenarios: JsSuitePlan["scenarios"]
): Pick<MarkerCoverageTotals, "emitted" | "unresolved"> {
  return scenarios.reduce(
    (totals, scenario) => ({
      emitted: totals.emitted + (scenario.markerAssertions?.length ?? 0),
      unresolved:
        totals.unresolved + (scenario.unresolvedMarkerAssertions?.length ?? 0),
    }),
    { emitted: 0, unresolved: 0 }
  );
}

export function buildMarkerCoverageSummary(params: {
  analyzedRecording: AnalyzedRecording;
  suitePlan: JsSuitePlan | null;
}): MarkerCoverageTotals {
  const { analyzedRecording, suitePlan } = params;
  const preservedMarkers =
    analyzedRecording.diagnostics.preservedSemanticMarkers ?? 0;
  const diagnosticUnresolvedMarkers =
    analyzedRecording.diagnostics.unresolvedSemanticMarkers ?? 0;

  if (!suitePlan) {
    return {
      detected: preservedMarkers + diagnosticUnresolvedMarkers,
      emitted: 0,
      unresolved: diagnosticUnresolvedMarkers,
    };
  }

  const plannedMarkerTotals = countPlannedScenarioMarkers(suitePlan.scenarios);
  const unresolved = plannedMarkerTotals.unresolved;
  const detected = Math.max(
    preservedMarkers + unresolved,
    plannedMarkerTotals.emitted + unresolved
  );

  return { detected, emitted: plannedMarkerTotals.emitted, unresolved };
}

export function mergeAnalyzedStepState(
  recording: NormalizedRecording,
  analyzedRecording: AnalyzedRecording
): NormalizedRecording {
  const analyzedStepsById = new Map(
    analyzedRecording.steps
      .filter((step): step is NormalizedStep & { id: StepId } =>
        Boolean(step.id)
      )
      .map((step) => [step.id, step])
  );

  return {
    ...recording,
    steps: recording.steps.map((step) => {
      if (!step.id) {
        return step;
      }

      const analyzedStep = analyzedStepsById.get(step.id);
      if (!analyzedStep) {
        return step;
      }

      return {
        ...step,
        ...(analyzedStep.semanticMarkerCandidate
          ? { semanticMarkerCandidate: analyzedStep.semanticMarkerCandidate }
          : {}),
        ...(analyzedStep.semanticMarkerLink
          ? { semanticMarkerLink: analyzedStep.semanticMarkerLink }
          : {}),
        ...(analyzedStep.unresolvedSemanticMarker
          ? { unresolvedSemanticMarker: analyzedStep.unresolvedSemanticMarker }
          : {}),
        metadata: { ...step.metadata, ...analyzedStep.metadata },
      };
    }),
  };
}

export function toItGroups(
  analyzedRecording: AnalyzedRecording,
  fallbackTitle: string
): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups;
  }

  return [
    { name: fallbackTitle || "recorded flow", steps: analyzedRecording.steps },
  ];
}

function rehydrateItGroups(
  itGroups: ItGroup[],
  steps: NormalizedStep[]
): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) =>
      step.id ? (stepMap.get(step.id) ?? step) : step
    ),
  }));
}

export function rehydrateSuitePlan(
  plan: JsSuitePlan,
  steps: NormalizedStep[]
): JsSuitePlan {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  const mapStep = (step: NormalizedStep) =>
    step.id ? (stepMap.get(step.id) ?? step) : step;

  return {
    ...plan,
    itGroups: rehydrateItGroups(plan.itGroups, steps),
    helpers: plan.helpers.map((helper) => ({
      ...helper,
      steps: helper.steps.map(mapStep),
    })),
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      steps: scenario.steps.map(mapStep),
    })),
  };
}

function isSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker);
}

export function stripSemanticMarkerStepsFromItGroups(
  itGroups: ItGroup[]
): ItGroup[] {
  return itGroups
    .map((group) => ({
      ...group,
      steps: group.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((group) => group.steps.length > 0);
}

export function stripSemanticMarkerStepsFromHelpers(
  helpers: JsSuitePlan["helpers"]
): JsSuitePlan["helpers"] {
  return helpers
    .map((helper) => ({
      ...helper,
      steps: helper.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((helper) => helper.steps.length > 0);
}

export function stripSemanticMarkerStepsFromScenarios(
  scenarios: JsSuitePlan["scenarios"],
  helpers: JsSuitePlan["helpers"]
): JsSuitePlan["scenarios"] {
  const helperNames = new Set(helpers.map((helper) => helper.name));

  return scenarios
    .map((scenario) => ({
      ...scenario,
      steps: scenario.steps.filter((step) => !isSemanticMarkerStep(step)),
      helperRefs: scenario.helperRefs.filter((helperRef) =>
        helperNames.has(helperRef)
      ),
    }))
    .filter(
      (scenario) =>
        scenario.steps.length > 0 ||
        scenario.helperRefs.length > 0 ||
        (scenario.markerAssertions?.length ?? 0) > 0
    );
}

export function getPrimarySelector(
  recording: NormalizedRecording
): string | undefined {
  return recording.baseline?.selectors[0]?.selector;
}

function normalizeLandmarkCandidate(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.length < 3 ||
    /^https?:\/\//i.test(normalized) ||
    /^(document|location)\./i.test(normalized) ||
    /(?:[#.]|>|:|=|nth-(?:child|of-type)|querySelector)/i.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function findExpectedPageTitle(
  recording: NormalizedRecording
): string | undefined {
  const titleAssertion = recording.steps.find(
    (step) =>
      step.action === "assert" &&
      step.target === "document.title" &&
      typeof step.value === "string"
  );
  return typeof titleAssertion?.value === "string"
    ? titleAssertion.value
    : undefined;
}

export function collectExpectedLandmarks(
  recording: NormalizedRecording
): string[] {
  const values = new Set<string>();
  const register = (candidate?: string) => {
    const normalized = normalizeLandmarkCandidate(candidate);
    if (normalized) {
      values.add(normalized);
    }
  };

  for (const query of recording.baseline?.queries ?? []) {
    register(query.name);
    register(query.target);
  }

  for (const step of recording.steps) {
    if (
      step.action !== "click" &&
      step.action !== "assert" &&
      step.action !== "fill"
    ) {
      continue;
    }

    register(step.target);
    if (typeof step.value === "string") {
      register(step.value);
    }
  }

  return [...values].slice(0, 5);
}

export { findExpectedPageTitle };
