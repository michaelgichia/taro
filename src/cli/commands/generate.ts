/**
 * Generate command
 * Generates RTL tests from Chrome Recorder export files.
 */

import { Command } from 'commander'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pc from 'picocolors'

export interface GenerateOptions {
  output?: string
  dryRun?: boolean
}

export function createGenerateCommand(): Command {
  const generate = new Command('generate')

  generate
    .description('Generate RTL test from Chrome Recorder export')
    .argument('<file>', 'Path to the Chrome Recorder JSON export file')
    .option('-o, --output <path>', 'Output file path for the generated test')
    .option(
      '-d, --dry-run',
      'Preview the generated test without writing to disk',
      false
    )
    .action(async (file: string, options: GenerateOptions) => {
      const filePath = resolve(file)

      try {
        await access(filePath)
      } catch {
        console.error(
          pc.red('Error:') +
            ` File not found or not accessible: ${pc.bold(filePath)}`
        )
        process.exit(1)
      }

      let rawContent: string
      try {
        rawContent = await readFile(filePath, 'utf-8')
      } catch (err) {
        console.error(
          pc.red('Error:') +
            ` Failed to read file: ${pc.bold(filePath)}\n${String(err)}`
        )
        process.exit(1)
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(rawContent)
      } catch {
        console.error(
          pc.red('Error:') +
            ` Invalid JSON in file: ${pc.bold(filePath)}\nEnsure the file is a valid Chrome Recorder export.`
        )
        process.exit(1)
      }

      console.log(pc.green('File found:') + ` ${pc.bold(filePath)}`)

      if (options.dryRun) {
        console.log(
          pc.yellow('Dry run mode:') +
            ' Test will be generated but not written to disk.'
        )
      }

      // Pipeline stub — full implementation in later plans
      console.log(pc.dim('Parsed recording with keys:'), Object.keys(parsedJson as object).join(', '))
      console.log(pc.dim('Pipeline integration coming in Phase 1 plans 03-06.'))

      if (options.output) {
        console.log(pc.dim('Output path:'), options.output)
      }
    })

  return generate
}
