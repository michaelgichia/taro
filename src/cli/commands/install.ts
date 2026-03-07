import { Command } from 'commander'
import pc from 'picocolors'
export interface InstallCommandOptions {
  claude?: boolean
  opencode?: boolean
  gemini?: boolean
  codex?: boolean
  all?: boolean
  global?: boolean
  local?: boolean
}

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

export async function runInstallCommand(_options: InstallCommandOptions = {}): Promise<void> {
  console.log(
    pc.bold('Taro installer') +
      ' — installer-first runtime setup is enabled for this package.'
  )
  console.log(
    pc.dim(
      'Use `taro install --help` to review setup flags or `taro generate --help` to access the existing generator.'
    )
  )
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
