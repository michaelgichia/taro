import pc from "picocolors";

import { collectUnresolvedMarkerAssertions } from "#cli/commands/generate-recording.ts";
import { logToStderr as log } from "#cli/commands/log.ts";
import { analyzeBoundaryIsolation } from "#core/boundary-intelligence.ts";
import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { isTestIdQueryMethod } from "#core/query-policy.ts";
import type { JsSuitePlan } from "#core/suite-planner.ts";
import type {
  QueryResult,
  SemanticMarkerAssertionUnresolvedReason,
} from "#types/recording.ts";
import type { ScoreResult } from "#types/score.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";

const UNRESOLVED_MARKER_REASON_GUIDANCE: Record<
  SemanticMarkerAssertionUnresolvedReason,
  string
> = {
  "missing-marker-candidate":
    "Semantic marker candidate metadata is missing. Re-record or keep marker metadata intact.",
  "missing-anchor":
    "Marker has no reliable anchor step. Re-record with marker near the intended assertion moment.",
  "missing-query":
    "Recorder evidence is missing an accessible query. Capture a clearer role/name or visible text.",
  "unsupported-proof-subject":
    "Marker proof subject is unsupported for safe RTL conversion. Use role/name or visible text proof.",
  "ambiguous-field-context":
    "Field context is ambiguous. Capture a single, specific field label or value target.",
  "unsupported-field-context":
    "Field context could not map to a trusted RTL field query. Record a clearer label/placeholder.",
  "generic-container":
    "Marker points to a generic container. Capture the concrete user-facing element instead.",
  "css-only-evidence":
    "Marker is backed only by CSS-like evidence. Capture semantic role/name or visible text evidence.",
  "icon-only-target":
    "Marker target is icon-only and ambiguous. Capture surrounding accessible text context.",
  "hidden-evidence":
    "Marker evidence depends on hidden/implementation selectors. Capture user-visible evidence instead.",
  "boundary-placement-conflict":
    "Marker could not be assigned to a single safe scenario. Keep the checkpoint near the intended state change or repair the scenario split.",
};

export function logScore(scoreResult: ScoreResult): void {
  const generation = scoreResult.families.generation;
  const grading = scoreResult.families.grading;
  const markerCoverageSummary =
    `markers: detected=${generation.markerCoverage.detected}, ` +
    `emitted=${generation.markerCoverage.emitted}, ` +
    `unresolved=${generation.markerCoverage.unresolved}`;
  log(
    pc.dim("[taro]") +
      ` Score: ${scoreResult.overall}/100 (${scoreResult.grade}) — ` +
      `generation: ${generation.total}, grading: ${grading.total}`
  );
  log(
    pc.dim("[taro]") +
      ` Generation — query: ${generation.dimensions.queryQuality}, ` +
      `assertions: ${generation.dimensions.assertionSpecificity}, ` +
      `structure: ${generation.dimensions.testStructure}, ` +
      `boundary: ${generation.dimensions.boundaryIsolation}, ` +
      markerCoverageSummary
  );
  log(
    pc.dim("[taro]") +
      ` Grading — robustness: ${grading.dimensions.robustness}, ` +
      `readability: ${grading.dimensions.readability}, ` +
      `assertionStrength: ${grading.dimensions.assertionStrength}, ` +
      `mockFidelity: ${grading.dimensions.mockFidelity}, ` +
      `maintainability: ${grading.dimensions.maintainability}`
  );
}

export function emitMarkerCoverageSection(scoreResult: ScoreResult): void {
  const generation = scoreResult.families.generation;
  const gateStatus =
    generation.markerQualityGate.status === "warn"
      ? pc.yellow("WARN")
      : pc.green("PASS");
  log(pc.dim("[taro]") + " Marker coverage:");
  log(pc.dim("[taro]") + `   detected: ${generation.markerCoverage.detected}`);
  log(pc.dim("[taro]") + `   emitted: ${generation.markerCoverage.emitted}`);
  log(
    pc.dim("[taro]") + `   unresolved: ${generation.markerCoverage.unresolved}`
  );
  log(
    pc.dim("[taro]") +
      `   QUAL-02 gate: ${gateStatus} (${generation.markerQualityGate.reason})`
  );

  if (generation.markerQualityGate.failing) {
    console.warn(
      pc.yellow(`[taro] QUAL-02 WARN: ${generation.markerQualityGate.message}`)
    );
  }
}

export function emitRecoveredMarkerDiagnostics(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const seenMarkerStepIds = new Set<string>();
  for (const scenario of suitePlan.scenarios) {
    for (const markerAssertion of scenario.markerAssertions ?? []) {
      const recovery = markerAssertion.diagnostics?.canonicalRecovery;
      if (!recovery || seenMarkerStepIds.has(markerAssertion.markerStepId)) {
        continue;
      }

      seenMarkerStepIds.add(markerAssertion.markerStepId);
      log(
        pc.dim("[taro]") +
          ` MKR-01 canonical-copy marker=${markerAssertion.markerStepId} ` +
          `file=${recovery.sourceFile} from="${recovery.fromText}" to="${recovery.toText}"`
      );
    }
  }
}

