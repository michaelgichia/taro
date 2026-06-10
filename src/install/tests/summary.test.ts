import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  InstallExecutionResult,
  InstallPlan,
  PlannedInstallTarget,
  ResolvedInstallTarget,
} from "#install/types.ts";

const { createInterfaceMock, questionMock, closeMock } = vi.hoisted(() => ({
  createInterfaceMock: vi.fn(),
  questionMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: createInterfaceMock,
}));

import {
  confirmInstallPlan,
  renderInstallCancelledMessage,
  renderInstallExecutionResult,
  renderInstallSummary,
} from "#install/summary.ts";

function createTarget(
  overrides: Partial<ResolvedInstallTarget> = {}
): ResolvedInstallTarget {
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
    destinationDirectory: `${process.env.HOME ?? "/Users/tester"}/.claude`,
    runtimeNodePath: "/usr/bin/node",
    runtimeEntrypointPath: "/tmp/dist/index.js",
    runtimeCommand: "claude",
    ...overrides,
  };
}

function createPlan(targets: PlannedInstallTarget[]): InstallPlan {
  return {
    packageName: "@tr/rtl",
    commandName: "taro",
    stage: "ready-to-write",
    source: "flags",
    mode: "non-interactive",
    targets,
  };
}

function createPlannedTarget(
  overrides: Partial<PlannedInstallTarget> = {}
): PlannedInstallTarget {
  return {
    ...createTarget(),
    operations: [
      {
        assetId: "help",
        runtime: "claude",
        location: "global",
        kind: "prompt",
        sourcePath: "/pkg/help.md",
        relativeDestinationPath: "help.md",
        targetPath: "/tmp/help.md",
        entrypoint: "/@tr/rtl:help",
      },
    ],
    ...overrides,
  };
}

describe("renderInstallSummary", () => {
  it("formats global and local install targets with asset counts", () => {
    const plan = createPlan([
      createPlannedTarget({
        displayName: "Claude Code",
        destinationDirectory: `${process.env.HOME ?? "/Users/tester"}/.claude`,
        location: "global",
      }),
      createPlannedTarget({
        id: "codex",
        displayName: "OpenAI Codex",
        location: "local",
        destinationDirectory: `${process.cwd()}/.codex`,
        operations: [
          {
            assetId: "skill",
            runtime: "codex",
            location: "local",
            kind: "skill",
            sourcePath: "/pkg/skill.md",
            relativeDestinationPath: "SKILL.md",
            targetPath: "/tmp/SKILL.md",
          },
          {
            assetId: "manifest",
            runtime: "codex",
            location: "local",
            kind: "manifest",
            sourcePath: "/pkg/manifest.json",
            relativeDestinationPath: "manifest.json",
            targetPath: "/tmp/manifest.json",
          },
        ],
      }),
    ]);

    const summary = renderInstallSummary(plan);

    expect(summary).toContain("Install plan for @tr/rtl");
    expect(summary).toContain("- Claude Code: global (");
    expect(summary).toContain("1 asset");
    expect(summary).toContain("- OpenAI Codex: local (./.codex)");
    expect(summary).toContain("2 assets");
    expect(summary).toContain(
      "No files will be written until confirmation completes."
    );
  });
});

describe("confirmInstallPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInterfaceMock.mockReturnValue({
      question: questionMock,
      close: closeMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for empty and negative answers, and closes the interface", async () => {
    questionMock.mockResolvedValueOnce("");

    await expect(
      confirmInstallPlan(createPlan([createPlannedTarget()]))
    ).resolves.toBe(false);
    expect(closeMock).toHaveBeenCalled();

    vi.clearAllMocks();
    createInterfaceMock.mockReturnValue({
      question: questionMock,
      close: closeMock,
    });
    questionMock.mockResolvedValueOnce("no");

    await expect(
      confirmInstallPlan(createPlan([createPlannedTarget()]))
    ).resolves.toBe(false);
    expect(closeMock).toHaveBeenCalled();
  });

  it("re-prompts on invalid input, logs guidance, and accepts yes", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    questionMock.mockResolvedValueOnce("maybe").mockResolvedValueOnce("y");

    await expect(
      confirmInstallPlan(
        createPlan([createPlannedTarget(), createPlannedTarget()])
      )
    ).resolves.toBe(true);

    expect(questionMock).toHaveBeenCalledTimes(2);
    expect(questionMock).toHaveBeenLastCalledWith(
      "Proceed with the 2-target install plan? [y/N]: "
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Answer `y` to continue or `n` to cancel.")
    );
    expect(closeMock).toHaveBeenCalled();
  });
});

