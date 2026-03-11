#!/usr/bin/env node

/**
 * Taro CLI entry point
 * Installer-first package surface with runtime-native generation entrypoints.
 */

import { Command } from 'commander'
import pc from 'picocolors'
import { createGenerateCommand } from './cli/commands/generate.js'
import { createInitCommand } from './cli/commands/init.js'
import {
  applyInstallOptions,
  createInstallCommand,
  runInstallCommand,
} from './cli/commands/install.js'
import { createRefreshCommand } from './cli/commands/refresh.js'
import { createVersionCommand } from './cli/commands/version.js'
import type { InstallCommandOptions } from './install/types.js'
import { TARO_VERSION } from './version.js'

const program = new Command()

if (process.argv[2] === '__generate') {
  await createGenerateCommand().parseAsync(process.argv.slice(3), { from: 'user' })
} else if (process.argv[2] === '__init') {
  await createInitCommand().parseAsync(process.argv.slice(3), { from: 'user' })
} else if (process.argv[2] === '__refresh') {
  await createRefreshCommand().parseAsync(process.argv.slice(3), { from: 'user' })
} else {
  applyInstallOptions(program)

  program
    .name('tayo')
    .description(
      `${pc.bold('@tayo-dev/rtl')} — Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex`
    )
    .version(TARO_VERSION, '-v, --version', 'Output the current version')
    .helpOption('-h, --help', 'Display help for command')
    .addHelpText(
      'after',
      '\nAfter install, use the runtime-native Taro help/init/generate/refresh entrypoints.'
    )
    .action(async () => {
      await runInstallCommand(program.optsWithGlobals() as InstallCommandOptions)
    })

  program.addCommand(createInstallCommand())
  program.addCommand(createVersionCommand())
  program.parse(process.argv)
}
