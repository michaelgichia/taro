import { TARGET_OUTPUT_SCORE_GATE } from "#core/state.constants.ts";

export interface ScoreGateConfig {
  enforceRequiresReview: boolean;
  minScore: number;
}

export function formatScore(value: number): string {
  const fixed = Number.parseFloat(value.toFixed(2));
  return String(fixed);
}

export function parseMinScoreOption(rawValue: unknown): number | null {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const value =
    typeof rawValue === "number" ? String(rawValue) : String(rawValue).trim();
  if (value.length === 0) {
    throw new Error(
      "Invalid --min-score value. Provide a number between 0 and 100."
    );
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(
      `Invalid --min-score value: ${value}. Provide a number between 0 and 100.`
    );
  }

  return parsed;
}

export function resolveTargetScoreGateConfig(
  minScore: number | null | undefined
): ScoreGateConfig {
  if (typeof minScore === "number") {
    return { minScore, enforceRequiresReview: false };
  }

  return {
    minScore: TARGET_OUTPUT_SCORE_GATE * 100,
    enforceRequiresReview: true,
  };
}

export function passesScoreGate(
  scoreResult: { requiresReview: boolean; total: number },
  scoreGate: ScoreGateConfig
): boolean {
  return (
    scoreResult.total >= scoreGate.minScore &&
    (!scoreGate.enforceRequiresReview || !scoreResult.requiresReview)
  );
}
