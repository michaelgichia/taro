#!/usr/bin/env node

/**
 * Taro CLI entry point
 * Installer-first package surface with generator access preserved under `generate`.
 */

import { Command } from 'commander'
import pc from 'picocolors'
import { createGenerateCommand } from './cli/commands/generate.js'
import {
  applyInstallOptions,
  createInstallCommand,
  runInstallCommand,
} from './cli/commands/install.js'
import type { InstallCommandOptions } from './install/types.js'

const program = new Command()

applyInstallOptions(program)

program
  .name('taro')
  .description(
    `${pc.bold('@tayo-dev/rtl')} — Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex`
  )
  .version('1.0.0', '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command')
  .addHelpText(
    'after',
    `\nExisting capability:\n  ${pc.bold('taro generate <file>')}  Generate RTL tests from Chrome Recorder exports`
  )
  .action(async () => {
    await runInstallCommand(program.optsWithGlobals() as InstallCommandOptions)
  })

program.addCommand(createInstallCommand())
program.addCommand(createGenerateCommand())

program.parse(process.argv)
