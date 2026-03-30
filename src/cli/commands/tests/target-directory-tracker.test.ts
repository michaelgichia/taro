import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDirectoryLoopTracker,
  getDirectoryLoopTrackerPath,
  renderDirectoryLoopTrackerMarkdown,
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
      betaInProgress.entries.find((entry) => entry.componentPath === "src/Alpha.tsx")
        ?.status
    ).toBe("pending");
    expect(
      betaInProgress.entries.find((entry) => entry.componentPath === "src/Beta.tsx")
        ?.status
    ).toBe("in-progress");
    expect(markdown).toContain("- Pending: 1");
    expect(markdown).toContain("- In progress: 1");
  });
});
