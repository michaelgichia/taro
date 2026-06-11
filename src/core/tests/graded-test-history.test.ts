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
import {
  makeExistingTestGradeResult,
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

describe("graded-test-history", () => {
  it("prefers generated history when both generated and graded snapshots exist", async () => {
    const root = await createSandbox("history-fallback");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");

    await appendGeneratedTestRecord(root, {
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      scoreResult: makeHybridScoreResult({
        generation: { total: 72 },
        grading: { total: 72 },
        overall: 72,
      }),
    });

    let state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    let history = findLatestExistingTestHistoryRecord(state, root, testFile);

    expect(history?.source).toBe("generated");
    expect(history?.record.quality.overall).toBe(72);

    await appendGradedTestRecord(root, {
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      gradeResult: makeExistingTestGradeResult({ total: 84 }),
    });

    state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    history = findLatestExistingTestHistoryRecord(state, root, testFile);

    expect(history?.source).toBe("generated");
    expect(history?.record.quality.overall).toBe(84);
    expect(history?.record.quality.overallSource).toBe("legacy-graded");
  });

  it("falls back to graded history when no generated snapshot exists", async () => {
    const root = await createSandbox("graded-fallback");
    const testFile = join(root, "src", "CheckoutFlow.test.tsx");

    await appendGradedTestRecord(root, {
      packagePath: ".",
      recordingFile: "recordings/checkout-flow.js",
      testFile,
      gradeResult: makeExistingTestGradeResult({ total: 84 }),
    });

    const state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    const history = findLatestExistingTestHistoryRecord(state, root, testFile);

    expect(history?.source).toBe("generated");
    expect(history?.record.quality.overall).toBe(84);
    expect(history?.record.quality.overallSource).toBe("legacy-graded");
    expect(history?.record.quality.families.generation).toBeNull();
    expect(history?.record.quality.families.grading?.total).toBe(84);
  });

  it("keeps only the latest five canonical grading snapshots per test file", async () => {
    const root = await createSandbox("trim-history");
    const testFile = join(root, "src", "Orders.test.tsx");

    for (const total of [70, 71, 72, 73, 74, 75]) {
      await appendGradedTestRecord(root, {
        packagePath: ".",
        recordingFile: null,
        testFile,
        gradeResult: makeExistingTestGradeResult({ total }),
      });
    }

    const state = (await runLoadOrBootstrapStateWorkflow(root)).state;
    const matching = state.generatedTests.filter((record) =>
      record.testFile.endsWith("Orders.test.tsx")
    );
    const totals = matching
      .map((record) => record.quality.overall)
      .sort((a, b) => a - b);

    expect(matching).toHaveLength(5);
    expect(totals).toEqual([71, 72, 73, 74, 75]);
    expect(
      matching.every(
        (record) => record.quality.overallSource === "legacy-graded"
      )
    ).toBe(true);
  });
});