export function emitMarkerPlacementCorrections(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const seenMarkerStepIds = new Set<string>();
  for (const scenario of suitePlan.scenarios) {
    for (const markerAssertion of scenario.markerAssertions ?? []) {
      const placementCorrection =
        markerAssertion.diagnostics?.placementCorrection;
      if (
        !placementCorrection ||
        seenMarkerStepIds.has(markerAssertion.markerStepId)
      ) {
        continue;
      }

      seenMarkerStepIds.add(markerAssertion.markerStepId);
      console.warn(
        pc.yellow(
          `[taro] MKR-02 placement-correction marker=${markerAssertion.markerStepId} from="${placementCorrection.fromScenarioName}" to="${placementCorrection.toScenarioName}"`
        )
      );
    }
  }
}

function normalizeUnresolvedMarkerHint(marker: {
  proofText?: string;
  target?: string;
  query?: { raw?: string };
  selector?: { selector: string };
}): string {
  const hint =
    marker.proofText ??
    marker.target ??
    marker.query?.raw ??
    marker.selector?.selector;
  const normalized = hint?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : "none";
}

function formatUnresolvedMarkerLine(marker: {
  line?: number;
  sourceContext: { line?: number };
}): string {
  const line = marker.line ?? marker.sourceContext.line;
  return Number.isFinite(line) ? String(line) : "unknown";
}

function formatUnresolvedMarkerWarning(marker: {
  markerStepId: string;
  line?: number;
  proofText?: string;
  query?: { raw?: string };
  reason: SemanticMarkerAssertionUnresolvedReason;
  selector?: { selector: string };
  sourceContext: { line?: number };
  target?: string;
}): string {
  const line = formatUnresolvedMarkerLine(marker);
  const hint = normalizeUnresolvedMarkerHint(marker);
  const guidance = UNRESOLVED_MARKER_REASON_GUIDANCE[marker.reason];

  return (
    `MKR-03 unresolved-marker marker=${marker.markerStepId} ` +
    `line: ${line} reason=${marker.reason} ` +
    `detail="${guidance}" hint="${hint}"`
  );
}

export function emitUnresolvedMarkerWarnings(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const unresolvedMarkers = collectUnresolvedMarkerAssertions(suitePlan);
  for (const unresolvedMarker of unresolvedMarkers) {
    console.warn(
      pc.yellow(`[taro] ${formatUnresolvedMarkerWarning(unresolvedMarker)}`)
    );
  }
}

export function emitLowConfidenceBanner(scoreResult: ScoreResult): void {
  if (!scoreResult.requiresReview) {
    return;
  }

  console.warn(
    pc.yellow(
      `[taro] Manual review required — this generated test is still a draft (${scoreResult.overall}/100, ${scoreResult.grade}).`
    )
  );

  if (scoreResult.blockers.length > 0) {
    console.warn(
      pc.yellow(`[taro] Top blockers: ${scoreResult.blockers.join(" | ")}`)
    );
  }
}

export function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = [],
  boundaryIssues: ReturnType<
    typeof analyzeBoundaryIsolation
  > = analyzeBoundaryIsolation("")
): void {
  const generation = scoreResult.families.generation;
  const reasons = generation.reasons ?? [];

  if (generation.dimensions.queryQuality < 60) {
    const testIdCount = queryResults.filter((queryResult) => {
      return isTestIdQueryMethod(queryResult.method);
    }).length;
    log(
      pc.yellow(
        `[taro] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`
      )
    );
  }

  if (generation.dimensions.assertionSpecificity < 60) {
    log(
      pc.yellow(
        "[taro] Tip: Add specific matchers like toHaveValue() for better assertions"
      )
    );
  }

  if (generation.dimensions.testStructure < 60) {
    if (reasons.some((reason) => reason.code === "source-branch-family-gap")) {
      const missingFamilies =
        reasons
          .find((reason) => reason.code === "source-branch-family-gap")
          ?.message.replace(
            /^High-signal source branches appear uncovered:\s*/u,
            ""
          )
          .replace(/\.$/u, "") ?? "unknown";
      log(
        pc.yellow(
          `[taro] Tip: Source-aware branch planning found uncovered branch families: ${missingFamilies}.`
        )
      );
    } else if (
      reasons.some((reason) => reason.code === "branch-coverage-signal")
    ) {
      log(
        pc.yellow(
          `[taro] Tip: Consider whether the component's alternate branches or handlers need separate tests here (surface signal: ${generation.signals.minimumExpectedTestCount} possible cases).`
        )
      );
    } else if (reasons.some((reason) => reason.code === "hardcoded-fixture")) {
      log(
        pc.yellow(
          "[taro] Tip: Reuse BASE_PROPS plus an override-accepting render helper instead of duplicating inline render props."
        )
      );
    } else if (reasons.some((reason) => reason.code === "fire-event-usage")) {
      log(
        pc.yellow(
          "[taro] Tip: Prefer userEvent interactions over fireEvent for user-driven flows."
        )
      );
    } else {
      log(
        pc.yellow(
          "[taro] Tip: Split into multiple it() blocks for better test organization"
        )
      );
    }
  }

  if (generation.dimensions.boundaryIsolation < 60) {
    for (const issue of boundaryIssues) {
      console.warn(pc.yellow(`[taro] Boundary: ${issue.message}`));
      console.warn(pc.yellow(`[taro] Tip: ${issue.suggestion}`));
    }
  }
}

