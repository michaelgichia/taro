#!/usr/bin/env node

/**
 * Taro CLI entry point
 * Generates React Testing Library tests from Chrome Recorder exports.
 */

import { Command } from 'commander'
import pc from 'picocolors'
import { createGenerateCommand } from './cli/commands/generate.js'

const program = new Command()

program
  .name('taro')
  .description(
    pc.bold('Taro') +
      ' — Generate React Testing Library tests from Chrome Recorder exports'
  )
  .version('0.1.0', '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command')

program.addCommand(createGenerateCommand())

program.parse(process.argv)
