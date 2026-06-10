import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyFileMock, mkdirMock, readFileMock, writeFileMock } = vi.hoisted(
  () => ({
    copyFileMock: vi.fn(),
    mkdirMock: vi.fn(),
    readFileMock: vi.fn(),
    writeFileMock: vi.fn(),
  })
);

vi.mock("node:fs/promises", () => ({
  copyFile: copyFileMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

import type { PlannedInstallTarget } from "#install/types.ts";
import { writeInstallPlan } from "#install/writer.ts";

function createErrnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function createTarget(): PlannedInstallTarget {
  return {
    id: "codex",
    displayName: "Codex",
    family: "skill",
    location: "global",
    destinationDirectory: "/repo/.codex",
    runtimeNodePath: "/repo/package/dist/index.js",
    runtimeEntrypointPath: "/repo/package/dist/index.js",
    runtimeCommand: "node /repo/package/dist/index.js",
    verificationCommand: "taro --version",
    ownershipMarkerFileName: "@tr-rtl-manifest.json",
    globalDirectorySegments: [".codex"],
    localDirectoryName: ".codex",
    packageContainerSegments: [".codex"],
    assets: [],
    operations: [
      {
        assetId: "skill-help",
        runtime: "codex",
        location: "global",
        kind: "skill",
        sourcePath: "/repo/package/skill.md",
        relativeDestinationPath: "skills/@tr-rtl/cli-help/SKILL.md",
        targetPath: "/repo/.codex/skills/@tr-rtl/cli-help/SKILL.md",
        renderedContent: "# skill\n",
      },
    ],
  };
}

describe("writeInstallPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  it("ignores malformed ownership manifests and proceeds with installation", async () => {
    const target = createTarget();
    const manifestPath = "/repo/.codex/@tr-rtl-manifest.json";

    readFileMock.mockImplementation(async (path: string) => {
      if (path === manifestPath) {
        return "{";
      }

      throw createErrnoError("ENOENT");
    });

    const result = await writeInstallPlan(target);

    expect(result.status).toBe("installed");
    expect(writeFileMock).toHaveBeenCalledWith(
      target.operations[0]?.targetPath,
      "# skill\n"
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      manifestPath,
      expect.stringContaining('"packageName": "@tr-rtl/cli"')
    );
  });

  it("rethrows unexpected read errors from existing target files", async () => {
    const target = createTarget();
    const manifestPath = "/repo/.codex/@tr-rtl-manifest.json";
    const targetPath = target.operations[0]!.targetPath;

    readFileMock.mockImplementation(async (path: string) => {
      if (path === manifestPath) {
        throw createErrnoError("ENOENT");
      }
      if (path === targetPath) {
        throw createErrnoError("EACCES");
      }

      throw createErrnoError("ENOENT");
    });

    await expect(writeInstallPlan(target)).rejects.toMatchObject({
      code: "EACCES",
    });
  });
});
