/**
 * Generate command
 * Full pipeline: parse → validate → generate → write
 * Converts Chrome Recorder exports into React Testing Library test files.
 */

import { Command } from 'commander'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'
import pc from 'picocolors'
import { validateRecording, formatValidationErrors } from '../../core/validator.js'
import { parseRecording } from '../../core/parser.js'
import { generateTest } from '../../core/generator.js'
import { writeTestFile } from '../../core/writer.js'
import { parseJsRecording } from '../../core/js-parser.js'
import {
  captureVisualState,
  inspectElements,
  buildQuery,
  selectMatcher,
  emitQry03Warning,
} from '../../core/resolver.js'
import { scoreGeneratedTest } from '../../core/scorer.js'
import { verifySyntax } from '../../core/verifier.js'
import {
  analyzeSingleTestFile,
  mergeConventions,
  readConventions,
  scanConventions,
} from '../../core/scanner.js'
import {
  analyzeRecording,
  findVisualCaptureCandidates,
} from '../../core/recording-intelligence.js'
import { generateTestFromGroups, emitQuerySummary } from '../../core/generator.js'
import type {
  AnalyzedRecording,
  ItGroup,
  QueryResult,
  VisualState,
} from '../../types/recording.js'
import type { HistoryEntry, ScoreResult } from '../../types/score.js'

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

function logScore(scoreResult: ScoreResult): void {
  console.log(
    pc.dim('[taro]') +
      ` Score: ${scoreResult.total}/100 (${scoreResult.grade}) — ` +
      `query: ${scoreResult.dimensions.queryQuality}, ` +
      `assertions: ${scoreResult.dimensions.assertionSpecificity}, ` +
      `structure: ${scoreResult.dimensions.testStructure}`
  )
}

function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = []
): void {
  if (scoreResult.dimensions.queryQuality < 60) {
    const testIdCount = queryResults.filter((queryResult) => {
      return queryResult.method === 'getByTestId'
    }).length
    console.log(
      pc.yellow(
        `[taro] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`
      )
    )
  }

  if (scoreResult.dimensions.assertionSpecificity < 60) {
    console.log(
      pc.yellow(
        '[taro] Tip: Add specific matchers like toHaveValue() for better assertions'
      )
    )
  }

  if (scoreResult.dimensions.testStructure < 60) {
    console.log(
      pc.yellow(
        '[taro] Tip: Split into multiple it() blocks for better test organization'
      )
    )
  }
}

function summarizeCleanup(analyzedRecording: AnalyzedRecording): void {
  const { diagnostics } = analyzedRecording
  const parts: string[] = []

  if (diagnostics.removedRedundantClicks > 0) {
    parts.push(`${diagnostics.removedRedundantClicks} redundant click(s)`)
  }

  if (diagnostics.removedDoubleClickNoise > 0) {
    parts.push(`${diagnostics.removedDoubleClickNoise} dblClick noise event(s)`)
  }

  if (diagnostics.removedCursorWander > 0) {
    parts.push(`${diagnostics.removedCursorWander} cursor wander step(s)`)
  }

  if (diagnostics.intentGroupCount > 1) {
    parts.push(`${diagnostics.intentGroupCount} intent groups`)
  }

  if (parts.length === 0) {
    return
  }

  console.log(pc.dim('[taro]') + ` Recording cleanup: ${parts.join(', ')}`)
}

function toItGroups(analyzedRecording: AnalyzedRecording, fallbackTitle: string): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups
  }

  return [
    {
      name: fallbackTitle || 'recorded flow',
      steps: analyzedRecording.steps,
    },
  ]
}

function summarizeVisualState(visualState: VisualState | null): void {
  if (!visualState) {
    return
  }

  const parts = [visualState.reason]
  if (visualState.dialog?.title) {
    parts.push(`dialog=${visualState.dialog.title}`)
  }
  if (visualState.screenshotPath) {
    parts.push(`screenshot=${visualState.screenshotPath}`)
  }

  console.log(pc.dim('[taro]') + ` Visual state: ${parts.join(', ')}`)
}

function findRecordingUrl(analyzedRecording: AnalyzedRecording): string | undefined {
  return analyzedRecording.steps.find((step) => step.action === 'navigate')?.target
}

async function maybeCaptureVisualState(params: {
  analyzedRecording: AnalyzedRecording
  projectRoot: string
  selector?: string
  url?: string
}): Promise<VisualState | null> {
  const { analyzedRecording, projectRoot, selector, url } = params
  if (!url) {
    return null
  }

  const candidates = findVisualCaptureCandidates(analyzedRecording)
  const visualDir = join(projectRoot, '.taro', 'visual')

  if (candidates.length > 0) {
    await mkdir(visualDir, { recursive: true })
    return captureVisualState(url, {
      reason: candidates[0]!.reason,
      screenshotDir: visualDir,
      selector: candidates[0]!.selector,
    })
  }

  if (selector) {
    await mkdir(visualDir, { recursive: true })
    return captureVisualState(url, {
      reason: 'ambiguous-ui',
      screenshotDir: visualDir,
      selector,
    })
  }

  return null
}

