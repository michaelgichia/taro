import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDirectoryLoopTracker,
  getDirectoryLoopTrackerPath,
  readDirectoryLoopTracker,
  renderDirectoryLoopTrackerMarkdown,
  updateDirectoryLoopTrackerEntry,
  updateDirectoryLoopTrackerStatus,
  writeDirectoryLoopTracker,
} from "#cli/commands/target-directory-tracker.ts";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-target-tracker-${label}-`));
  sandboxes.push(root);
  return root;
}

describe("target directory tracker", () => {
  it("writes tracker markdown into the canonical .taro directory", async () => {
    const root = await createSandbox("write");
    const srcDir = join(root, "src", "widgets");
    const tracker = createDirectoryLoopTracker({
      directoryPath: srcDir,
      entries: [
        {
          componentPath: join(srcDir, "Card.tsx"),
          outputPath: join(srcDir, "tests", "Card.test.tsx"),
          status: "pending",
        },
      ],
      projectRoot: root,
    });

    await writeDirectoryLoopTracker(tracker);

    const trackerPath = getDirectoryLoopTrackerPath(root, srcDir);
    const content = await readFile(trackerPath, "utf-8");

    expect(tracker.trackerPath).toBe(trackerPath);
    expect(content).toContain("# Taro Directory Loop Tracker");
    expect(content).toContain("- Directory: src/widgets");
    expect(content).toContain("| pending | src/widgets/Card.tsx |");
  });

  it("keeps only one component in progress at a time", () => {
    const root = "/repo";
    const tracker = createDirectoryLoopTracker({
      directoryPath: "/repo/src",
      entries: [
        {
          componentPath: "/repo/src/Alpha.tsx",
          outputPath: "/repo/src/Alpha.test.tsx",
          status: "pending",
        },
        {
          componentPath: "/repo/src/Beta.tsx",
          outputPath: "/repo/src/Beta.test.tsx",
          status: "pending",
        },
      ],
      projectRoot: root,
    });

    const alphaInProgress = updateDirectoryLoopTrackerStatus(tracker, {
      componentPath: "/repo/src/Alpha.tsx",
      projectRoot: root,
      status: "in-progress",
      updatedAt: "2026-03-30T13:00:00.000Z",
    });
    const betaInProgress = updateDirectoryLoopTrackerStatus(alphaInProgress, {
      componentPath: "/repo/src/Beta.tsx",
      projectRoot: root,
      status: "in-progress",
      updatedAt: "2026-03-30T13:05:00.000Z",
    });
    const markdown = renderDirectoryLoopTrackerMarkdown(betaInProgress);

    expect(
      betaInProgress.entries.find(
        (entry) => entry.componentPath === "src/Alpha.tsx"
      )?.status
    ).toBe("pending");
    expect(
      betaInProgress.entries.find(
        (entry) => entry.componentPath === "src/Beta.tsx"
      )?.status
    ).toBe("in-progress");
    expect(markdown).toContain("- Pending: 1");
    expect(markdown).toContain("- In progress: 1");
    expect(markdown).toContain("- Failed: 0");
  });

  it("round-trips a completed regrade tracker row with score changes and follow-up comments", async () => {
    const root = await createSandbox("regrade-roundtrip");
    const testsDir = join(root, "src", "tests");
    const pendingTracker = createDirectoryLoopTracker({
      directoryPath: testsDir,
      entries: [
        {
          componentPath: join(testsDir, "CheckoutFlow.test.tsx"),
          currentScoreThreshold: 87,
          kind: "regrade",
          outputPath: join(testsDir, "CheckoutFlow.test.tsx"),
          status: "pending",
        },
      ],
      projectRoot: root,
    });
    const tracker = updateDirectoryLoopTrackerEntry(pendingTracker, {
      componentPath: join(testsDir, "CheckoutFlow.test.tsx"),
      followUpComments: [
        "Manual review required (74/100, C).",
        "Strengthen outcome assertions.",
      ],
      projectRoot: root,
      status: "completed",
      updatedScoreThreshold: 74,
    });

    await writeDirectoryLoopTracker(tracker);

    const trackerPath = getDirectoryLoopTrackerPath(root, testsDir);
    const content = await readFile(trackerPath, "utf-8");
    const parsed = await readDirectoryLoopTracker({
      directoryPath: testsDir,
      projectRoot: root,
    });

    expect(content).toContain(
      "| completed | src/tests/CheckoutFlow.test.tsx | src/tests/CheckoutFlow.test.tsx | 87% | 74% | Manual review required (74/100, C).<br>Strengthen outcome assertions. | regrade |"
    );
    expect(parsed?.entries[0]).toEqual(
      expect.objectContaining({
        componentPath: "src/tests/CheckoutFlow.test.tsx",
        currentScoreThreshold: 87,
        followUpComments: [
          "Manual review required (74/100, C).",
          "Strengthen outcome assertions.",
        ],
        kind: "regrade",
        outputPath: "src/tests/CheckoutFlow.test.tsx",
        status: "completed",
        updatedScoreThreshold: 74,
      })
    );
  });

  it("renders and parses failed target rows with counts and follow-up metadata", async () => {
    const root = await createSandbox("failed-roundtrip");
    const srcDir = join(root, "src");
    const tracker = createDirectoryLoopTracker({
      directoryPath: srcDir,
      entries: [
        {
          componentPath: join(srcDir, "Alpha.tsx"),
          currentScoreThreshold: 91,
          followUpComments: [
            "Generated output did not clear the target gate (64/100, D).",
            "Manual review required (64/100, D).",
          ],
          outputPath: join(srcDir, "Alpha.test.tsx"),
          status: "failed",
          updatedScoreThreshold: 64,
        },
      ],
      projectRoot: root,
    });

    await writeDirectoryLoopTracker(tracker);

    const content = await readFile(tracker.trackerPath, "utf-8");
    const parsed = await readDirectoryLoopTracker({
      directoryPath: srcDir,
      projectRoot: root,
    });

    expect(content).toContain("- Failed: 1");
    expect(content).toContain(
      "| failed | src/Alpha.tsx | src/Alpha.test.tsx | 91% | 64% | Generated output did not clear the target gate (64/100, D).<br>Manual review required (64/100, D). | target |"
    );
    expect(parsed?.entries[0]).toEqual(
      expect.objectContaining({
        componentPath: "src/Alpha.tsx",
        currentScoreThreshold: 91,
        followUpComments: [
          "Generated output did not clear the target gate (64/100, D).",
          "Manual review required (64/100, D).",
        ],
        kind: "target",
        outputPath: "src/Alpha.test.tsx",
        status: "failed",
        updatedScoreThreshold: 64,
      })
    );
  });
});
