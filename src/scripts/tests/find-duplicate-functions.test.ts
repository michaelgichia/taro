import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findDuplicateFunctions,
  formatDuplicateFunctionReport,
} from "../../../scripts/find-duplicate-functions.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createWorkspace(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-find-dupes-${label}-`));
  tempRoots.push(root);
  return root;
}

describe("find-duplicate-functions", () => {
  it("indexes cross-file duplicate function bodies and reuses the warm cache", async () => {
    const root = await createWorkspace("cache");
    const dbPath = join(root, ".taro", "function-dupes.json");
    const alphaPath = join(root, "src", "alpha.ts");
    const betaPath = join(root, "src", "beta.ts");
    const gammaPath = join(root, "src", "gamma.ts");

    await mkdir(dirname(alphaPath), { recursive: true });
    await writeFile(
      alphaPath,
      [
        "export function formatOrderCode(value: string) {",
        "  const normalized = value.trim().toUpperCase()",
        "  return normalized.replace(/\\s+/g, '-')",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      betaPath,
      [
        "export function buildOrderCode(value: string) {",
        "  const normalized = value.trim().toUpperCase()",
        "  return normalized.replace(/\\s+/g, '-')",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      gammaPath,
      [
        "export function parseOrderCode(value: string) {",
        "  return value.split('-')",
        "}",
        "",
      ].join("\n"),
      "utf-8"
    );

    const freshResult = await findDuplicateFunctions({
      dbPath,
      minBodyLength: 0,
      rootDir: root,
      scopes: ["src"],
    });

    expect(freshResult.refreshedFiles).toBe(3);
    expect(freshResult.duplicateGroups).toHaveLength(1);
    expect(freshResult.duplicateGroups[0]?.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/alpha.ts",
          name: "formatOrderCode",
        }),
        expect.objectContaining({
          filePath: "src/beta.ts",
          name: "buildOrderCode",
        }),
      ])
    );

    const cachedResult = await findDuplicateFunctions({
      cached: true,
      dbPath,
      minBodyLength: 0,
      rootDir: root,
      scopes: ["src"],
    });

    expect(cachedResult.cached).toBe(true);
    expect(cachedResult.refreshedFiles).toBe(0);
    expect(cachedResult.duplicateGroups).toHaveLength(1);
  });

  it("formats a readable report for duplicate groups", async () => {
    const root = await createWorkspace("report");
    const report = formatDuplicateFunctionReport({
      cached: false,
      dbPath: join(root, ".taro", "function-dupes.json"),
      duplicateGroups: [
        {
          fileCount: 2,
          normalizedHash: "abc123",
          occurrenceCount: 2,
          occurrences: [
            {
              endLine: 6,
              filePath: "src/a.ts",
              kind: "function-declaration",
              name: "formatOrderCode",
              startLine: 2,
            },
            {
              endLine: 8,
              filePath: "src/b.ts",
              kind: "function-declaration",
              name: "buildOrderCode",
              startLine: 3,
            },
          ],
          preview:
            "{ const normalized = value.trim().toUpperCase(); return normalized.replace(/\\s+/g, '-'); }",
        },
      ],
      indexedFiles: 12,
      refreshedFiles: 2,
      removedFiles: 0,
      rootDir: root,
    });

    expect(report).toContain("Found 1 duplicate group(s)");
    expect(report).toContain("src/a.ts:2-6 formatOrderCode");
    expect(report).toContain("src/b.ts:3-8 buildOrderCode");
  });
});
