#!/usr/bin/env node

/**
 * Tayo CLI entry point
 * Installer-first package surface with runtime-native generation entrypoints.
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

if (process.argv[2] === '__generate') {
  await createGenerateCommand().parseAsync(process.argv.slice(3), { from: 'user' })
} else {
  applyInstallOptions(program)

  program
    .name('tayo')
    .description(
      `${pc.bold('@tayo-dev/rtl')} — Install Tayo into Claude Code, OpenCode, Gemini CLI, or Codex`
    )
    .version('1.4.1', '-v, --version', 'Output the current version')
    .helpOption('-h, --help', 'Display help for command')
    .addHelpText('after', '\nAfter install, use the runtime-native Tayo help/generate entrypoints.')
    .action(async () => {
      await runInstallCommand(program.optsWithGlobals() as InstallCommandOptions)
    })

  program.addCommand(createInstallCommand())
  program.parse(process.argv)
}
