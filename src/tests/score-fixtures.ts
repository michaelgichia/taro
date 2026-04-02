import type {
  ExistingTestGradeDimensions,
  ExistingTestGradeReason,
  ExistingTestGradeResult,
  ExistingTestGradeSignals,
} from "#types/existing-test-grade.ts";
import type {
  GenerationScoreResult,
  MarkerCoverageTotals,
  MarkerQualityGateState,
  MarkerReviewDiagnostics,
  ScoreDimensions,
  ScoreGradeLetter,
  ScoreReason,
  ScoreResult,
  ScoreSignals,
} from "#types/score.ts";
import type { TaroGeneratedTestRecord } from "#types/state.ts";

type GenerationScoreResultOverrides = Omit<
  Partial<GenerationScoreResult>,
  | "dimensions"
  | "signals"
  | "reasons"
  | "blockers"
  | "markerCoverage"
  | "markerDiagnostics"
  | "markerQualityGate"
> & {
  dimensions?: Partial<ScoreDimensions>;
  signals?: Partial<ScoreSignals>;
  reasons?: ScoreReason[];
  blockers?: string[];
  markerCoverage?: Partial<MarkerCoverageTotals>;
  markerDiagnostics?: Partial<MarkerReviewDiagnostics>;
  markerQualityGate?: Partial<MarkerQualityGateState>;
};

type ExistingTestGradeResultOverrides = Omit<
  Partial<ExistingTestGradeResult>,
  "dimensions" | "signals" | "reasons" | "blockers"
> & {
  dimensions?: Partial<ExistingTestGradeDimensions>;
  signals?: Partial<ExistingTestGradeSignals>;
  reasons?: ExistingTestGradeReason[];
  blockers?: string[];
};

function toGrade(total: number): ScoreGradeLetter {
  if (total >= 90) {
    return "A";
  }
  if (total >= 80) {
    return "B";
  }
  if (total >= 70) {
    return "C";
  }
  if (total >= 60) {
    return "D";
  }
  return "F";
}

export function makeScoreDimensions(
  overrides: Partial<ScoreDimensions> = {}
): ScoreDimensions {
  return {
    queryQuality: 80,
    assertionSpecificity: 80,
    testStructure: 80,
    boundaryIsolation: 80,
    ...overrides,
  };
}

export function makeScoreSignals(
  overrides: Partial<ScoreSignals> = {}
): ScoreSignals {
  return {
    queryCheckpointCount: 0,
    roleQueryCount: 0,
    testIdQueryCount: 0,
    strongAssertionCount: 0,
    presenceAssertionCount: 0,
    visibilityAssertionCount: 0,
    visibilityOnlyTestCount: 0,
    presenceOnlyTestCount: 0,
    boundaryWarningCount: 0,
    boundaryIssueCount: 0,
    placeholderRenderTarget: false,
    multipleTestBlocks: false,
    minimumExpectedTestCount: 0,
    branchCoverageRatio: 1,
    missingMockCount: 0,
    fireEventCount: 0,
    hasBasePropsConstant: false,
    hasOverrideRenderHelper: false,
    duplicatedInlineRenderCount: 0,
    hasStandaloneUtilityDescribe: false,
    ...overrides,
  };
}

export function makeMarkerCoverage(
  overrides: Partial<MarkerCoverageTotals> = {}
): MarkerCoverageTotals {
  return {
    detected: 0,
    emitted: 0,
    unresolved: 0,
    ...overrides,
  };
}

export function makeMarkerDiagnostics(
  overrides: Partial<MarkerReviewDiagnostics> = {}
): MarkerReviewDiagnostics {
  return {
    canonicalRecoveries: 0,
    placementConflicts: 0,
    placementCorrections: 0,
    ...overrides,
  };
}

export function makeMarkerQualityGate(
  overrides: Partial<MarkerQualityGateState> = {}
): MarkerQualityGateState {
  return {
    status: "pass",
    reason: "no-markers-detected",
    failing: false,
    message: "No assertion markers detected.",
    ...overrides,
  };
}

export function makeGenerationScoreResult(
  overrides: GenerationScoreResultOverrides = {}
): GenerationScoreResult {
  const total = overrides.total ?? 80;

  return {
    total,
    grade: overrides.grade ?? toGrade(total),
    dimensions: makeScoreDimensions(overrides.dimensions),
    signals: makeScoreSignals(overrides.signals),
    reasons: overrides.reasons ?? [],
    blockers: overrides.blockers ?? [],
    requiresReview: overrides.requiresReview ?? total < 80,
    markerCoverage: makeMarkerCoverage(overrides.markerCoverage),
    markerDiagnostics: makeMarkerDiagnostics(overrides.markerDiagnostics),
    markerQualityGate: makeMarkerQualityGate(overrides.markerQualityGate),
  };
}

export function makeExistingTestGradeDimensions(
  overrides: Partial<ExistingTestGradeDimensions> = {}
): ExistingTestGradeDimensions {
  return {
    robustness: 20,
    readability: 12,
    assertionStrength: 16,
    mockFidelity: 16,
    maintainability: 16,
    ...overrides,
  };
}

