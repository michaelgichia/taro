import pc from "picocolors";

import type { ScoreResult } from "#types/score.ts";
import type { TaroState } from "#types/state.ts";

type ExistingTestHistoryRecord =
  | TaroState["gradedTests"][number]
  | TaroState["generatedTests"][number];

export interface ExistingTestSummaryInput {
  followUpComments: string[];
  matchedHistoryRecord: ExistingTestHistoryRecord | null;
  matchedHistorySource: "graded" | "generated" | null;
  scoreResult: ScoreResult;
  testFile: string;
}

export function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function formatHistorySource(source: "graded" | "generated" | null): string {
  if (source === "generated") {
    return "generatedTests";
  }

  if (source === "graded") {
    return "gradedTests fallback";
  }

  return "none";
}

function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `${delta}`;
}

export function buildSingleFileExistingTestSummaryLines(params: {
  mode: "grade" | "regrade";
  result: ExistingTestSummaryInput;
}): string[] {
  const verb = params.mode === "grade" ? "Grade" : "Regrade";
  const pastTenseVerb = params.mode === "grade" ? "Graded" : "Regraded";
  const { result } = params;
  const previousScore = result.matchedHistoryRecord?.quality.overall ?? null;
  const previousGrade = result.matchedHistoryRecord?.quality.grade ?? null;
  const delta =
    previousScore === null ? null : result.scoreResult.overall - previousScore;
  const lines = [
    `${pc.dim("[taro]")} ${verb} single-file mode enabled`,
    `${pc.dim("[taro]")} ${pastTenseVerb} ${result.testFile}`,
  ];

  if (previousScore === null || previousGrade === null) {
    lines.push(`${pc.dim("[taro]")} Previous snapshot: none`);
  } else {
    lines.push(
      `${pc.dim("[taro]")} Previous snapshot (${formatHistorySource(result.matchedHistorySource)}): ${previousScore}/100 (${previousGrade})`
    );
  }

  lines.push(
    `${pc.dim("[taro]")} Score: ${result.scoreResult.overall}/100 (${result.scoreResult.grade}) — ` +
      `generation ${result.scoreResult.families.generation.total}, ` +
      `grading ${result.scoreResult.families.grading.total}`
  );
  lines.push(
    `${pc.dim("[taro]")} Generation: ` +
      `query ${result.scoreResult.families.generation.dimensions.queryQuality}, ` +
      `assertions ${result.scoreResult.families.generation.dimensions.assertionSpecificity}, ` +
      `structure ${result.scoreResult.families.generation.dimensions.testStructure}, ` +
      `boundary ${result.scoreResult.families.generation.dimensions.boundaryIsolation}`
  );
  lines.push(
    `${pc.dim("[taro]")} Grading: ` +
      `robustness ${result.scoreResult.families.grading.dimensions.robustness}, ` +
      `readability ${result.scoreResult.families.grading.dimensions.readability}, ` +
      `assertionStrength ${result.scoreResult.families.grading.dimensions.assertionStrength}, ` +
      `mockFidelity ${result.scoreResult.families.grading.dimensions.mockFidelity}, ` +
      `maintainability ${result.scoreResult.families.grading.dimensions.maintainability}`
  );

  if (delta !== null) {
    lines.push(`${pc.dim("[taro]")} Delta: ${formatDelta(delta)}`);
  }

  lines.push(`${pc.dim("[taro]")} .taro/state.json updated`);

  for (const comment of result.followUpComments) {
    lines.push(`${pc.dim("[taro]")} Follow-up: ${comment}`);
  }

  return lines;
}
