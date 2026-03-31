import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { scoreGeneratedTest } from "#core/scorer.ts";
import { findBestPackageProfile, normalizeGeneratedTestHistoryPath } from "#core/state-paths.ts";
import {
  appendGeneratedTestRecord,
  findLatestGeneratedTestRecord,
  loadOrBootstrapTaroState,
} from "#core/state.ts";
import type { ScoreResult } from "#types/score.ts";
import type { TaroState } from "#types/state.ts";

export interface RegradePersistenceContext {
  packagePath: string;
  recordingFile: string | null;
}

export interface RegradeRunnerResult {
  followUpComments: string[];
  matchedGeneratedTestRecord: TaroState["generatedTests"][number] | null;
  persistenceContext: RegradePersistenceContext;
  scoreResult: ScoreResult;
  testFile: string;
}

function formatTestTarget(projectRoot: string, testFile: string): string {
  return relative(projectRoot, resolve(testFile)).replace(/\\/g, "/");
}

function buildFallbackPersistenceContext(params: {
  projectRoot: string;
  state: TaroState;
  testFile: string;
}): RegradePersistenceContext {
  const profile = findBestPackageProfile(
    params.state,
    formatTestTarget(params.projectRoot, params.testFile)
  );

  return {
    packagePath: profile?.packagePath ?? ".",
    recordingFile: null,
  };
}

export function buildRegradeFollowUpComments(scoreResult: ScoreResult): string[] {
  const comments = scoreResult.blockers.length
    ? [...scoreResult.blockers]
    : scoreResult.reasons
        .filter(
          (reason) =>
            reason.impact === "negative" &&
            (reason.severity === "blocker" || reason.weight >= 10)
        )
        .map((reason) => reason.message)
        .slice(0, 3);

  if (scoreResult.requiresReview && comments.length === 0) {
    return [
      `Manual review required (${scoreResult.total}/100, ${scoreResult.grade}).`,
    ];
  }

  if (comments.length === 0) {
    return ["No follow-up required."];
  }

  return [...new Set(comments)];
}

export async function runRegradeForTestFile(params: {
  projectRoot: string;
  testFile: string;
}): Promise<RegradeRunnerResult> {
  const resolvedTestFile = resolve(params.projectRoot, params.testFile);
  const code = await readFile(resolvedTestFile, "utf-8");
  const bootstrap = await loadOrBootstrapTaroState(params.projectRoot);
  const matchedGeneratedTestRecord = findLatestGeneratedTestRecord(
    bootstrap.state.generatedTests,
    params.projectRoot,
    resolvedTestFile
  );
  const persistenceContext = matchedGeneratedTestRecord
    ? {
        packagePath: matchedGeneratedTestRecord.packagePath,
        recordingFile: matchedGeneratedTestRecord.recordingFile ?? null,
      }
    : buildFallbackPersistenceContext({
        projectRoot: params.projectRoot,
        state: bootstrap.state,
        testFile: resolvedTestFile,
      });
  const scoreResult = scoreGeneratedTest(code);

  await appendGeneratedTestRecord(params.projectRoot, {
    packagePath: persistenceContext.packagePath,
    recordingFile: persistenceContext.recordingFile,
    testFile: normalizeGeneratedTestHistoryPath(
      params.projectRoot,
      resolvedTestFile
    ),
    scoreResult,
  });

  return {
    followUpComments: buildRegradeFollowUpComments(scoreResult),
    matchedGeneratedTestRecord,
    persistenceContext,
    scoreResult,
    testFile: normalizeGeneratedTestHistoryPath(
      params.projectRoot,
      resolvedTestFile
    ),
  };
}
