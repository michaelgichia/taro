/**
 * Generate command
 * Full pipeline: parse → validate → generate → write
 * Converts Recorder exports into React Testing Library test files.
 */

import { Command } from 'commander'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'
import pc from 'picocolors'
import { generateTest } from '../../core/generator.js'
import { writeTestFile } from '../../core/writer.js'
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
import { analyzeMocks } from '../../core/mock-intelligence.js'
import { generateTestFromGroups, emitQuerySummary } from '../../core/generator.js'
import { loadInput } from '../../core/input-loader.js'
import { normalizeJsBaseline } from '../../core/baseline-normalizer.js'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  QueryDescriptor,
  QueryResult,
  VisualState,
} from '../../types/recording.js'
import type { HistoryEntry, ScoreResult } from '../../types/score.js'
import type { MockAnalysis } from '../../core/mock-intelligence.js'

export interface GenerateOptions {
  output?: string
  dryRun?: boolean
  force?: boolean
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath).replace(/\.(json|[cm]?[jt]sx?)$/, '')
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

function queryDescriptorToResult(descriptor: QueryDescriptor): QueryResult {
  return {
    query: descriptor.raw ?? descriptor.target ?? descriptor.method,
    quality: descriptor.quality ?? 'fragile',
    method: descriptor.method,
    line: descriptor.line,
  }
}

function getPrimarySelector(recording: NormalizedRecording): string | undefined {
  return recording.baseline?.selectors[0]?.selector
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

function summarizeMockAnalysis(mockAnalysis: MockAnalysis | null): void {
  if (!mockAnalysis) {
    return
  }

  const parts: string[] = []

  if (mockAnalysis.repeatedTargets.length > 0) {
    parts.push(`${mockAnalysis.repeatedTargets.length} repeated target(s)`)
  }

  if (mockAnalysis.mutationLifecycles.length > 0) {
    parts.push(`${mockAnalysis.mutationLifecycles.length} mutation flow(s)`)
  }

  if (mockAnalysis.instabilityWarnings.length > 0) {
    parts.push(`${mockAnalysis.instabilityWarnings.length} stability warning(s)`)
  }

  if (parts.length === 0) {
    return
  }

  console.log(pc.dim('[taro]') + ` Mock analysis: ${parts.join(', ')}`)

  const topRecommendation = mockAnalysis.recommendations[0]
  if (topRecommendation) {
    console.log(
      pc.dim('[taro]') +
        ` Mock hint: ${topRecommendation.kind} ${topRecommendation.target} (${topRecommendation.count} file(s))`
    )
  }

  const topLifecycle = mockAnalysis.mutationLifecycles[0]
  if (topLifecycle) {
    console.log(
      pc.dim('[taro]') +
        ` Mutation lifecycle: ${topLifecycle.stages.join(' -> ')} in ${topLifecycle.file}`
    )
  }

  const topWarning = mockAnalysis.instabilityWarnings[0]
  if (topWarning) {
    console.warn(pc.yellow(`[taro] Mock stability: ${topWarning.reason} (${topWarning.file})`))
  }
}

function findRecordingUrl(analyzedRecording: AnalyzedRecording): string | undefined {
  return analyzedRecording.url ?? analyzedRecording.steps.find((step) => step.action === 'navigate')?.target
}

async function resolveJsQueryResults(recording: NormalizedRecording): Promise<QueryResult[]> {
  const baseline = recording.baseline
  if (!baseline) {
    return []
  }

  const queryResults = baseline.queries.map(queryDescriptorToResult)

  if (baseline.selectors.length > 0 && recording.url) {
    console.log(
      pc.dim('[taro]') +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright...`
    )

    const selectors = baseline.selectors.map((descriptor) => descriptor.selector)
    const elementMap = await inspectElements(recording.url, selectors)

    for (const descriptor of baseline.selectors) {
      const info = elementMap.get(descriptor.selector) ?? null
      if (!info) {
        const fallbackResult = buildQuery(
          {
            tagName: 'div',
            role: null,
            ariaLabel: null,
            ariaLabelledBy: null,
            innerText: '',
            value: undefined,
            type: undefined,
            placeholder: null,
            isPresent: false,
          },
          descriptor.selector
        )
        queryResults.push({ ...fallbackResult, line: descriptor.line })
        continue
      }

      const result = buildQuery(info, descriptor.selector)
      if (result.quality === 'fragile') {
        emitQry03Warning(descriptor.selector)
      }

      const matcher = selectMatcher(info, 'assert')
      queryResults.push({ ...result, matcher, line: descriptor.line })
    }
  } else if (baseline.selectors.length > 0 && !recording.url) {
    console.warn(
      pc.yellow('[taro]') +
        ' QRY-02: No @jest-environment-options URL found — cannot resolve document.querySelector selectors. Falling back to getByTestId.'
    )
  }

  return queryResults
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

async function maybeAnalyzeMocks(projectRoot: string): Promise<MockAnalysis | null> {
  try {
    return await analyzeMocks(projectRoot)
  } catch {
    return null
  }
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
    .description('Generate RTL test from Recorder export')
    .argument('<file>', 'Path to the recorder export file')
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

      let parsedInput: Awaited<ReturnType<typeof loadInput>>
      try {
        parsedInput = await loadInput(filePath)
      } catch (err) {
        console.error(
          pc.red('Error:') + ` Failed to parse recording: ${pc.bold(filePath)}\n${String(err)}`
        )
        process.exit(1)
      }

      const normalizedRecording =
        parsedInput.source === 'js' ? normalizeJsBaseline(parsedInput) : parsedInput.recording

      let conventions = undefined
      if (parsedInput.source === 'js') {
        conventions = await readConventions(projectRoot)
        if (!conventions) {
          console.log(pc.dim('[taro]') + ' Scanning project conventions...')
          conventions = await scanConventions(projectRoot)
        }
      }

      console.log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps` +
          (parsedInput.source === 'js'
            ? `, ${normalizedRecording.baseline?.itGroups.length ?? 0} test group(s)`
            : '')
      )

      const analyzedRecording = analyzeRecording(normalizedRecording)
      summarizeCleanup(analyzedRecording)
      const visualState = await maybeCaptureVisualState({
        analyzedRecording,
        projectRoot,
        selector: getPrimarySelector(normalizedRecording),
        url: findRecordingUrl(analyzedRecording),
      })
      summarizeVisualState(visualState)
      const mockAnalysis = await maybeAnalyzeMocks(projectRoot)
      summarizeMockAnalysis(mockAnalysis)

      const queryResults =
        parsedInput.source === 'js' ? await resolveJsQueryResults(normalizedRecording) : []

      const outputPath = options.output ?? deriveOutputPath(filePath)
      const generated =
        parsedInput.source === 'js'
          ? generateTestFromGroups(normalizedRecording.title, toItGroups(analyzedRecording, normalizedRecording.title), {
              outputPath,
              dryRun: options.dryRun,
              conventions,
              queryResults,
            })
          : generateTest(analyzedRecording, { outputPath, dryRun: options.dryRun })

      if (parsedInput.source === 'js') {
        emitQuerySummary(queryResults)
      }

      const scoreResult =
        parsedInput.source === 'js'
          ? scoreGeneratedTest(generated.code, queryResults)
          : scoreGeneratedTest(generated.code)

      logScore(scoreResult)
      emitScoreHints(scoreResult, queryResults)

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
