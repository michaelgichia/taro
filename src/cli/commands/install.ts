import { Command } from 'commander'
import pc from 'picocolors'
import {
  InstallValidationError,
  normalizeInstallOptions,
  toInstallSelection,
} from '../../install/options.js'
import { buildInstallPlan } from '../../install/planner.js'
import { promptForInstallChoices } from '../../install/prompts.js'
import {
  confirmInstallPlan,
  renderInstallCancelledMessage,
  renderInstallPendingMessage,
  renderInstallSummary,
} from '../../install/summary.js'
import type { InstallCommandOptions, InstallSelection } from '../../install/types.js'

export function applyInstallOptions(command: Command): Command {
  return command
    .option('--claude', 'Install Taro assets for Claude Code')
    .option('--opencode', 'Install Taro assets for OpenCode')
    .option('--gemini', 'Install Taro assets for Gemini CLI')
    .option('--codex', 'Install Taro assets for Codex')
    .option('--all', 'Install Taro assets for all supported runtimes')
    .option('--global', 'Install into the runtime global configuration directory')
    .option('--local', 'Install into the current project only')
}

async function resolveInstallSelection(
  options: InstallCommandOptions
): Promise<InstallSelection> {
  const normalized = normalizeInstallOptions(options)

  if (normalized.mode === 'interactive') {
    return promptForInstallChoices(normalized)
  }

  return toInstallSelection(normalized)
}

function printInstallError(error: unknown): void {
  if (error instanceof InstallValidationError) {
    console.error(pc.red(`Error: ${error.message}`))
    process.exitCode = 1
    return
  }

  throw error
}

export async function runInstallCommand(options: InstallCommandOptions = {}): Promise<void> {
  try {
    const selection = await resolveInstallSelection(options)
    const plan = buildInstallPlan(selection)

    console.log(renderInstallSummary(plan))

    if (selection.mode === 'interactive') {
      const confirmed = await confirmInstallPlan(plan)
      if (!confirmed) {
        console.log(pc.yellow(renderInstallCancelledMessage()))
        return
      }
    }

    console.log(renderInstallPendingMessage(plan))
  } catch (error) {
    printInstallError(error)
  }
}

export function createInstallCommand(): Command {
  const install = new Command('install')

  applyInstallOptions(install)

  install
    .description('Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex')
    .action(async (options: InstallCommandOptions) => {
      await runInstallCommand(options)
    })

  return install
}
