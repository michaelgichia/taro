import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRegradeCommand } from "#cli/commands/regrade.ts";
import { appendGeneratedTestRecord } from "#core/state.ts";
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

async function runRegrade(args: string[], cwdPath: string) {
  const command = createRegradeCommand();
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
  const total = overrides.total ?? 80;

  return {
    total,
    grade: total >= 90 ? "A" : total >= 80 ? "B" : total >= 70 ? "C" : "D",
    dimensions: {
      assertionSpecificity: 100,
      boundaryIsolation: 100,
      queryQuality: 100,
      testStructure: 100,
      ...overrides.dimensions,
    },
    signals: {
      boundaryIssueCount: 0,
      boundaryWarningCount: 0,
      branchCoverageRatio: 1,
      duplicatedInlineRenderCount: 0,
      fireEventCount: 0,
      hasBasePropsConstant: true,
      hasOverrideRenderHelper: true,
      hasStandaloneUtilityDescribe: false,
      minimumExpectedTestCount: 1,
      missingMockCount: 0,
      multipleTestBlocks: true,
      placeholderRenderTarget: false,
      presenceAssertionCount: 1,
      presenceOnlyTestCount: 0,
      queryCheckpointCount: 0,
      roleQueryCount: 1,
      strongAssertionCount: 1,
      testIdQueryCount: 0,
      visibilityAssertionCount: 0,
      visibilityOnlyTestCount: 0,
      ...overrides.signals,
    },
    reasons: overrides.reasons ?? [],
    blockers: overrides.blockers ?? [],
    requiresReview: overrides.requiresReview ?? false,
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

  it("queues only test and spec files into the directory tracker", async () => {
    const root = await createSandbox("discovery");
    const testsDir = join(root, "src", "tests");
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

    const result = await runRegrade([testsDir, "--directory-loop"], root);
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.thrown).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.logs).toContain("Regrade directory loop mode enabled");
    expect(result.logs).toContain("Directory loop tracker:");
    expect(result.logs).toContain("Queued 2 pending test files for regrade");
    expect(tracker).toContain(
      "| pending | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | - | regrade |"
    );
    expect(tracker).toContain(
      "| pending | src/tests/nested/Orders.spec.ts | src/tests/nested/Orders.spec.ts | - | regrade |"
    );
    expect(tracker).not.toContain("CheckoutFlow.tsx");
    expect(tracker).not.toContain("helper.ts");
  });

  it("writes the latest stored score threshold into the tracker when present", async () => {
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

    const result = await runRegrade([testsDir, "--directory-loop"], root);
    const tracker = await readDirectoryTracker(result.logs);

    expect(result.exitCode).toBe(0);
    expect(tracker).toContain(
      "| pending | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | 87% | regrade |"
    );
  });
});
