import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { gradeExistingTest } from "#core/existing-test-grader.ts";
import {
  appendGradedTestRecord,
  findLatestExistingTestHistoryRecord,
} from "#core/graded-test-history.ts";
import { loadOrBootstrapTaroState } from "#core/state.ts";
import {
  findBestPackageProfile,
  normalizeGeneratedTestHistoryPath,
} from "#core/state-paths.ts";
import type { ExistingTestGradeResult } from "#types/existing-test-grade.ts";
import type { TaroState } from "#types/state.ts";

export interface GradePersistenceContext {
  packagePath: string;
  recordingFile: string | null;
}

export interface GradeRunnerResult {
  followUpComments: string[];
  matchedHistoryRecord:
    | TaroState["gradedTests"][number]
    | TaroState["generatedTests"][number]
    | null;
  matchedHistorySource: "graded" | "generated" | null;
  persistenceContext: GradePersistenceContext;
  gradeResult: ExistingTestGradeResult;
  testFile: string;
}

function formatTestTarget(projectRoot: string, testFile: string): string {
  return relative(projectRoot, resolve(testFile)).replace(/\\/g, "/");
}

function buildFallbackPersistenceContext(params: {
  projectRoot: string;
  state: TaroState;
  testFile: string;
}): GradePersistenceContext {
  const profile = findBestPackageProfile(
    params.state,
    formatTestTarget(params.projectRoot, params.testFile)
  );

  return { packagePath: profile?.packagePath ?? ".", recordingFile: null };
}

export function buildGradeFollowUpComments(
  gradeResult: ExistingTestGradeResult
): string[] {
  const comments = gradeResult.blockers.length
    ? [...gradeResult.blockers]
    : gradeResult.reasons
        .filter(
          (reason) =>
            reason.impact === "negative" &&
            (reason.severity === "blocker" || reason.weight >= 8)
        )
        .map((reason) => reason.message)
        .slice(0, 3);

  if (gradeResult.requiresReview && comments.length === 0) {
    return [
      `Manual review required (${gradeResult.total}/100, ${gradeResult.grade}).`,
    ];
  }

  if (comments.length === 0) {
    return ["No follow-up required."];
  }

  return [...new Set(comments)];
}

export async function runGradeForTestFile(params: {
  projectRoot: string;
  testFile: string;
}): Promise<GradeRunnerResult> {
  const resolvedTestFile = resolve(params.projectRoot, params.testFile);
  const code = await readFile(resolvedTestFile, "utf-8");
  const bootstrap = await loadOrBootstrapTaroState(params.projectRoot);
  const matchedHistory = findLatestExistingTestHistoryRecord(
    bootstrap.state,
    params.projectRoot,
    resolvedTestFile
  );
  const persistenceContext = matchedHistory
    ? {
        packagePath: matchedHistory.record.packagePath,
        recordingFile: matchedHistory.record.recordingFile ?? null,
      }
    : buildFallbackPersistenceContext({
        projectRoot: params.projectRoot,
        state: bootstrap.state,
        testFile: resolvedTestFile,
      });
  const gradeResult = gradeExistingTest(code);
  const normalizedTestFile = normalizeGeneratedTestHistoryPath(
    params.projectRoot,
    resolvedTestFile
  );

  await appendGradedTestRecord(params.projectRoot, {
    packagePath: persistenceContext.packagePath,
    recordingFile: persistenceContext.recordingFile,
    testFile: normalizedTestFile,
    gradeResult,
  });

  return {
    followUpComments: buildGradeFollowUpComments(gradeResult),
    matchedHistoryRecord: matchedHistory?.record ?? null,
    matchedHistorySource: matchedHistory?.source ?? null,
    persistenceContext,
    gradeResult,
    testFile: normalizedTestFile,
  };
}
