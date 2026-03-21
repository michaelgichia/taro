import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  normalizeInstallOptionsMock,
  toInstallSelectionMock,
  promptForInstallChoicesMock,
  buildInstallPlanMock,
  confirmInstallPlanMock,
  renderInstallSummaryMock,
  renderInstallCancelledMessageMock,
  executeInstallPlanMock,
  renderInstallExecutionResultMock,
  logMock,
  errorMock,
} = vi.hoisted(() => ({
  normalizeInstallOptionsMock: vi.fn(),
  toInstallSelectionMock: vi.fn(),
  promptForInstallChoicesMock: vi.fn(),
  buildInstallPlanMock: vi.fn(),
  confirmInstallPlanMock: vi.fn(),
  renderInstallSummaryMock: vi.fn(),
  renderInstallCancelledMessageMock: vi.fn(),
  executeInstallPlanMock: vi.fn(),
  renderInstallExecutionResultMock: vi.fn(),
  logMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("#install/options.ts", async () => {
  const actual = await vi.importActual<typeof import("#install/options.ts")>(
    "#install/options.ts"
  );
  return {
    ...actual,
    normalizeInstallOptions: normalizeInstallOptionsMock,
    toInstallSelection: toInstallSelectionMock,
  };
});

vi.mock("#install/prompts.ts", () => ({
  promptForInstallChoices: promptForInstallChoicesMock,
}));

vi.mock("#install/planner.ts", () => ({
  buildInstallPlan: buildInstallPlanMock,
}));

vi.mock("#install/summary.ts", () => ({
  confirmInstallPlan: confirmInstallPlanMock,
  renderInstallCancelledMessage: renderInstallCancelledMessageMock,
  renderInstallExecutionResult: renderInstallExecutionResultMock,
  renderInstallSummary: renderInstallSummaryMock,
}));

vi.mock("#install/executor.ts", () => ({
  executeInstallPlan: executeInstallPlanMock,
}));

import { Command } from "commander";

import {
  applyInstallOptions,
  createInstallCommand,
  runInstallCommand,
} from "#cli/commands/install.ts";
import {
  InstallValidationError,
  type NormalizedInstallOptions,
} from "#install/options.ts";

function createLogger() {
  return { logger: { log: logMock, error: errorMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

describe("applyInstallOptions", () => {
  it("registers the runtime and location flags on a command", () => {
    const command = applyInstallOptions(new Command("install"));

    expect(command.options.map((option) => option.long)).toEqual(
      expect.arrayContaining([
        "--claude",
        "--opencode",
        "--gemini",
        "--codex",
        "--all",
        "--global",
        "--local",
      ])
    );
  });
});

describe("runInstallCommand", () => {
  it("prints a validation error and sets exitCode when option normalization fails", async () => {
    normalizeInstallOptionsMock.mockImplementation(() => {
      throw new InstallValidationError("bad flags");
    });

    await runInstallCommand({ all: true, codex: true }, createLogger());

    expect(errorMock).toHaveBeenCalledWith(
      expect.stringContaining("bad flags")
    );
    expect(process.exitCode).toBe(1);
  });

  it("rethrows unexpected install errors instead of swallowing them", async () => {
    const unexpected = new Error("boom");
    normalizeInstallOptionsMock.mockImplementation(() => {
      throw unexpected;
    });

    await expect(runInstallCommand({}, createLogger())).rejects.toBe(
      unexpected
    );
  });

  it("prints a cancellation message for interactive installs that are not confirmed", async () => {
    const normalized = {
      mode: "interactive",
      runtimes: ["codex"],
      locations: {},
      needsRuntimePrompt: false,
      runtimesNeedingLocation: [],
      source: "prompt",
    } satisfies NormalizedInstallOptions;

    const selection = {
      mode: "interactive",
      runtimes: ["codex"],
      locations: { codex: "local" },
      source: "prompt",
    };

    normalizeInstallOptionsMock.mockReturnValue(normalized);
    promptForInstallChoicesMock.mockResolvedValue(selection);
    buildInstallPlanMock.mockReturnValue({ targets: [] });
    renderInstallSummaryMock.mockReturnValue("summary");
    confirmInstallPlanMock.mockResolvedValue(false);
    renderInstallCancelledMessageMock.mockReturnValue("cancelled");

    await runInstallCommand({}, createLogger());

    expect(logMock).toHaveBeenCalledWith("summary");
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining("cancelled"));
    expect(executeInstallPlanMock).not.toHaveBeenCalled();
  });

  it("sets exitCode when execution completes with a partial result", async () => {
    const normalized = {
      mode: "non-interactive",
      runtimes: ["codex"],
      locations: { codex: "local" },
      needsRuntimePrompt: false,
      runtimesNeedingLocation: [],
      source: "flags",
    } satisfies NormalizedInstallOptions;

    const selection = {
      mode: "non-interactive",
      runtimes: ["codex"],
      locations: { codex: "local" },
      source: "flags",
    };

    normalizeInstallOptionsMock.mockReturnValue(normalized);
    toInstallSelectionMock.mockReturnValue(selection);
    buildInstallPlanMock.mockReturnValue({ targets: [] });
    renderInstallSummaryMock.mockReturnValue("summary");
    executeInstallPlanMock.mockResolvedValue({ status: "partial" });
    renderInstallExecutionResultMock.mockReturnValue("execution");

    await runInstallCommand({}, createLogger());

    expect(logMock).toHaveBeenCalledWith("summary");
    expect(logMock).toHaveBeenCalledWith("execution");
    expect(process.exitCode).toBe(1);
  });
});

describe("createInstallCommand", () => {
  it("creates an install command that delegates to runInstallCommand", async () => {
    const normalized = {
      mode: "non-interactive",
      runtimes: ["codex"],
      locations: { codex: "local" },
      needsRuntimePrompt: false,
      runtimesNeedingLocation: [],
      source: "flags",
    } satisfies NormalizedInstallOptions;

    const selection = {
      mode: "non-interactive",
      runtimes: ["codex"],
      locations: { codex: "local" },
      source: "flags",
    };

    normalizeInstallOptionsMock.mockReturnValue(normalized);
    toInstallSelectionMock.mockReturnValue(selection);
    buildInstallPlanMock.mockReturnValue({ targets: [] });
    renderInstallSummaryMock.mockReturnValue("summary");
    executeInstallPlanMock.mockResolvedValue({ status: "installed" });
    renderInstallExecutionResultMock.mockReturnValue("execution");

    const command = createInstallCommand();

    await command.parseAsync(["--codex", "--local"], { from: "user" });

    expect(command.name()).toBe("install");
    expect(normalizeInstallOptionsMock).toHaveBeenCalled();
  });
});
