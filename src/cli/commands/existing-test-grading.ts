import pc from "picocolors";

import type { ExistingTestGradeResult } from "#types/existing-test-grade.ts";
import type { TaroState } from "#types/state.ts";

type ExistingTestHistoryRecord =
  | TaroState["gradedTests"][number]
  | TaroState["generatedTests"][number];

export interface ExistingTestSummaryInput {
  followUpComments: string[];
  matchedHistoryRecord: ExistingTestHistoryRecord | null;
  matchedHistorySource: "graded" | "generated" | null;
  scoreResult: ExistingTestGradeResult;
  testFile: string;
}

export function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function formatHistorySource(source: "graded" | "generated" | null): string {
  if (source === "graded") {
    return "gradedTests";
  }

  if (source === "generated") {
    return "generatedTests fallback";
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
    previousScore === null ? null : result.scoreResult.total - previousScore;
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
    `${pc.dim("[taro]")} Score: ${result.scoreResult.total}/100 (${result.scoreResult.grade}) — ` +
      `robustness ${result.scoreResult.dimensions.robustness}/25, ` +
      `readability ${result.scoreResult.dimensions.readability}/15, ` +
      `assertionStrength ${result.scoreResult.dimensions.assertionStrength}/20, ` +
      `mockFidelity ${result.scoreResult.dimensions.mockFidelity}/20, ` +
      `maintainability ${result.scoreResult.dimensions.maintainability}/20`
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