export function summarizeMockAnalysis(mockAnalysis: MockAnalysis | null): void {
  if (!mockAnalysis) {
    return;
  }

  const parts: string[] = [];
  if (mockAnalysis.source === "package-profile" && mockAnalysis.packagePath) {
    parts.push(`package=${mockAnalysis.packagePath}`);
  }

  if (mockAnalysis.repeatedTargets.length > 0) {
    parts.push(`${mockAnalysis.repeatedTargets.length} repeated target(s)`);
  }

  if (mockAnalysis.mutationLifecycles.length > 0) {
    parts.push(`${mockAnalysis.mutationLifecycles.length} mutation flow(s)`);
  }
  if (mockAnalysis.interactionContracts.length > 0) {
    parts.push(
      `${mockAnalysis.interactionContracts.length} interaction contract(s)`
    );
  }

  if (mockAnalysis.instabilityWarnings.length > 0) {
    parts.push(
      `${mockAnalysis.instabilityWarnings.length} stability warning(s)`
    );
  }
  if (mockAnalysis.boundaryProfiles.length > 0) {
    parts.push(`${mockAnalysis.boundaryProfiles.length} boundary profile(s)`);
  }

  if (parts.length === 0) {
    return;
  }

  log(pc.dim("[taro]") + ` Mock analysis: ${parts.join(", ")}`);

  const topRecommendation = mockAnalysis.recommendations[0];
  if (topRecommendation) {
    log(
      pc.dim("[taro]") +
        ` Mock hint: ${topRecommendation.kind} ${topRecommendation.target} (${topRecommendation.count} file(s))`
    );
  }

  const preferredSharedMock = Object.entries(
    mockAnalysis.preferredSharedMocks
  )[0];
  if (preferredSharedMock) {
    log(
      pc.dim("[taro]") +
        ` Shared mock preference: ${preferredSharedMock[0]} -> ${preferredSharedMock[1]}`
    );
  }

  if (mockAnalysis.forbidMocks.length > 0) {
    console.warn(
      pc.yellow(
        `[taro] Mock policy: forbidden targets ${mockAnalysis.forbidMocks.join(", ")}`
      )
    );
  }
  if (mockAnalysis.forbidBoundaryTargets.length > 0) {
    console.warn(
      pc.yellow(
        `[taro] Boundary policy: forbidden targets ${mockAnalysis.forbidBoundaryTargets.join(", ")}`
      )
    );
  }

  const topLifecycle = mockAnalysis.mutationLifecycles[0];
  if (topLifecycle) {
    log(
      pc.dim("[taro]") +
        ` Mutation lifecycle: ${topLifecycle.stages.join(" -> ")} in ${topLifecycle.file}`
    );
  }

  const topContract = mockAnalysis.interactionContracts[0];
  if (topContract) {
    log(
      pc.dim("[taro]") +
        ` Interaction contract: ${topContract.kind} (${topContract.states.join(", ")}) in ${topContract.file}`
    );
  }

  const topWarning = mockAnalysis.instabilityWarnings[0];
  if (topWarning) {
    console.warn(
      pc.yellow(
        `[taro] Mock stability: ${topWarning.reason} (${topWarning.file})`
      )
    );
  }
}

export function summarizeBoundaryWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] Boundary: ${warning}`));
  }
}

export function summarizeSuiteContracts(plan: JsSuitePlan): void {
  if (plan.contracts.length === 0) {
    return;
  }

  const primaryContract = plan.contracts[0]!;
  const synthesizedCount = plan.scenarios.filter(
    (scenario) => scenario.provenance === "synthesized-companion"
  ).length;

  log(
    pc.dim("[taro]") +
      ` Contract planner: ${primaryContract.kind}, confidence=${primaryContract.confidence}, synthesized=${synthesizedCount}`
  );
}

export function summarizeResolvedPackageProfile(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile) {
    console.warn(
      pc.yellow(
        "[taro] State profile: no matching package profile found; using generic defaults."
      )
    );
    return;
  }

  const parts = [
    `package=${packageProfile.packagePath}`,
    `runner=${packageProfile.effectiveRunner}`,
    `renderHelper=${packageProfile.effectiveRenderHelper?.name ?? "none"}`,
    `sharedMocks=${packageProfile.sharedMockFactories.length}`,
    `boundaries=${packageProfile.boundaryProfiles.length}`,
    `inlineMocks=${packageProfile.inlineSafeMockTargets.length}`,
  ];

  log(pc.dim("[taro]") + ` State profile: ${parts.join(", ")}`);
}
