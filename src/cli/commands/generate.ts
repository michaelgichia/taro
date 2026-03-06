/**
 * Generate command
 * Full pipeline: parse → validate → generate → write
 * Converts Chrome Recorder exports into React Testing Library test files.
 */

import { Command } from 'commander'
import { access, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import pc from 'picocolors'
import { validateRecording, formatValidationErrors } from '../../core/validator.js'
import { parseRecording } from '../../core/parser.js'
import { generateTest } from '../../core/generator.js'
import { writeTestFile } from '../../core/writer.js'

export interface GenerateOptions {
  output?: string
  dryRun?: boolean
  force?: boolean
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath, '.json')
  return join(dir, `${name}.test.tsx`)
}

export function createGenerateCommand(): Command {
  const generate = new Command('generate')

  generate
    .description('Generate RTL test from Chrome Recorder export')
    .argument('<file>', 'Path to the Chrome Recorder JSON export file')
    .option('-o, --output <path>', 'Output file path for the generated test')
    .option('-d, --dry-run', 'Preview the generated test without writing to disk', false)
    .option('-f, --force', 'Overwrite existing test file', false)
    .action(async (file: string, options: GenerateOptions) => {
      const filePath = resolve(file)

      // 1. Verify file is accessible
      try {
        await access(filePath)
      } catch {
        console.error(
          pc.red('Error:') + ` File not found or not accessible: ${pc.bold(filePath)}`
        )
        process.exit(1)
      }

      // 2. Read raw JSON
      let rawContent: string
      try {
        rawContent = await readFile(filePath, 'utf-8')
      } catch (err) {
        console.error(
          pc.red('Error:') + ` Failed to read file: ${pc.bold(filePath)}\n${String(err)}`
        )
        process.exit(1)
      }

      // 3. Parse JSON
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

      // 4. Validate schema
      const validation = validateRecording(parsedJson)
      if (!validation.valid) {
        console.error(
          pc.red('Error:') +
            ` Invalid Chrome Recorder format in ${pc.bold(filePath)}\n` +
            formatValidationErrors(validation.errors)
        )
        process.exit(1)
      }

      // 5. Normalize steps
      let normalizedRecording
      try {
        normalizedRecording = await parseRecording(filePath)
      } catch (err) {
        console.error(pc.red('Error:') + ` Failed to parse recording: ${String(err)}`)
        process.exit(1)
      }

      console.log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps`
      )

      // 6. Generate test code
      const outputPath = options.output ?? deriveOutputPath(filePath)
      const generated = generateTest(normalizedRecording, { outputPath, dryRun: options.dryRun })

      // 7. Write or preview
      if (options.dryRun) {
        console.log(pc.yellow('\nDry run — test preview:\n'))
        console.log(pc.dim('─'.repeat(60)))
        console.log(generated.code)
        console.log(pc.dim('─'.repeat(60)))
        console.log(pc.yellow(`\nWould write to: ${pc.bold(outputPath)}`))
        return
      }

      try {
        const result = await writeTestFile(generated.code, outputPath, {
          force: options.force,
          createDir: true,
        })
        const action = result.overwritten ? pc.yellow('Updated') : pc.green('Created')
        console.log(`${action}: ${pc.bold(result.filePath)}`)
      } catch (err) {
        console.error(pc.red('Error:') + ` ${String(err)}`)
        process.exit(1)
      }
    })

  return generate
}
