import {
  runLoadOrBootstrapStateWorkflow,
  refreshTaroState,
  writeTaroState,
} from "#core/state.ts";
import { normalizeGeneratedTestHistoryPath } from "#core/state-paths.ts";
import { trimGeneratedTestHistory } from "#core/state-weighting.ts";
import type { ExistingTestGradeResult } from "#types/existing-test-grade.ts";
import type {
  TaroGeneratedTestRecord,
  TaroGradedTestRecord,
  TaroState,
} from "#types/state.ts";
import { TARO_VERSION } from "#version.ts";

function findLatestRecordByPath<
  TRecord extends {
    createdAt: string;
    testFile: string;
    quality: { overall: number };
  },
>(records: TRecord[], projectRoot: string, testFile: string): TRecord | null {
  const normalizedTarget = normalizeGeneratedTestHistoryPath(
    projectRoot,
    testFile
  );
  let latestRecord: TRecord | null = null;
  let latestRecordCreatedAtMs = -1;

  for (const record of records) {
    if (
      normalizeGeneratedTestHistoryPath(projectRoot, record.testFile) !==
      normalizedTarget
    ) {
      continue;
    }

    const createdAtMs = Number.isFinite(Date.parse(record.createdAt))
      ? Date.parse(record.createdAt)
      : 0;
    if (
      latestRecord === null ||
      createdAtMs > latestRecordCreatedAtMs ||
      (createdAtMs === latestRecordCreatedAtMs &&
        record.quality.overall >= latestRecord.quality.overall)
    ) {
      latestRecord = record;
      latestRecordCreatedAtMs = createdAtMs;
    }
  }

  return latestRecord;
}

function trimGradedTestHistory(
  projectRoot: string,
  gradedTests: TaroGradedTestRecord[]
): TaroGradedTestRecord[] {
  return trimGeneratedTestHistory(
    projectRoot,
    gradedTests as unknown as TaroGeneratedTestRecord[]
  ) as unknown as TaroGradedTestRecord[];
}

export function findLatestGradedTestRecord(
  gradedTests: TaroState["gradedTests"],
  projectRoot: string,
  testFile: string
): TaroState["gradedTests"][number] | null {
  return findLatestRecordByPath(gradedTests, projectRoot, testFile);
}

export function findLatestGeneratedTestRecordFallback(
  generatedTests: TaroState["generatedTests"],
  projectRoot: string,
  testFile: string
): TaroState["generatedTests"][number] | null {
  return findLatestRecordByPath(generatedTests, projectRoot, testFile);
}

export function findLatestExistingTestHistoryRecord(
  state: TaroState,
  projectRoot: string,
  testFile: string
):
  | { source: "graded"; record: TaroGradedTestRecord }
  | { source: "generated"; record: TaroGeneratedTestRecord }
  | null {
  const generatedRecord = findLatestGeneratedTestRecordFallback(
    state.generatedTests,
    projectRoot,
    testFile
  );
  if (generatedRecord) {
    return { source: "generated", record: generatedRecord };
  }

  const gradedRecord = findLatestGradedTestRecord(
    state.gradedTests,
    projectRoot,
    testFile
  );
  if (gradedRecord) {
    return { source: "graded", record: gradedRecord };
  }

  return null;
}

export async function appendGradedTestRecord(
  projectRoot: string,
  record: {
    packagePath: string;
    recordingFile?: string | null;
    testFile: string;
    gradeResult: ExistingTestGradeResult;
  }
): Promise<void> {
  const bootstrap = await runLoadOrBootstrapStateWorkflow(projectRoot);
  const createdAt = new Date().toISOString();
  const normalizedTestFile = normalizeGeneratedTestHistoryPath(
    projectRoot,
    record.testFile
  );
  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: createdAt,
      taroVersion: TARO_VERSION,
    },
    generatedTests: trimGeneratedTestHistory(projectRoot, [
      ...bootstrap.state.generatedTests,
      {
        createdAt,
        packagePath: record.packagePath,
        recordingFile: record.recordingFile ?? null,
        testFile: normalizedTestFile,
        quality: {
          overall: record.gradeResult.total,
          grade: record.gradeResult.grade,
          overallSource: "legacy-graded",
          blockers: record.gradeResult.blockers,
          families: {
            generation: null,
            grading: record.gradeResult,
          },
        },
        requiresReview: record.gradeResult.requiresReview,
      },
    ]),
  };

  await writeTaroState(projectRoot, nextState);
  await refreshTaroState(projectRoot);
}
