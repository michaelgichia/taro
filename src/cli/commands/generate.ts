/**
 * Generate command
 * Full pipeline: parse → validate → generate → write
 * Converts Chrome Recorder exports into React Testing Library test files.
 */

import { Command } from 'commander'
import { access, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'
import pc from 'picocolors'
import { validateRecording, formatValidationErrors } from '../../core/validator.js'
import { parseRecording } from '../../core/parser.js'
import { generateTest } from '../../core/generator.js'
import { writeTestFile } from '../../core/writer.js'
import { parseJsRecording } from '../../core/js-parser.js'
import { inspectElements, buildQuery, selectMatcher, emitQry03Warning } from '../../core/resolver.js'
import { readConventions, scanConventions } from '../../core/scanner.js'
import { generateTestFromGroups, emitQuerySummary } from '../../core/generator.js'
import type { QueryResult } from '../../types/recording.js'

export interface GenerateOptions {
  output?: string
  dryRun?: boolean
  force?: boolean
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath, '.js').replace(/\.(json)$/, '')
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

      // Detect JS format
      const isJsFormat = filePath.endsWith('.js') || rawContent.includes('@jest-environment-options')

      if (isJsFormat) {
        // Step 1: Context scan (CTX-01–05)
        const projectRoot = cwd()
        let conventions = await readConventions(projectRoot)
        if (!conventions) {
          console.log(pc.dim('[taro]') + ' Scanning project conventions...')
          conventions = await scanConventions(projectRoot)
        }

        // Step 2: Parse JS file via Babel AST (QRY-01, TEST-01)
        let jsResult
        try {
          jsResult = await parseJsRecording(rawContent)
        } catch (err) {
          console.error(pc.red('Error:') + ` Failed to parse JS recording: ${String(err)}`)
          process.exit(1)
        }

        console.log(
          pc.green('Parsed:') +
            ` ${pc.bold(jsResult.title)} — ${jsResult.steps.length} steps, ${jsResult.itGroups.length} test group(s)`
        )

        // Step 3: Resolve document.querySelector selectors via Playwright (QRY-02, QRY-03)
        const queryResults: QueryResult[] = []

        if (jsResult.querySelectorCalls.length > 0 && jsResult.environmentUrl) {
          console.log(
            pc.dim('[taro]') +
              ` Resolving ${jsResult.querySelectorCalls.length} selector(s) via Playwright...`
          )
          const selectors = jsResult.querySelectorCalls.map((c) => c.selector)
          const elementMap = await inspectElements(jsResult.environmentUrl, selectors)

          for (const call of jsResult.querySelectorCalls) {
            const info = elementMap.get(call.selector) ?? null
            if (!info) {
              // App not running or element not found — emit QRY-02 warning (handled inside inspectElements)
              // Use getByTestId fallback
              const fallbackResult = buildQuery(
                { tagName: 'div', role: null, ariaLabel: null, ariaLabelledBy: null,
                  innerText: '', value: undefined, type: undefined, placeholder: null, isPresent: false },
                call.selector
              )
              queryResults.push({ ...fallbackResult, line: call.line })
            } else {
              const result = buildQuery(info, call.selector)
              if (result.quality === 'fragile') emitQry03Warning(call.selector)
              const matcher = selectMatcher(info, 'assert')
              queryResults.push({ ...result, matcher, line: call.line })
            }
          }
        } else if (jsResult.querySelectorCalls.length > 0 && !jsResult.environmentUrl) {
          console.warn(
            pc.yellow('[taro]') +
              ' QRY-02: No @jest-environment-options URL found — cannot resolve document.querySelector selectors. Falling back to getByTestId.'
          )
        }

        // Step 4: Generate test code with multi-it() blocks (TEST-01, TEST-03)
        const outputPath = options.output ?? deriveOutputPath(filePath)
        const generated = generateTestFromGroups(jsResult.title, jsResult.itGroups, {
          outputPath,
          dryRun: options.dryRun,
          conventions,
          queryResults,
        })

        // Step 5: Emit query quality summary (QRY-01)
        emitQuerySummary(queryResults)

        // Step 6: Write or preview
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

        return  // Exit action for JS path — do not fall through to JSON pipeline
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
