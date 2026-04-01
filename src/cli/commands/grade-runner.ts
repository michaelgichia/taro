import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { toImportPath } from "#cli/commands/generate-paths.ts";
import { loadComponentScoreContext } from "#core/component-score-context.ts";
import {
  findLatestExistingTestHistoryRecord,
} from "#core/graded-test-history.ts";
import {
  appendGeneratedTestRecord,
  runLoadOrBootstrapStateWorkflow,
} from "#core/state.ts";
import {
  findBestPackageProfile,
  normalizeGeneratedTestHistoryPath,
} from "#core/state-paths.ts";
import { scoreTestQuality } from "#core/test-quality-scorer.ts";
import type { ComponentScoreContext, ScoreResult } from "#types/score.ts";
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
  gradeResult: ScoreResult;
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
  gradeResult: ScoreResult
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

function normalizeComponentScoreContextForOutput(params: {
  componentPath: string;
  componentScoreContext: ComponentScoreContext | null;
  outputPath: string;
}): ComponentScoreContext | null {
  const { componentPath, componentScoreContext, outputPath } = params;
  if (!componentScoreContext) {
    return componentScoreContext;
  }

  const componentDir = dirname(componentPath);
  const outputDir = dirname(outputPath);
  const normalizeImportTarget = (target: string) =>
    target.startsWith("./") || target.startsWith("../")
      ? toImportPath(outputDir, resolve(componentDir, target))
      : target;

  return {
    ...componentScoreContext,
    componentImportReferences:
      componentScoreContext.componentImportReferences?.map((reference) => ({
        ...reference,
        target: normalizeImportTarget(reference.target),
      })) ?? [],
    dynamicImportTargets:
      componentScoreContext.dynamicImportTargets?.map(normalizeImportTarget) ??
      [],
  };
}

async function resolveRecordedComponentScoreContext(params: {
  projectRoot: string;
  recordingFile: string | null;
  testFile: string;
}): Promise<ComponentScoreContext | null> {
  if (!params.recordingFile) {
    return null;
  }

  const resolvedRecordingFile = resolve(
    params.projectRoot,
    params.recordingFile
  );
  const componentScoreContext =
    await loadComponentScoreContext(resolvedRecordingFile);

  return normalizeComponentScoreContextForOutput({
    componentPath: resolvedRecordingFile,
    componentScoreContext,
    outputPath: params.testFile,
  });
}

export async function runGradeForTestFile(params: {
  projectRoot: string;
  testFile: string;
}): Promise<GradeRunnerResult> {
  const resolvedTestFile = resolve(params.projectRoot, params.testFile);
  const code = await readFile(resolvedTestFile, "utf-8");
  const bootstrap = await runLoadOrBootstrapStateWorkflow(params.projectRoot);
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
  const componentScoreContext = await resolveRecordedComponentScoreContext({
    projectRoot: params.projectRoot,
    recordingFile: persistenceContext.recordingFile,
    testFile: resolvedTestFile,
  });
  const gradeResult = scoreTestQuality(code, {
    ...(componentScoreContext ?? {}),
    queryResults: [],
    queryEvidencePolicy: "code-only",
  });
  const normalizedTestFile = normalizeGeneratedTestHistoryPath(
    params.projectRoot,
    resolvedTestFile
  );

  await appendGeneratedTestRecord(params.projectRoot, {
    packagePath: persistenceContext.packagePath,
    recordingFile: persistenceContext.recordingFile,
    testFile: normalizedTestFile,
    scoreResult: gradeResult,
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
