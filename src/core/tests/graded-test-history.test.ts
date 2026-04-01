import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendGradedTestRecord,
  findLatestExistingTestHistoryRecord,
} from "#core/graded-test-history.ts";
import {
  appendGeneratedTestRecord,
  runLoadOrBootstrapStateWorkflow,
} from "#core/state.ts";
import type { ExistingTestGradeResult } from "#types/existing-test-grade.ts";
import type { ScoreResult } from "#types/score.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-graded-history-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "graded-history-app", private: true }, null, 2),
    "utf-8"
  );
  return root;
}

function makeGeneratedScoreResult(total: number): ScoreResult {
  return {
    total,
    grade:
      total >= 90
        ? "A"
        : total >= 80
          ? "B"
          : total >= 70
            ? "C"
            : total >= 60
              ? "D"
              : "F",
    dimensions: {
      queryQuality: total,
      assertionSpecificity: total,
      testStructure: total,
      boundaryIsolation: total,
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
    blockers: [],
    requiresReview: total < 80,
    markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
    markerDiagnostics: {
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
    },
    markerQualityGate: {
      status: "pass",
      reason: "no-markers-detected",
      failing: false,
      message: "No assertion markers detected.",
    },
  };
}

function makeExistingTestGradeResult(total: number): ExistingTestGradeResult {
  return {
    total,
    grade:
      total >= 90
        ? "A"
        : total >= 80
          ? "B"
          : total >= 70
            ? "C"
            : total >= 60
              ? "D"
              : "F",
    dimensions: {
      robustness: 20,
      readability: 12,
      assertionStrength: 16,
      mockFidelity: 16,
      maintainability: 16,
    },
    signals: {
      roleQueryCount: 1,
      labelQueryCount: 0,
      placeholderQueryCount: 0,
      textQueryCount: 0,
      testIdQueryCount: 0,
      querySelectorCount: 0,
      positionalRoleQueryCount: 0,
      payloadAssertionCount: 1,
      strongAssertionCount: 1,
      presenceAssertionCount: 1,
      visibilityAssertionCount: 0,
      mockCallAssertionCount: 0,
      sharedMockImportCount: 0,
      passthroughModuleMockCount: 0,
      setupHelperCount: 1,
      renderHelperImportCount: 0,
      beforeEachCount: 1,
      mockResetCount: 1,
      lineCount: 20,
    },
    reasons: [],
    blockers: [],
    requiresReview: total < 80,
  };
}

describe("graded-test-history", () => {
  it("falls back to generated history and then prefers graded history for the same test file", async () => {
    const root = await createSandbox("history-fallback");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");

    await appendGeneratedTestRecord(root, {
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      scoreResult: makeGeneratedScoreResult(72),
    });

    let state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    let history = findLatestExistingTestHistoryRecord(state, root, testFile);

    expect(history?.source).toBe("generated");
    expect(history?.record.quality.overall).toBe(72);

    await appendGradedTestRecord(root, {
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      gradeResult: makeExistingTestGradeResult(84),
    });

    state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    history = findLatestExistingTestHistoryRecord(state, root, testFile);

    expect(history?.source).toBe("graded");
    expect(history?.record.quality.overall).toBe(84);
  });

  it("keeps only the latest five graded snapshots per test file", async () => {
    const root = await createSandbox("trim-history");
    const testFile = join(root, "src", "Orders.test.tsx");

    for (const total of [70, 71, 72, 73, 74, 75]) {
      await appendGradedTestRecord(root, {
        packagePath: ".",
        recordingFile: null,
        testFile,
        gradeResult: makeExistingTestGradeResult(total),
      });
    }

    const state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    const matching = state.gradedTests.filter((record) =>
      record.testFile.endsWith("Orders.test.tsx")
    );
    const totals = matching
      .map((record) => record.quality.overall)
      .sort((a, b) => a - b);

    expect(matching).toHaveLength(5);
    expect(totals).toEqual([71, 72, 73, 74, 75]);
  });
});
