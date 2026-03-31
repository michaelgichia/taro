import {
  buildGradeFollowUpComments,
  type GradePersistenceContext,
  runGradeForTestFile,
} from "#cli/commands/grade-runner.ts";
import type { ExistingTestGradeResult } from "#types/existing-test-grade.ts";
import type { TaroState } from "#types/state.ts";

export interface RegradeRunnerResult {
  followUpComments: string[];
  matchedGeneratedTestRecord:
    | TaroState["gradedTests"][number]
    | TaroState["generatedTests"][number]
    | null;
  matchedHistorySource: "graded" | "generated" | null;
  persistenceContext: GradePersistenceContext;
  scoreResult: ExistingTestGradeResult;
  testFile: string;
}

export function buildRegradeFollowUpComments(
  scoreResult: ExistingTestGradeResult
): string[] {
  return buildGradeFollowUpComments(scoreResult);
}

export async function runRegradeForTestFile(params: {
  projectRoot: string;
  testFile: string;
}): Promise<RegradeRunnerResult> {
  const result = await runGradeForTestFile(params);

  return {
    followUpComments: result.followUpComments,
    matchedGeneratedTestRecord: result.matchedHistoryRecord,
    matchedHistorySource: result.matchedHistorySource,
    persistenceContext: result.persistenceContext,
    scoreResult: result.gradeResult,
    testFile: result.testFile,
  };
}
