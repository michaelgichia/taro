import { gradeExistingTest } from "#core/existing-test-grader.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import type {
  GenerationScoreResult,
  ScoreGeneratedTestOptions,
  ScoreGradeLetter,
  ScoreResult,
} from "#types/score.ts";

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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function hasBlockerSeverity<
  TReason extends { impact: "positive" | "negative"; severity?: string },
>(reasons: TReason[]): boolean {
  return reasons.some(
    (reason) => reason.impact === "negative" && reason.severity === "blocker"
  );
}

export function mergeScoreFamilies(params: {
  generation: GenerationScoreResult;
  grading: ReturnType<typeof gradeExistingTest>;
}): ScoreResult {
  const overall = Math.round(
    (params.generation.total + params.grading.total) / 2
  );
  const blockers = dedupe([
    ...params.generation.blockers,
    ...params.grading.blockers,
  ]);
  const requiresReview =
    params.generation.requiresReview ||
    params.grading.requiresReview ||
    hasBlockerSeverity(params.generation.reasons) ||
    hasBlockerSeverity(params.grading.reasons);

  return {
    overall,
    total: overall,
    grade: toGrade(overall),
    requiresReview,
    blockers,
    families: { generation: params.generation, grading: params.grading },
    dimensions: params.generation.dimensions,
    signals: params.generation.signals,
    reasons: params.generation.reasons,
    markerCoverage: params.generation.markerCoverage,
    markerDiagnostics: params.generation.markerDiagnostics,
    markerQualityGate: params.generation.markerQualityGate,
  };
}

export function scoreTestQuality(
  code: string,
  input:
    | import("#types/recording.ts").QueryResult[]
    | ScoreGeneratedTestOptions = []
): ScoreResult {
  const generation = scoreGeneratedTest(code, input);
  const grading = gradeExistingTest(code);

  return mergeScoreFamilies({ generation, grading });
}