describe("renderInstallExecutionResult", () => {
  it("renders installed, updated, repaired, and blocked outcomes with verification and ownership sections", () => {
    const result: InstallExecutionResult = {
      packageName: "@tr/rtl",
      status: "partial",
      targets: [
        {
          runtime: "claude",
          displayName: "Claude Code",
          location: "global",
          destinationDirectory: "/Users/tester/.claude",
          verificationCommand: "/@tr/rtl:help",
          status: "installed",
          writtenFiles: ["help.md"],
          conflicts: [],
          manifestPath: "/Users/tester/.claude/install-manifest.json",
          verification: {
            verificationCommand: "/@tr/rtl:help",
            status: "verified",
            checkedPath:
              "/Users/tester/.claude/commands/@tr/rtl/help.md",
            launcherCommand: "claude",
            missingPaths: [],
          },
        },
        {
          runtime: "gemini",
          displayName: "Gemini CLI",
          location: "global",
          destinationDirectory: "/Users/tester/.gemini",
          verificationCommand: "/@tr/rtl:help",
          status: "updated",
          writtenFiles: ["help.toml"],
          conflicts: [],
          manifestPath: "/Users/tester/.gemini/install-manifest.json",
          verification: {
            verificationCommand: "/@tr/rtl:help",
            status: "missing-installed-assets",
            checkedPath: "/Users/tester/.gemini/commands/help.toml",
            launcherCommand: "gemini",
            missingPaths: ["/Users/tester/.gemini/commands/help.toml"],
          },
        },
        {
          runtime: "opencode",
          displayName: "OpenCode",
          location: "global",
          destinationDirectory: "/Users/tester/.config/opencode",
          verificationCommand: "/@tr/rtl-help",
          status: "repaired",
          writtenFiles: ["rtl-help.md"],
          conflicts: [],
          manifestPath: "/Users/tester/.config/opencode/install-manifest.json",
          verification: {
            verificationCommand: "/@tr/rtl-help",
            status: "runtime-check-failed",
            checkedPath: "/Users/tester/.config/opencode/rtl-help.md",
            launcherCommand: "opencode",
            errorMessage: "boom",
            missingPaths: [],
          },
        },
        {
          runtime: "codex",
          displayName: "OpenAI Codex",
          location: "local",
          destinationDirectory: "/repo/.codex",
          verificationCommand: "$@tr/rtl-help",
          status: "blocked",
          writtenFiles: [],
          conflicts: [
            {
              kind: "installer-owned-modified",
              targetPath: "/repo/.codex/SKILL.md",
            },
            {
              kind: "external-collision",
              targetPath: "/repo/.codex/manifest.json",
            },
            { kind: "missing", targetPath: "/repo/.codex/help.md" },
          ],
        },
      ],
    };

    const output = renderInstallExecutionResult(result);

    expect(output).toContain("Install finished with conflicts.");
    expect(output).toContain("Claude Code: wrote 1 asset(s)");
    expect(output).toContain("Gemini CLI: updated 1 owned asset(s)");
    expect(output).toContain("OpenCode: repaired 1 owned asset(s)");
    expect(output).toContain("OpenAI Codex: blocked by protected manual edit");
    expect(output).toContain(
      "external collision at /repo/.codex/manifest.json"
    );
    expect(output).toContain("missing at /repo/.codex/help.md");
    expect(output).toContain("Verification commands:");
    expect(output).toContain(
      "(verified at /Users/tester/.claude/commands/@tr/rtl/help.md)"
    );
    expect(output).toContain(
      "(missing /Users/tester/.gemini/commands/help.toml)"
    );
    expect(output).toContain("(runtime check failed: boom)");
    expect(output).toContain("Ownership markers:");
    expect(output).toContain("/Users/tester/.claude/install-manifest.json");
  });

  it("renders blocked installs and missing verification metadata fallback", () => {
    const result: InstallExecutionResult = {
      packageName: "@tr/rtl",
      status: "blocked",
      targets: [
        {
          runtime: "claude",
          displayName: "Claude Code",
          location: "global",
          destinationDirectory: "/Users/tester/.claude",
          verificationCommand: "/@tr/rtl:help",
          status: "installed",
          writtenFiles: ["help.md"],
          conflicts: [],
        },
      ],
    };

    const output = renderInstallExecutionResult(result);

    expect(output).toContain("Install blocked.");
    expect(output).toContain("(verification metadata missing)");
  });
});

describe("renderInstallCancelledMessage", () => {
  it("returns the static cancellation notice", () => {
    expect(renderInstallCancelledMessage()).toBe(
      "Install cancelled. Nothing changed."
    );
  });
});
