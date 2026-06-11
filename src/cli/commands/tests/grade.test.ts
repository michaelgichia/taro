import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGradeCommand } from "#cli/commands/grade.ts";
import type { GradeRunnerResult } from "#cli/commands/grade-runner.ts";
import {
  makeGeneratedTestRecord,
  makeHybridScoreResult,
} from "#tests/score-fixtures.ts";

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

function makeRunnerResult(params: {
  followUpComments?: string[];
  matchedHistoryRecord?: GradeRunnerResult["matchedHistoryRecord"];
  matchedHistorySource?: GradeRunnerResult["matchedHistorySource"];
  testFile: string;
}): GradeRunnerResult {
  const gradeResult = makeHybridScoreResult({
    overall: 84,
    generation: {
      total: 84,
      dimensions: {
        queryQuality: 100,
        assertionSpecificity: 84,
        testStructure: 76,
        boundaryIsolation: 76,
      },
      signals: {
        roleQueryCount: 1,
        strongAssertionCount: 1,
        presenceAssertionCount: 1,
        multipleTestBlocks: true,
        minimumExpectedTestCount: 1,
        hasBasePropsConstant: true,
        hasOverrideRenderHelper: true,
      },
    },
    grading: { total: 84 },
  });

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

    const previousRecord = makeGeneratedTestRecord({
      createdAt: "2026-03-31T09:00:00.000Z",
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      scoreResult: makeHybridScoreResult({
        overall: 72,
        generation: { total: 72 },
        grading: { total: 72 },
        requiresReview: true,
      }),
      testFile,
    });

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
    expect(result.logs).toContain(
      "Previous snapshot (generatedTests): 72/100 (C)"
    );
    expect(result.logs).toContain("Score: 84/100 (B)");
    expect(result.logs).toContain("Delta: +12");
    expect(result.logs).toContain("Follow-up: Tighten the success assertions.");
  });
});
