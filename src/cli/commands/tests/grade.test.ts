import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGradeCommand } from "#cli/commands/grade.ts";
import type { GradeRunnerResult } from "#cli/commands/grade-runner.ts";
import type { ScoreResult } from "#types/score.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

class ProcessExitSignal {
  constructor(public readonly code: number) {}
}

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-grade-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function runGrade(
  args: string[],
  cwdPath: string,
  context?: Parameters<typeof createGradeCommand>[0]
) {
  const command = createGradeCommand(context);
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0);
    });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const originalCwd = process.cwd();
  let thrown: unknown;
  let exitCode: number | undefined;

  process.chdir(cwdPath);

  try {
    await command.parseAsync(args, { from: "user" });
  } catch (error) {
    if (error instanceof ProcessExitSignal) {
      exitCode = error.code;
    } else {
      thrown = error;
    }
  } finally {
    process.chdir(originalCwd);
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }

  return {
    errors: stripVTControlCharacters(errorSpy.mock.calls.flat().join("\n")),
    exitCode,
    logs: stripVTControlCharacters(stderrChunks.join("")),
    stdout: stripVTControlCharacters(stdoutChunks.join("")),
    thrown,
    warnings: stripVTControlCharacters(warnSpy.mock.calls.flat().join("\n")),
  };
}

function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  const total = overrides.total ?? 84;

  return {
    total,
    grade:
      overrides.grade ??
      (total >= 90
        ? "A"
        : total >= 80
          ? "B"
          : total >= 70
            ? "C"
            : total >= 60
              ? "D"
              : "F"),
    dimensions: {
      queryQuality: 100,
      assertionSpecificity: 84,
      testStructure: 76,
      boundaryIsolation: 76,
      ...overrides.dimensions,
    },
    signals: {
      queryCheckpointCount: 0,
      roleQueryCount: 1,
      testIdQueryCount: 0,
      strongAssertionCount: 1,
      presenceAssertionCount: 1,
      visibilityAssertionCount: 0,
      visibilityOnlyTestCount: 0,
      presenceOnlyTestCount: 0,
      boundaryWarningCount: 0,
      boundaryIssueCount: 0,
      placeholderRenderTarget: false,
      multipleTestBlocks: true,
      minimumExpectedTestCount: 1,
      branchCoverageRatio: 1,
      missingMockCount: 0,
      fireEventCount: 0,
      hasBasePropsConstant: true,
      hasOverrideRenderHelper: true,
      duplicatedInlineRenderCount: 0,
      hasStandaloneUtilityDescribe: false,
      ...overrides.signals,
    },
    reasons: overrides.reasons ?? [],
    blockers: overrides.blockers ?? [],
    requiresReview: overrides.requiresReview ?? total < 80,
    markerCoverage: {
      detected: 0,
      emitted: 0,
      unresolved: 0,
      ...overrides.markerCoverage,
    },
    markerDiagnostics: {
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
      ...overrides.markerDiagnostics,
    },
    markerQualityGate: {
      status: "pass",
      reason: "no-markers-detected",
      failing: false,
      message: "No assertion markers detected.",
      ...overrides.markerQualityGate,
    },
  };
}

function makeRunnerResult(params: {
  followUpComments?: string[];
  matchedHistoryRecord?: GradeRunnerResult["matchedHistoryRecord"];
  matchedHistorySource?: GradeRunnerResult["matchedHistorySource"];
  testFile: string;
}): GradeRunnerResult {
  const gradeResult = makeScoreResult();

  return {
    followUpComments: params.followUpComments ?? ["No follow-up required."],
    matchedHistoryRecord: params.matchedHistoryRecord ?? null,
    matchedHistorySource: params.matchedHistorySource ?? null,
    persistenceContext: { packagePath: ".", recordingFile: null },
    gradeResult,
    testFile: params.testFile,
  };
}

describe("createGradeCommand", () => {
  it("rejects directory input", async () => {
    const root = await createSandbox("reject-directory");
    const testsDir = join(root, "src", "tests");
    await mkdir(testsDir, { recursive: true });

    const result = await runGrade([testsDir], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain(
      "Directory input is not supported by __grade"
    );
  });

  it("grades a single test file via the shared runtime runner", async () => {
    const root = await createSandbox("single-file");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");
    await mkdir(dirname(testFile), { recursive: true });
    await writeFile(testFile, "describe('CheckoutFlow', () => {})\n", "utf-8");

    const previousRecord = {
      createdAt: "2026-03-31T09:00:00.000Z",
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      quality: {
        overall: 72,
        grade: "C" as const,
        dimensions: {
          queryQuality: 72,
          assertionSpecificity: 72,
          testStructure: 72,
          boundaryIsolation: 72,
        },
        signals: {
          queryCheckpointCount: 0,
          roleQueryCount: 1,
          testIdQueryCount: 0,
          strongAssertionCount: 1,
          presenceAssertionCount: 1,
          visibilityAssertionCount: 0,
          visibilityOnlyTestCount: 0,
          presenceOnlyTestCount: 0,
          boundaryWarningCount: 0,
          boundaryIssueCount: 0,
          placeholderRenderTarget: false,
          multipleTestBlocks: false,
          minimumExpectedTestCount: 1,
          branchCoverageRatio: 1,
          missingMockCount: 0,
          fireEventCount: 0,
          hasBasePropsConstant: false,
          hasOverrideRenderHelper: false,
          duplicatedInlineRenderCount: 0,
          hasStandaloneUtilityDescribe: false,
        },
        reasons: [],
      },
      requiresReview: true,
    };

    const result = await runGrade([testFile], root, {
      runGradeTestFile: async ({ testFile }) =>
        makeRunnerResult({
          followUpComments: ["Tighten the success assertions."],
          matchedHistoryRecord: previousRecord,
          matchedHistorySource: "generated",
          testFile,
        }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Grade single-file mode enabled");
    expect(result.logs).toContain("Previous snapshot (generatedTests): 72/100 (C)");
    expect(result.logs).toContain("Score: 84/100 (B)");
    expect(result.logs).toContain("Delta: +12");
    expect(result.logs).toContain("Follow-up: Tighten the success assertions.");
  });
});
