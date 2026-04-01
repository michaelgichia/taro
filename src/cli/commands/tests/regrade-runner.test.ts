import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runRegradeForTestFile } from "#cli/commands/regrade-runner.ts";
import {
  appendGeneratedTestRecord,
  runLoadOrBootstrapStateWorkflow,
} from "#core/state.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-regrade-runner-${label}-`));
  sandboxes.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "runner-app", private: true }, null, 2),
    "utf-8"
  );
  return root;
}

function makeStoredScoreResult(total: number) {
  return {
    total,
    grade: total >= 90 ? "A" : total >= 80 ? "B" : total >= 70 ? "C" : "D",
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
      status: "pass" as const,
      reason: "no-markers-detected" as const,
      failing: false,
      message: "No assertion markers detected.",
    },
  };
}

async function writeTestFile(root: string, relativePath: string) {
  const testFile = join(root, relativePath);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    testFile,
    [
      "import { describe, expect, it } from 'vitest';",
      "import { render, screen } from '@testing-library/react';",
      "",
      "describe('CheckoutFlow', () => {",
      "  it('renders submit action', () => {",
      "    render(<button type='submit'>Submit order</button>);",
      "    expect(screen.getByRole('button', { name: 'Submit order' })).toBeInTheDocument();",
      "  });",
      "});",
      "",
    ].join("\n"),
    "utf-8"
  );
  return testFile;
}

describe("runRegradeForTestFile", () => {
  it("reuses the latest matching stored test metadata when present", async () => {
    const root = await createSandbox("matched-history");
    const testFile = await writeTestFile(
      root,
      join("src", "CheckoutFlow.test.tsx")
    );
    await appendGeneratedTestRecord(root, {
      packagePath: "packages/app",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      scoreResult: makeStoredScoreResult(72),
    });

    const result = await runRegradeForTestFile({ projectRoot: root, testFile });
    const state = await runLoadOrBootstrapStateWorkflow(root);
    const matchingHistory = state.state.generatedTests.filter((record) =>
      record.testFile.endsWith("CheckoutFlow.test.tsx")
    );
    const latestRecord = matchingHistory.at(-1);

    expect(result.matchedGeneratedTestRecord).toEqual(
      expect.objectContaining({
        packagePath: "packages/app",
        recordingFile: "recordings/checkout-flow.js",
        quality: expect.objectContaining({ overall: 72 }),
      })
    );
    expect(result.matchedHistorySource).toBe("generated");
    expect(result.persistenceContext).toEqual({
      packagePath: "packages/app",
      recordingFile: "recordings/checkout-flow.js",
    });
    expect(matchingHistory).toHaveLength(2);
    expect(latestRecord).toEqual(
      expect.objectContaining({
        packagePath: "packages/app",
        recordingFile: "recordings/checkout-flow.js",
      })
    );
    expect(result.followUpComments.length).toBeGreaterThan(0);
  });

  it("initializes generated test history cleanly when no prior match exists", async () => {
    const root = await createSandbox("fresh-history");
    const testFile = await writeTestFile(root, join("src", "Orders.spec.tsx"));

    const result = await runRegradeForTestFile({ projectRoot: root, testFile });
    const state = await runLoadOrBootstrapStateWorkflow(root);

    expect(result.matchedGeneratedTestRecord).toBeNull();
    expect(result.matchedHistorySource).toBeNull();
    expect(result.persistenceContext).toEqual({
      packagePath: ".",
      recordingFile: null,
    });
    expect(state.state.generatedTests).toHaveLength(1);
    expect(state.state.generatedTests[0]).toEqual(
      expect.objectContaining({ packagePath: ".", recordingFile: null })
    );
  });
});