export function makeExistingTestGradeSignals(
  overrides: Partial<ExistingTestGradeSignals> = {}
): ExistingTestGradeSignals {
  return {
    roleQueryCount: 1,
    labelQueryCount: 0,
    placeholderQueryCount: 0,
    textQueryCount: 0,
    testIdQueryCount: 0,
    querySelectorCount: 0,
    positionalRoleQueryCount: 0,
    payloadAssertionCount: 1,
    strongAssertionCount: 1,
    presenceAssertionCount: 1,
    visibilityAssertionCount: 0,
    mockCallAssertionCount: 0,
    sharedMockImportCount: 0,
    passthroughModuleMockCount: 0,
    setupHelperCount: 1,
    renderHelperImportCount: 0,
    beforeEachCount: 1,
    mockResetCount: 1,
    lineCount: 20,
    ...overrides,
  };
}

export function makeExistingTestGradeResult(
  overrides: ExistingTestGradeResultOverrides = {}
): ExistingTestGradeResult {
  const total = overrides.total ?? 80;

  return {
    total,
    grade: overrides.grade ?? toGrade(total),
    dimensions: makeExistingTestGradeDimensions(overrides.dimensions),
    signals: makeExistingTestGradeSignals(overrides.signals),
    reasons: overrides.reasons ?? [],
    blockers: overrides.blockers ?? [],
    requiresReview: overrides.requiresReview ?? total < 80,
  };
}

export function makeHybridScoreResult(
  overrides: {
    blockers?: string[];
    dimensions?: Partial<ScoreDimensions>;
    grade?: ScoreGradeLetter;
    generation?: GenerationScoreResultOverrides;
    grading?: ExistingTestGradeResultOverrides;
    overall?: number;
    reasons?: ScoreReason[];
    requiresReview?: boolean;
    signals?: Partial<ScoreSignals>;
    total?: number;
  } = {}
): ScoreResult {
  const baseOverall = overrides.overall ?? overrides.total ?? 80;
  const generationDimensions =
    overrides.generation?.dimensions ?? overrides.dimensions ?? {};
  const generationSignals =
    overrides.generation?.signals ?? overrides.signals ?? {};
  const generation = makeGenerationScoreResult({
    total: overrides.generation?.total ?? baseOverall,
    grade: overrides.generation?.grade,
    dimensions: generationDimensions as Partial<ScoreDimensions>,
    signals: generationSignals as Partial<ScoreSignals>,
    reasons: overrides.generation?.reasons ?? overrides.reasons,
    blockers: overrides.generation?.blockers ?? overrides.blockers,
    requiresReview: overrides.generation?.requiresReview,
    markerCoverage: overrides.generation?.markerCoverage,
    markerDiagnostics: overrides.generation?.markerDiagnostics,
    markerQualityGate: overrides.generation?.markerQualityGate,
  });
  const grading = makeExistingTestGradeResult({
    total: overrides.grading?.total ?? baseOverall,
    grade: overrides.grading?.grade,
    dimensions: overrides.grading?.dimensions,
    signals: overrides.grading?.signals,
    reasons: overrides.grading?.reasons,
    blockers: overrides.grading?.blockers,
    requiresReview: overrides.grading?.requiresReview,
  });
  const overall =
    overrides.overall ??
    overrides.total ??
    Math.round((generation.total + grading.total) / 2);
  const blockers = [...new Set([...generation.blockers, ...grading.blockers])];

  return {
    overall,
    total: overall,
    grade: overrides.grade ?? toGrade(overall),
    requiresReview:
      overrides.requiresReview ??
      (generation.requiresReview || grading.requiresReview),
    blockers,
    families: {
      generation,
      grading,
    },
    dimensions: generation.dimensions,
    signals: generation.signals,
    reasons: generation.reasons,
    markerCoverage: generation.markerCoverage,
    markerDiagnostics: generation.markerDiagnostics,
    markerQualityGate: generation.markerQualityGate,
  };
}

export function makeGeneratedTestRecord(params: {
  createdAt?: string;
  overallSource?: TaroGeneratedTestRecord["quality"]["overallSource"];
  packagePath?: string;
  recordingFile?: string | null;
  requiresReview?: boolean;
  scoreResult?: ScoreResult;
  testFile: string;
}): TaroGeneratedTestRecord {
  const scoreResult = params.scoreResult ?? makeHybridScoreResult();

  return {
    createdAt: params.createdAt ?? "2026-03-20T08:00:00.000Z",
    packagePath: params.packagePath ?? ".",
    recordingFile: params.recordingFile ?? null,
    testFile: params.testFile,
    quality: {
      overall: scoreResult.overall,
      grade: scoreResult.grade,
      overallSource: params.overallSource ?? "hybrid",
      blockers: scoreResult.blockers,
      families: {
        generation:
          params.overallSource === "legacy-graded"
            ? null
            : scoreResult.families.generation,
        grading:
          params.overallSource === "legacy-generated"
            ? null
            : scoreResult.families.grading,
      },
    },
    requiresReview: params.requiresReview ?? scoreResult.requiresReview,
  };
}
