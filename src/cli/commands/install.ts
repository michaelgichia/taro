import { Command } from 'commander'
import pc from 'picocolors'
import {
  InstallValidationError,
  normalizeInstallOptions,
  toInstallSelection,
} from '../../install/options.js'
import { promptForInstallChoices } from '../../install/prompts.js'
import { RUNTIME_METADATA } from '../../install/types.js'
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

function renderSelectionSummary(selection: InstallSelection): string {
  const lines = selection.runtimes.map((runtime) => {
    return `- ${RUNTIME_METADATA[runtime].displayName}: ${selection.locations[runtime]}`
  })

  return [
    pc.bold('Installer selection captured'),
    ...lines,
    '',
    pc.dim('Prewrite install planning lands in the next plan.'),
  ].join('\n')
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
    console.log(renderSelectionSummary(selection))
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
