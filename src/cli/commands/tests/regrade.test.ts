import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegradeCommand } from "#cli/commands/regrade.ts";
import type { RegradeRunnerResult } from "#cli/commands/regrade-runner.ts";
import {
  createDirectoryLoopTracker,
  writeDirectoryLoopTracker,
} from "#cli/commands/target-directory-tracker.ts";
import { appendGeneratedTestRecord, runLoadOrBootstrapStateWorkflow, writeTaroState } from "#core/state.ts";
import {
  makeExistingTestGradeResult,
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
  const root = await mkdtemp(join(tmpdir(), `taro-regrade-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function readDirectoryTracker(logs: string) {
  const trackerPathMatch = logs.match(/Directory loop tracker: (.+)/u);
  if (!trackerPathMatch) {
    throw new Error(`Could not find tracker path in logs:\n${logs}`);
  }

  return readFile(trackerPathMatch[1].trim(), "utf-8");
}

async function runRegrade(
  args: string[],
  cwdPath: string,
  context?: Parameters<typeof createRegradeCommand>[0]
) {
  const command = createRegradeCommand(context);
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
  matchedGeneratedTestRecord?: RegradeRunnerResult["matchedGeneratedTestRecord"];
  matchedHistorySource?: RegradeRunnerResult["matchedHistorySource"];
  scoreResult?: Partial<ScoreResult>;
  testFile: string;
}): RegradeRunnerResult {
  const scoreResult = makeScoreResult(params.scoreResult);

  return {
    followUpComments:
      params.followUpComments ??
      (scoreResult.requiresReview
        ? [
            `Manual review required (${scoreResult.total}/100, ${scoreResult.grade}).`,
          ]
        : ["No follow-up required."]),
    matchedGeneratedTestRecord: params.matchedGeneratedTestRecord ?? null,
    matchedHistorySource: params.matchedHistorySource ?? null,
    persistenceContext: { packagePath: ".", recordingFile: null },
    scoreResult,
    testFile: params.testFile,
  };
}

function makeScoreResult(overrides: Record<string, unknown> = {}) {
  const typedOverrides = overrides as {
    blockers?: string[];
    dimensions?: Record<string, number>;
    grade?: "A" | "B" | "C" | "D" | "F";
    markerCoverage?: Record<string, number>;
    markerDiagnostics?: Record<string, number>;
    markerQualityGate?: Record<string, unknown>;
    reasons?: unknown[];
    requiresReview?: boolean;
    signals?: Record<string, unknown>;
    total?: number;
  };
  const total = typedOverrides.total ?? 80;

  return makeHybridScoreResult({
    overall: total,
    grade: typedOverrides.grade,
    blockers: typedOverrides.blockers,
    dimensions: typedOverrides.dimensions as any,
    reasons: typedOverrides.reasons as any,
    requiresReview: typedOverrides.requiresReview,
    signals: typedOverrides.signals as any,
    generation: {
      total,
      markerCoverage: typedOverrides.markerCoverage as any,
      markerDiagnostics: typedOverrides.markerDiagnostics as any,
      markerQualityGate: typedOverrides.markerQualityGate as any,
    },
    grading: { total },
  });
}

async function seedGeneratedTestRecord(
  root: string,
  outputPath: string,
  overrides: Partial<ScoreResult> = {}
) {
  await appendGeneratedTestRecord(root, {
    packagePath: ".",
    recordingFile: outputPath,
    testFile: outputPath,
    scoreResult: makeScoreResult(overrides),
  });
}

async function seedDirectoryLoopTracker(params: {
  directoryPath: string;
  entries: Array<{
    componentPath: string;
    currentScoreThreshold?: number | null;
    followUpComments?: string[];
    outputPath: string;
    status?: "pending" | "in-progress" | "completed";
    updatedScoreThreshold?: number | null;
  }>;
  root: string;
}) {
  await writeDirectoryLoopTracker(
    createDirectoryLoopTracker({
      directoryPath: params.directoryPath,
      entries: params.entries.map((entry) => ({ ...entry, kind: "regrade" })),
      projectRoot: params.root,
    })
  );
}

describe("createRegradeCommand", () => {
  it("rejects directory input unless --directory-loop is passed", async () => {
    const root = await createSandbox("dir-requires-flag");
    const testsDir = join(root, "src", "tests");
    await mkdir(testsDir, { recursive: true });
    await writeFile(
      join(testsDir, "CheckoutFlow.test.tsx"),
      "describe('CheckoutFlow', () => {})\n",
      "utf-8"
    );

    const result = await runRegrade([testsDir], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain("Directory input requires --directory-loop");
  });

  it("rejects --directory-loop when the target is a single file", async () => {
    const root = await createSandbox("file-rejects-dir-flag");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");
    await mkdir(dirname(testFile), { recursive: true });
    await writeFile(testFile, "describe('CheckoutFlow', () => {})\n", "utf-8");

    const result = await runRegrade([testFile, "--directory-loop"], root);

    expect(result.exitCode).toBe(2);
    expect(result.logs).toContain(
      "--directory-loop is only valid when the target path is a directory"
    );
  });

  it("completes queued test files sequentially and excludes non-test files", async () => {
    const root = await createSandbox("discovery");
    const testsDir = join(root, "src", "tests");
    const calls: string[] = [];
    await mkdir(join(testsDir, "nested"), { recursive: true });
    await writeFile(
      join(testsDir, "CheckoutFlow.test.tsx"),
      "describe('CheckoutFlow', () => {})\n",
      "utf-8"
    );
    await writeFile(
      join(testsDir, "nested", "Orders.spec.ts"),
      "describe('Orders', () => {})\n",
      "utf-8"
    );
    await writeFile(
      join(testsDir, "CheckoutFlow.tsx"),
      "export default function CheckoutFlow() { return null }\n",
      "utf-8"
    );
    await writeFile(
      join(testsDir, "helper.ts"),
      "export const helper = true\n",
      "utf-8"
    );

    const result = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) => {
        calls.push(testFile.replace(/\\/g, "/"));
        if (testFile.endsWith("Orders.spec.ts")) {
          return makeRunnerResult({
            followUpComments: [
              "Manual review required (67/100, D).",
              "Strengthen assertions.",
            ],
            scoreResult: { requiresReview: true, total: 67 },
            testFile,
          });
        }

        return makeRunnerResult({ scoreResult: { total: 92 }, testFile });
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/src\/tests\/CheckoutFlow\.test\.tsx$/u);
    expect(calls[1]).toMatch(/src\/tests\/nested\/Orders\.spec\.ts$/u);
    expect(result.logs).toContain("Regrade directory loop mode enabled");
    expect(result.logs).toContain("Directory loop tracker:");
    expect(result.logs).toContain("Queued 2 pending test files for regrade");
    expect(result.logs).toContain("Processing 2 pending test files");
    expect(result.logs).toContain(
      "Regrade directory loop tracker is complete; no pending test files remain."
    );
    expect(tracker).toContain(
      "| completed | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | - | 92% | No follow-up required. | regrade |"
    );
    expect(tracker).toContain(
      "| completed | src/tests/nested/Orders.spec.ts | src/tests/nested/Orders.spec.ts | - | 67% | Manual review required (67/100, D).<br>Strengthen assertions. | regrade |"
    );
    expect(tracker).not.toContain("CheckoutFlow.tsx");
    expect(tracker).not.toContain("helper.ts");
  });

  it("writes previous and updated score thresholds into completed tracker rows", async () => {
    const root = await createSandbox("stored-threshold");
    const testsDir = join(root, "src", "tests");
    const checkoutTest = join(testsDir, "CheckoutFlow.test.tsx");
    await mkdir(testsDir, { recursive: true });
    await writeFile(
      checkoutTest,
      "describe('CheckoutFlow', () => {})\n",
      "utf-8"
    );
    await seedGeneratedTestRecord(root, checkoutTest, { total: 87 });

    const result = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) =>
        makeRunnerResult({ scoreResult: { total: 93 }, testFile }),
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(tracker).toContain(
      "| completed | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | 87% | 93% | No follow-up required. | regrade |"
    );
  });

  it("skips completed rows and retries an existing in-progress row first on rerun", async () => {
    const root = await createSandbox("resume-rerun");
    const testsDir = join(root, "src", "tests");
    const calls: string[] = [];
    const alphaTest = join(testsDir, "Alpha.test.tsx");
    const betaTest = join(testsDir, "Beta.spec.ts");
    const gammaTest = join(testsDir, "Gamma.test.tsx");
    await mkdir(testsDir, { recursive: true });
    await writeFile(alphaTest, "describe('Alpha', () => {})\n", "utf-8");
    await writeFile(betaTest, "describe('Beta', () => {})\n", "utf-8");
    await writeFile(gammaTest, "describe('Gamma', () => {})\n", "utf-8");
    await seedDirectoryLoopTracker({
      directoryPath: testsDir,
      entries: [
        {
          componentPath: alphaTest,
          currentScoreThreshold: 90,
          followUpComments: ["No follow-up required."],
          outputPath: alphaTest,
          status: "completed",
          updatedScoreThreshold: 90,
        },
        {
          componentPath: betaTest,
          currentScoreThreshold: 71,
          outputPath: betaTest,
          status: "in-progress",
        },
        { componentPath: gammaTest, outputPath: gammaTest, status: "pending" },
      ],
      root,
    });

    const result = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) => {
        calls.push(testFile.replace(/\\/g, "/"));

        if (testFile.endsWith("Beta.spec.ts")) {
          return makeRunnerResult({ scoreResult: { total: 88 }, testFile });
        }

        return makeRunnerResult({ scoreResult: { total: 79 }, testFile });
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/src\/tests\/Beta\.spec\.ts$/u);
    expect(calls[1]).toMatch(/src\/tests\/Gamma\.test\.tsx$/u);
    expect(tracker).toContain(
      "| completed | src/tests/Alpha.test.tsx | src/tests/Alpha.test.tsx | - | 90% | No follow-up required. | regrade |"
    );
    expect(tracker).toContain(
      "| completed | src/tests/Beta.spec.ts | src/tests/Beta.spec.ts | - | 88% | No follow-up required. | regrade |"
    );
    expect(tracker).toContain(
      "| completed | src/tests/Gamma.test.tsx | src/tests/Gamma.test.tsx | - | 79% | Manual review required (79/100, C). | regrade |"
    );
  });

  it("stops on the current test when regrade execution fails", async () => {
    const root = await createSandbox("failure-stop");
    const testsDir = join(root, "src", "tests");
    const alphaTest = join(testsDir, "Alpha.test.tsx");
    const betaTest = join(testsDir, "Beta.test.tsx");
    const calls: string[] = [];
    await mkdir(testsDir, { recursive: true });
    await writeFile(alphaTest, "describe('Alpha', () => {})\n", "utf-8");
    await writeFile(betaTest, "describe('Beta', () => {})\n", "utf-8");

    const result = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) => {
        calls.push(testFile.replace(/\\/g, "/"));
        throw new Error("runner blew up");
      },
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/src\/tests\/Alpha\.test\.tsx$/u);
    expect(result.logs).toContain(
      "Regrade directory loop stopped on src/tests/Alpha.test.tsx: runner blew up"
    );
    expect(tracker).toContain(
      "| in-progress | src/tests/Alpha.test.tsx | src/tests/Alpha.test.tsx | - | - | - | regrade |"
    );
    expect(tracker).toContain(
      "| pending | src/tests/Beta.test.tsx | src/tests/Beta.test.tsx | - | - | - | regrade |"
    );
  });

  it("retries the failed in-progress test before continuing on rerun", async () => {
    const root = await createSandbox("failure-rerun");
    const testsDir = join(root, "src", "tests");
    const alphaTest = join(testsDir, "Alpha.test.tsx");
    const betaTest = join(testsDir, "Beta.test.tsx");
    const firstRunCalls: string[] = [];
    const secondRunCalls: string[] = [];
    await mkdir(testsDir, { recursive: true });
    await writeFile(alphaTest, "describe('Alpha', () => {})\n", "utf-8");
    await writeFile(betaTest, "describe('Beta', () => {})\n", "utf-8");

    const firstRun = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) => {
        firstRunCalls.push(testFile.replace(/\\/g, "/"));
        throw new Error("temporary failure");
      },
    });

    expect(firstRun.exitCode).toBe(1);
    expect(firstRunCalls).toHaveLength(1);
    expect(firstRunCalls[0]).toMatch(/src\/tests\/Alpha\.test\.tsx$/u);

    const secondRun = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) => {
        secondRunCalls.push(testFile.replace(/\\/g, "/"));

        if (testFile.endsWith("Alpha.test.tsx")) {
          return makeRunnerResult({ scoreResult: { total: 86 }, testFile });
        }

        return makeRunnerResult({ scoreResult: { total: 84 }, testFile });
      },
    });
    const tracker = await readDirectoryTracker(secondRun.logs);

    expect(secondRun.exitCode).toBe(0);
    expect(secondRunCalls).toHaveLength(2);
    expect(secondRunCalls[0]).toMatch(/src\/tests\/Alpha\.test\.tsx$/u);
    expect(secondRunCalls[1]).toMatch(/src\/tests\/Beta\.test\.tsx$/u);
    expect(tracker).toContain(
      "| completed | src/tests/Alpha.test.tsx | src/tests/Alpha.test.tsx | - | 86% | No follow-up required. | regrade |"
    );
    expect(tracker).toContain(
      "| completed | src/tests/Beta.test.tsx | src/tests/Beta.test.tsx | - | 84% | No follow-up required. | regrade |"
    );
  });

  it("regrades a single test file via the shared runner and reports the score delta", async () => {
    const root = await createSandbox("single-file");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");
    await mkdir(dirname(testFile), { recursive: true });
    await writeFile(testFile, "describe('CheckoutFlow', () => {})\n", "utf-8");

    const previousRecord = makeGeneratedTestRecord({
      createdAt: "2026-03-31T09:00:00.000Z",
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      requiresReview: true,
      scoreResult: makeScoreResult({ total: 72, requiresReview: true }),
      testFile,
    });

    const result = await runRegrade([testFile], root, {
      runRegradeTestFile: async ({ testFile }) =>
        makeRunnerResult({
          followUpComments: ["Strengthen assertions."],
          matchedGeneratedTestRecord: previousRecord,
          matchedHistorySource: "generated",
          scoreResult: { total: 85 },
          testFile,
        }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Regrade single-file mode enabled");
    expect(result.logs).toContain(
      "Previous snapshot (generatedTests): 72/100 (C)"
    );
    expect(result.logs).toContain("Score: 85/100 (B)");
    expect(result.logs).toContain("Delta: +13");
    expect(result.logs).toContain("Follow-up: Strengthen assertions.");
  });

  it("prefers generatedTests thresholds over legacy graded fallback in directory-loop mode", async () => {
    const root = await createSandbox("graded-threshold");
    const testsDir = join(root, "src", "tests");
    const checkoutTest = join(testsDir, "CheckoutFlow.test.tsx");
    await mkdir(testsDir, { recursive: true });
    await writeFile(
      checkoutTest,
      "describe('CheckoutFlow', () => {})\n",
      "utf-8"
    );
    await seedGeneratedTestRecord(root, checkoutTest, { total: 67 });
    const bootstrap = await runLoadOrBootstrapStateWorkflow(root);
    const legacyGrade = makeExistingTestGradeResult({ total: 91 });
    await writeTaroState(root, {
      ...bootstrap.state,
      gradedTests: [
        {
          createdAt: "2026-03-31T09:00:00.000Z",
          packagePath: ".",
          recordingFile: null,
          testFile: checkoutTest,
          quality: {
            overall: legacyGrade.total,
            grade: legacyGrade.grade,
            dimensions: legacyGrade.dimensions,
            signals: legacyGrade.signals,
            reasons: legacyGrade.reasons,
            blockers: legacyGrade.blockers,
          },
          requiresReview: legacyGrade.requiresReview,
        },
      ],
    });

    const result = await runRegrade([testsDir, "--directory-loop"], root, {
      runRegradeTestFile: async ({ testFile }) =>
        makeRunnerResult({ scoreResult: { total: 95 }, testFile }),
    });
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(tracker).toContain(
      "| completed | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | 67% | 95% | No follow-up required. | regrade |"
    );
  });
});
