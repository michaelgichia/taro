import { Command } from "commander";
import pc from "picocolors";
import { executeInstallPlan } from "../../install/executor.js";
import {
  InstallValidationError,
  normalizeInstallOptions,
  toInstallSelection,
} from "../../install/options.js";
import { buildInstallPlan } from "../../install/planner.js";
import { promptForInstallChoices } from "../../install/prompts.js";
import {
  confirmInstallPlan,
  renderInstallCancelledMessage,
  renderInstallExecutionResult,
  renderInstallSummary,
} from "../../install/summary.js";
import type {
  InstallCommandOptions,
  InstallSelection,
} from "../../install/types.js";

interface PromptCapability {
  input?: Pick<typeof process.stdin, "isTTY">;
  output?: Pick<typeof process.stdout, "isTTY">;
}

interface PromptIO {
  input?: typeof process.stdin;
  output?: typeof process.stdout;
}

interface InstallCommandContext {
  cwd?: string;
  home?: string;
  logger?: Pick<typeof console, "log" | "error">;
  promptCapability?: PromptCapability;
  promptIO?: PromptIO;
}

export function applyInstallOptions(command: Command): Command {
  return command
    .option("--claude", "Install Taro assets for Claude Code")
    .option("--opencode", "Install Taro assets for OpenCode")
    .option("--gemini", "Install Taro assets for Gemini CLI")
    .option("--codex", "Install Taro assets for Codex")
    .option("--all", "Install Taro assets for all supported runtimes")
    .option(
      "--global",
      "Install into the runtime global configuration directory"
    )
    .option("--local", "Install into the current project only");
}

async function resolveInstallSelection(
  options: InstallCommandOptions,
  context: InstallCommandContext
): Promise<InstallSelection> {
  const normalized = normalizeInstallOptions(options, context.promptCapability);

  if (normalized.mode === "interactive") {
    return promptForInstallChoices(normalized, context.promptIO);
  }

  return toInstallSelection(normalized);
}

function printInstallError(
  error: unknown,
  logger: Pick<typeof console, "error">
): void {
  if (error instanceof InstallValidationError) {
    logger.error(pc.red(`Error: ${error.message}`));
    process.exitCode = 1;
    return;
  }

  throw error;
}

export async function runInstallCommand(
  options: InstallCommandOptions = {},
  context: InstallCommandContext = {}
): Promise<void> {
  const logger = context.logger ?? console;

  try {
    const selection = await resolveInstallSelection(options, context);
    const plan = buildInstallPlan(selection, {
      cwd: context.cwd,
      home: context.home,
    });

    logger.log(renderInstallSummary(plan));

    if (selection.mode === "interactive") {
      const confirmed = await confirmInstallPlan(plan, context.promptIO);
      if (!confirmed) {
        logger.log(pc.yellow(renderInstallCancelledMessage()));
        return;
      }
    }

    const result = await executeInstallPlan(plan);

    logger.log(renderInstallExecutionResult(result));

    if (result.status !== "installed") {
      process.exitCode = 1;
    }
  } catch (error) {
    printInstallError(error, logger);
  }
}

export function createInstallCommand(): Command {
  const install = new Command("install");

  applyInstallOptions(install);

  install
    .description(
      "Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex"
    )
    .action(async (options: InstallCommandOptions) => {
      await runInstallCommand(options);
    });

  return install;
}