async function appendHistoryEntry(
  projectRoot: string,
  historyEntry: HistoryEntry
): Promise<void> {
  const taroDir = join(projectRoot, '.taro')
  await mkdir(taroDir, { recursive: true })

  const historyPath = join(taroDir, 'history.json')
  let history: HistoryEntry[] = []

  try {
    await access(historyPath)
    const historyContent = await readFile(historyPath, 'utf-8')
    history = JSON.parse(historyContent) as HistoryEntry[]
  } catch {
    history = []
  }

  history.push(historyEntry)
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')
}

async function finalizeGeneratedOutput(params: {
  code: string
  outputPath: string
  projectRoot: string
  recordingFile: string
  scoreResult: ScoreResult
}): Promise<void> {
  const { code, outputPath, projectRoot, recordingFile, scoreResult } = params

  const verification = verifySyntax(code, outputPath)
  if (!verification.valid) {
    console.error(pc.red('[taro] Error: Post-write verification failed'))
    console.error(pc.red(`  ${verification.error}`))
    console.error(pc.red('  This is a Taro bug. Please report it.'))
    process.exit(1)
  }

  console.log(pc.green('[taro] ✓ post-write verified'))

  await appendHistoryEntry(projectRoot, {
    timestamp: new Date().toISOString(),
    recordingFile,
    score: scoreResult.total,
    grade: scoreResult.grade,
    dimensions: scoreResult.dimensions,
  })

  try {
    const detectedConventions = await analyzeSingleTestFile(projectRoot, outputPath)
    await mergeConventions(projectRoot, detectedConventions)
  } catch {
    // Convention learning is best-effort, do not fail generation.
  }
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
      const projectRoot = cwd()

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

        const analyzedRecording = analyzeRecording({
          title: jsResult.title,
          steps: jsResult.steps,
          rawStepCount: jsResult.steps.length,
        })

        summarizeCleanup(analyzedRecording)
        const visualState = await maybeCaptureVisualState({
          analyzedRecording,
          projectRoot,
          selector: jsResult.querySelectorCalls[0]?.selector,
          url: jsResult.environmentUrl,
        })
        summarizeVisualState(visualState)

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
        const generated = generateTestFromGroups(jsResult.title, toItGroups(analyzedRecording, jsResult.title), {
          outputPath,
          dryRun: options.dryRun,
          conventions,
          queryResults,
        })

        // Step 5: Emit query quality summary (QRY-01)
        emitQuerySummary(queryResults)

        // Pre-write audit: compute score before writing
        const scoreResult = scoreGeneratedTest(generated.code, queryResults)
        logScore(scoreResult)
        emitScoreHints(scoreResult, queryResults)

        // Step 6: Write or preview
        if (options.dryRun) {
          console.log(pc.yellow('\nDry run — test preview:\n'))
          console.log(pc.dim('─'.repeat(60)))
          console.log(generated.code)
          console.log(pc.dim('─'.repeat(60)))
          console.log(pc.dim(`\n[taro] Score: ${scoreResult.total}/100 (${scoreResult.grade})`))
          console.log(pc.yellow(`\nWould write to: ${pc.bold(outputPath)}`))
          return
        }

        try {
          const result = await writeTestFile(generated.code, outputPath, {
            force: options.force,
            createDir: true,
          })

          await finalizeGeneratedOutput({
            code: generated.code,
            outputPath: result.filePath,
            projectRoot,
            recordingFile: filePath,
            scoreResult,
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

      const analyzedRecording = analyzeRecording(normalizedRecording)
      summarizeCleanup(analyzedRecording)
      const visualState = await maybeCaptureVisualState({
        analyzedRecording,
        projectRoot,
        url: findRecordingUrl(analyzedRecording),
      })
      summarizeVisualState(visualState)

      // 6. Generate test code
      const outputPath = options.output ?? deriveOutputPath(filePath)
      const generated = generateTest(analyzedRecording, { outputPath, dryRun: options.dryRun })
      const scoreResult = scoreGeneratedTest(generated.code)

      logScore(scoreResult)
      emitScoreHints(scoreResult)

      // 7. Write or preview
      if (options.dryRun) {
        console.log(pc.yellow('\nDry run — test preview:\n'))
        console.log(pc.dim('─'.repeat(60)))
        console.log(generated.code)
        console.log(pc.dim('─'.repeat(60)))
        console.log(pc.dim(`\n[taro] Score: ${scoreResult.total}/100 (${scoreResult.grade})`))
        console.log(pc.yellow(`\nWould write to: ${pc.bold(outputPath)}`))
        return
      }

      try {
        const result = await writeTestFile(generated.code, outputPath, {
          force: options.force,
          createDir: true,
        })
        await finalizeGeneratedOutput({
          code: generated.code,
          outputPath: result.filePath,
          projectRoot,
          recordingFile: filePath,
          scoreResult,
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
