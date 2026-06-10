import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedInstallTarget } from "#install/types.ts";

const { accessMock, execFileMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ access: accessMock }));

vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { verifyInstalledRuntime } from "#install/verification.ts";

function createTarget(
  overrides: Partial<PlannedInstallTarget> = {}
): PlannedInstallTarget {
  return {
    id: "claude",
    displayName: "Claude Code",
    family: "prompt",
    globalDirectorySegments: [".claude"],
    localDirectoryName: ".claude",
    packageContainerSegments: ["commands", "claude"],
    verificationCommand: "/@tr/rtl:help",
    ownershipMarkerFileName: "install-manifest.json",
    assets: [],
    location: "global",
    destinationDirectory: "/Users/tester/.claude",
    runtimeNodePath: "/usr/bin/node",
    runtimeEntrypointPath:
      "/Users/tester/.claude/commands/@tr/rtl/help.md",
    runtimeCommand: "claude",
    operations: [
      {
        assetId: "help",
        runtime: "claude",
        location: "global",
        kind: "prompt",
        sourcePath: "/pkg/help.md",
        relativeDestinationPath: "commands/@tr/rtl/help.md",
        targetPath: "/Users/tester/.claude/commands/@tr/rtl/help.md",
        entrypoint: "/@tr/rtl:help",
      },
      {
        assetId: "manifest",
        runtime: "claude",
        location: "global",
        kind: "manifest",
        sourcePath: "/pkg/install-manifest.json",
        relativeDestinationPath: "install-manifest.json",
        targetPath: "/Users/tester/.claude/install-manifest.json",
      },
    ],
    ...overrides,
  };
}

describe("verifyInstalledRuntime branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockImplementation((_file, _args, callback) =>
      callback(null, { stdout: "1.0.0\n", stderr: "" })
    );
  });

  it("returns missing-entrypoint when no operation matches the verification command", async () => {
    const result = await verifyInstalledRuntime(
      createTarget({
        operations: [
          {
            assetId: "help",
            runtime: "claude",
            location: "global",
            kind: "prompt",
            sourcePath: "/pkg/help.md",
            relativeDestinationPath: "commands/@tr/rtl/help.md",
            targetPath: "/Users/tester/.claude/commands/@tr/rtl/help.md",
            entrypoint: "/different-command",
          },
        ],
      })
    );

    expect(result).toEqual({
      verificationCommand: "/@tr/rtl:help",
      status: "missing-entrypoint",
      missingPaths: [],
    });
  });

  it("returns missing-installed-assets when required files are absent", async () => {
    accessMock.mockImplementation((path: string) => {
      if (
        path.includes("install-manifest.json") ||
        path.includes("rtl/help.md")
      ) {
        return Promise.reject(new Error("missing"));
      }

      return Promise.resolve(undefined);
    });

    const result = await verifyInstalledRuntime(createTarget());

    expect(result.status).toBe("missing-installed-assets");
    expect(result.checkedPath).toBe(
      "/Users/tester/.claude/commands/@tr/rtl/help.md"
    );
    expect(result.launcherCommand).toBe("claude");
    expect(result.missingPaths).toEqual([
      "/Users/tester/.claude/commands/@tr/rtl/help.md",
      "/Users/tester/.claude/install-manifest.json",
      "/Users/tester/.claude/commands/@tr/rtl/help.md",
    ]);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns runtime-check-failed using stderr, stdout, or message fallback", async () => {
    execFileMock.mockImplementationOnce((_file, _args, callback) =>
      callback({ stderr: "bad stderr\n", message: "ignored" })
    );

    await expect(verifyInstalledRuntime(createTarget())).resolves.toMatchObject(
      { status: "runtime-check-failed", errorMessage: "bad stderr" }
    );

    execFileMock.mockImplementationOnce((_file, _args, callback) =>
      callback({ stdout: "bad stdout\n", message: "ignored" })
    );

    await expect(verifyInstalledRuntime(createTarget())).resolves.toMatchObject(
      { status: "runtime-check-failed", errorMessage: "bad stdout" }
    );

    execFileMock.mockImplementationOnce((_file, _args, callback) =>
      callback({ message: "plain failure" })
    );

    await expect(verifyInstalledRuntime(createTarget())).resolves.toMatchObject(
      { status: "runtime-check-failed", errorMessage: "plain failure" }
    );

    execFileMock.mockImplementationOnce((_file, _args, callback) =>
      callback({})
    );

    await expect(verifyInstalledRuntime(createTarget())).resolves.toMatchObject(
      {
        status: "runtime-check-failed",
        errorMessage: "Runtime verification failed.",
      }
    );
  });
});
