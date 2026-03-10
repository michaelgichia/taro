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
  resolveSelector,
} from '../../core/resolver.js'
import { scoreGeneratedTest } from '../../core/scorer.js'
import { analyzeBoundaryIsolation } from '../../core/boundary-intelligence.js'
import { verifySyntax } from '../../core/verifier.js'
import {
  analyzeSingleTestFile,
  discoverRepoRenderTargets,
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
import { planJsSuite } from '../../core/suite-planner.js'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  SelectorDescriptor,
  SelectorResolutionResult,
  StepId,
  VisualState,
} from '../../types/recording.js'
import type { HistoryEntry, ScoreResult } from '../../types/score.js'
import type { MockAnalysis } from '../../core/mock-intelligence.js'
import type { RepoRenderTargetCandidate } from '../../core/scanner.js'
import type { JsSuitePlan } from '../../core/suite-planner.js'

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
    pc.dim('[tayo]') +
      ` Score: ${scoreResult.total}/100 (${scoreResult.grade}) — ` +
      `query: ${scoreResult.dimensions.queryQuality}, ` +
      `assertions: ${scoreResult.dimensions.assertionSpecificity}, ` +
      `structure: ${scoreResult.dimensions.testStructure}, ` +
      `boundary: ${scoreResult.dimensions.boundaryIsolation}`
  )
}

function emitLowConfidenceBanner(scoreResult: ScoreResult): void {
  if (!scoreResult.requiresReview) {
    return
  }

  console.warn(
    pc.yellow(
      `[tayo] Manual review required — this generated test is still a draft (${scoreResult.total}/100, ${scoreResult.grade}).`
    )
  )

  if (scoreResult.blockers.length > 0) {
    console.warn(pc.yellow(`[tayo] Top blockers: ${scoreResult.blockers.join(' | ')}`))
  }
}

function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = [],
  boundaryIssues = analyzeBoundaryIsolation('')
): void {
  if (scoreResult.dimensions.queryQuality < 60) {
    const testIdCount = queryResults.filter((queryResult) => {
      return queryResult.method === 'getByTestId'
    }).length
    console.log(
      pc.yellow(
        `[tayo] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`
      )
    )
  }

  if (scoreResult.dimensions.assertionSpecificity < 60) {
    console.log(
      pc.yellow(
        '[tayo] Tip: Add specific matchers like toHaveValue() for better assertions'
      )
    )
  }

  if (scoreResult.dimensions.testStructure < 60) {
    console.log(
      pc.yellow(
        '[tayo] Tip: Split into multiple it() blocks for better test organization'
      )
    )
  }

  if (scoreResult.dimensions.boundaryIsolation < 60) {
    for (const issue of boundaryIssues) {
      console.warn(pc.yellow(`[tayo] Boundary: ${issue.message}`))
      console.warn(pc.yellow(`[tayo] Tip: ${issue.suggestion}`))
    }
  }
}

function summarizeCleanup(analyzedRecording: AnalyzedRecording): void {
  const { diagnostics } = analyzedRecording
  const parts: string[] = []

  if (diagnostics.removedRedundantClicks > 0) {
    parts.push(`${diagnostics.removedRedundantClicks} redundant click(s)`)
  }

  if ((diagnostics.preservedSemanticMarkers ?? 0) > 0) {
    parts.push(`${diagnostics.preservedSemanticMarkers} preserved semantic marker(s)`)
  }

  if ((diagnostics.unresolvedSemanticMarkers ?? 0) > 0) {
    parts.push(`${diagnostics.unresolvedSemanticMarkers} unresolved semantic marker(s)`)
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

  console.log(pc.dim('[tayo]') + ` Recording cleanup: ${parts.join(', ')}`)
}

function mergeAnalyzedStepState(
  recording: NormalizedRecording,
  analyzedRecording: AnalyzedRecording
): NormalizedRecording {
  const analyzedStepsById = new Map(
    analyzedRecording.steps
      .filter((step): step is NormalizedStep & { id: StepId } => Boolean(step.id))
      .map((step) => [step.id, step])
  )

  return {
    ...recording,
    steps: recording.steps.map((step) => {
      if (!step.id) {
        return step
      }

      const analyzedStep = analyzedStepsById.get(step.id)
      if (!analyzedStep) {
        return step
      }

      return {
        ...step,
        ...(analyzedStep.semanticMarkerCandidate
          ? { semanticMarkerCandidate: analyzedStep.semanticMarkerCandidate }
          : {}),
        ...(analyzedStep.semanticMarkerLink
          ? { semanticMarkerLink: analyzedStep.semanticMarkerLink }
          : {}),
        ...(analyzedStep.unresolvedSemanticMarker
          ? { unresolvedSemanticMarker: analyzedStep.unresolvedSemanticMarker }
          : {}),
        metadata: {
          ...step.metadata,
          ...analyzedStep.metadata,
        },
      }
    }),
  }
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

function isQueryDescriptor(value: unknown): value is QueryDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    typeof value.method === 'string'
  )
}

function getStepQueryDescriptor(step: NormalizedStep): QueryDescriptor | undefined {
  const query = step.metadata?.query
  return isQueryDescriptor(query) ? query : undefined
}

function groupSelectorsByStepId(
  selectors: SelectorDescriptor[]
): Map<StepId, SelectorDescriptor[]> {
  const grouped = new Map<StepId, SelectorDescriptor[]>()

  for (const selector of selectors) {
    const current = grouped.get(selector.stepId) ?? []
    current.push(selector)
    grouped.set(selector.stepId, current)
  }

  return grouped
}

function mergeSelectorResolutionWarnings(
  resolution: SelectorResolutionResult,
  warnings: string[]
): SelectorResolutionResult {
  const mergedWarnings = Array.from(new Set([...resolution.warnings, ...warnings]))
  if (mergedWarnings.length === resolution.warnings.length) {
    return resolution
  }

  return {
    ...resolution,
    warnings: mergedWarnings,
  }
}

function applySelectorResolution(
  step: NormalizedStep,
  resolution: SelectorResolutionResult
): NormalizedStep {
  return {
    ...step,
    metadata: {
      ...step.metadata,
      selectorResolution: resolution,
      ...(resolution.status === 'resolved' ? { query: resolution.query } : {}),
    },
  }
}

function rehydrateItGroups(itGroups: ItGroup[], steps: NormalizedStep[]): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]))

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => (step.id ? stepMap.get(step.id) ?? step : step)),
  }))
}

function rehydrateSuitePlan(plan: JsSuitePlan, steps: NormalizedStep[]): JsSuitePlan {
  const stepMap = new Map(steps.map((step) => [step.id, step]))

  const mapStep = (step: NormalizedStep) => (step.id ? stepMap.get(step.id) ?? step : step)

  return {
    ...plan,
    itGroups: rehydrateItGroups(plan.itGroups, steps),
    helpers: plan.helpers.map((helper) => ({
      ...helper,
      steps: helper.steps.map(mapStep),
    })),
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      steps: scenario.steps.map(mapStep),
    })),
  }
}

function isSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker)
}

function stripSemanticMarkerStepsFromItGroups(itGroups: ItGroup[]): ItGroup[] {
  return itGroups
    .map((group) => ({
      ...group,
      steps: group.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((group) => group.steps.length > 0)
}

function stripSemanticMarkerStepsFromHelpers(helpers: JsSuitePlan['helpers']): JsSuitePlan['helpers'] {
  return helpers
    .map((helper) => ({
      ...helper,
      steps: helper.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((helper) => helper.steps.length > 0)
}

function stripSemanticMarkerStepsFromScenarios(
  scenarios: JsSuitePlan['scenarios'],
  helpers: JsSuitePlan['helpers']
): JsSuitePlan['scenarios'] {
  const helperNames = new Set(helpers.map((helper) => helper.name))

  return scenarios
    .map((scenario) => ({
      ...scenario,
      steps: scenario.steps.filter((step) => !isSemanticMarkerStep(step)),
      helperRefs: scenario.helperRefs.filter((helperRef) => helperNames.has(helperRef)),
    }))
    .filter((scenario) => scenario.steps.length > 0 || scenario.helperRefs.length > 0)
}

function dedupeQueryResults(queryResults: QueryResult[]): QueryResult[] {
  const seen = new Set<string>()

  return queryResults.filter((queryResult) => {
    const key = `${queryResult.method}:${queryResult.query}:${queryResult.line ?? 'na'}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
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

  console.log(pc.dim('[tayo]') + ` Visual state: ${parts.join(', ')}`)
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

  console.log(pc.dim('[tayo]') + ` Mock analysis: ${parts.join(', ')}`)

  const topRecommendation = mockAnalysis.recommendations[0]
  if (topRecommendation) {
    console.log(
      pc.dim('[tayo]') +
        ` Mock hint: ${topRecommendation.kind} ${topRecommendation.target} (${topRecommendation.count} file(s))`
    )
  }

  const topLifecycle = mockAnalysis.mutationLifecycles[0]
  if (topLifecycle) {
    console.log(
      pc.dim('[tayo]') +
        ` Mutation lifecycle: ${topLifecycle.stages.join(' -> ')} in ${topLifecycle.file}`
    )
  }

  const topWarning = mockAnalysis.instabilityWarnings[0]
  if (topWarning) {
    console.warn(pc.yellow(`[tayo] Mock stability: ${topWarning.reason} (${topWarning.file})`))
  }
}

function summarizeBoundaryWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[tayo] Boundary: ${warning}`))
  }
}

function tokenizeSuiteHint(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
}

function scoreRenderTargetCandidate(
  candidate: RepoRenderTargetCandidate,
  recording: NormalizedRecording,
  mockAnalysis: MockAnalysis | null,
  suitePlan: JsSuitePlan
): number {
  const recordingTokens = new Set([
    ...tokenizeSuiteHint(recording.title),
    ...recording.steps.flatMap((step) => tokenizeSuiteHint(step.target ?? '')),
  ])
  const candidateTokens = new Set([
    ...tokenizeSuiteHint(candidate.symbol),
    ...tokenizeSuiteHint(candidate.importPath),
    ...tokenizeSuiteHint(candidate.sourceTestFile),
    ...candidate.helperNames.flatMap((name) => tokenizeSuiteHint(name)),
  ])

  let score = 0
  for (const token of candidateTokens) {
    if (recordingTokens.has(token)) {
      score += 3
    }
  }

  if (/Module$/u.test(candidate.symbol) && suitePlan.renderBoundary.kind === 'module') {
    score += 4
  }

  if (candidate.usesWithin) {
    score += 1
  }

  if (mockAnalysis?.repeatedTargets.length) {
    score += 1
  }

  return score
}

function resolveRepoRenderTarget(params: {
  candidates: RepoRenderTargetCandidate[]
  recording: NormalizedRecording
  mockAnalysis: MockAnalysis | null
  suitePlan: JsSuitePlan
}): RepoRenderTargetCandidate | null {
  const { candidates, recording, mockAnalysis, suitePlan } = params
  if (candidates.length === 0) {
    return null
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRenderTargetCandidate(candidate, recording, mockAnalysis, suitePlan),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.symbol.localeCompare(right.candidate.symbol))

  return ranked[0]?.candidate ?? null
}

function applyRepoRenderTarget(
  suitePlan: JsSuitePlan,
  renderTarget: RepoRenderTargetCandidate | null
): JsSuitePlan {
  if (!renderTarget) {
    return suitePlan
  }

  return {
    ...suitePlan,
    renderBoundary: {
      ...suitePlan.renderBoundary,
      resolvedTarget: renderTarget.symbol,
      confidence:
        suitePlan.renderBoundary.confidence === 'low' ? 'medium' : suitePlan.renderBoundary.confidence,
    },
    warnings: suitePlan.warnings.filter(
      (warning) =>
        !warning.includes('Tayo could not resolve the exact render target from repo context') &&
        !warning.includes('Prefer a repo-local module/container render boundary')
    ),
  }
}

function findRecordingUrl(analyzedRecording: AnalyzedRecording): string | undefined {
  return analyzedRecording.url ?? analyzedRecording.steps.find((step) => step.action === 'navigate')?.target
}

async function resolveJsGeneration(
  recording: NormalizedRecording,
  itGroups: ItGroup[]
): Promise<{
  itGroups: ItGroup[]
  queryResults: QueryResult[]
  recording: NormalizedRecording
  warnings: string[]
}> {
  const baseline = recording.baseline
  if (!baseline) {
    return {
      itGroups,
      queryResults: [],
      recording,
      warnings: [],
    }
  }

  const queryResults = baseline.queries.map(queryDescriptorToResult)
  const warnings: string[] = []
  const selectorGroups = groupSelectorsByStepId(baseline.selectors)
  const stepMap = new Map(
    recording.steps
      .filter((step): step is NormalizedStep & { id: StepId } => Boolean(step.id))
      .map((step) => [step.id, step])
  )
  const updatedSteps = new Map<StepId, NormalizedStep>()

  if (selectorGroups.size > 0 && recording.url) {
    console.log(
      pc.dim('[tayo]') +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright...`
    )
  }

  for (const [stepId, selectors] of selectorGroups) {
    const step = updatedSteps.get(stepId) ?? stepMap.get(stepId)
    if (!step) {
      continue
    }

    const preservedQuery = getStepQueryDescriptor(step)
    const stepWarnings: string[] = []
    let chosenResolution: SelectorResolutionResult | undefined

    if (preservedQuery) {
      chosenResolution = await resolveSelector(selectors[0]!, {
        url: recording.url,
        preservedQuery,
      })
    } else {
      for (const selector of selectors) {
        const resolution = await resolveSelector(selector, {
          url: recording.url,
        })

        if (resolution.status === 'resolved') {
          chosenResolution = resolution
          break
        }

        stepWarnings.push(...resolution.warnings)
        chosenResolution ??= resolution
      }
    }

    if (!chosenResolution) {
      continue
    }

    const resolution = mergeSelectorResolutionWarnings(chosenResolution, stepWarnings)
    updatedSteps.set(stepId, applySelectorResolution(step, resolution))

    if (resolution.status === 'resolved') {
      if (resolution.outcome !== 'preserved-query') {
        queryResults.push(queryDescriptorToResult(resolution.query))
      }
      continue
    }

    warnings.push(
      `QRY-03 [${stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
    )
  }

  const resolvedSteps = recording.steps.map((step) =>
    step.id ? updatedSteps.get(step.id) ?? step : step
  )

  return {
    itGroups: rehydrateItGroups(itGroups, resolvedSteps),
    queryResults: dedupeQueryResults(queryResults),
    recording: {
      ...recording,
      baseline: {
        ...baseline,
        itGroups: rehydrateItGroups(baseline.itGroups, resolvedSteps),
      },
      steps: resolvedSteps,
    },
    warnings,
  }
}

function summarizeSelectorWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[tayo] ${warning}`))
  }
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
  const visualDir = join(projectRoot, '.tayo', 'visual')

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
  const taroDir = join(projectRoot, '.tayo')
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
    console.error(pc.red('[tayo] Error: Post-write verification failed'))
    console.error(pc.red(`  ${verification.error}`))
    console.error(pc.red('  This is a Tayo bug. Please report it.'))
    process.exit(1)
  }

  console.log(pc.green('[tayo] ✓ post-write verified'))

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
    .description('Generate RTL test from Recorder JS or Chrome Recorder JSON export')
    .argument('<file>', 'Path to the recorder export file (.js or .json)')
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
      let repoRenderTargets: RepoRenderTargetCandidate[] = []
      if (parsedInput.source === 'js') {
        conventions = await readConventions(projectRoot)
        if (!conventions) {
          console.log(pc.dim('[tayo]') + ' Scanning project conventions...')
          conventions = await scanConventions(projectRoot)
        }
        repoRenderTargets = await discoverRepoRenderTargets(projectRoot)
      }

      console.log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps` +
          (parsedInput.source === 'js'
            ? `, ${normalizedRecording.baseline?.itGroups.length ?? 0} test group(s)`
            : '')
      )

      const analyzedRecording = analyzeRecording(normalizedRecording)
      const markerAwareRecording =
        parsedInput.source === 'js'
          ? mergeAnalyzedStepState(normalizedRecording, analyzedRecording)
          : normalizedRecording
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

      const outputPath = options.output ?? deriveOutputPath(filePath)
      const rawJsSuitePlan =
        parsedInput.source === 'js'
          ? planJsSuite({
              recording: markerAwareRecording,
              analyzedRecording,
              mockAnalysis,
              fallbackTitle: normalizedRecording.title,
            })
          : null

      const repoRenderTarget =
        parsedInput.source === 'js' && rawJsSuitePlan
          ? resolveRepoRenderTarget({
              candidates: repoRenderTargets,
              recording: normalizedRecording,
              mockAnalysis,
              suitePlan: rawJsSuitePlan,
            })
          : null

      const jsSuitePlan = rawJsSuitePlan
        ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
        : null

      if (jsSuitePlan) {
        summarizeBoundaryWarnings(jsSuitePlan.warnings)
      }

      const resolvedJsGeneration =
        parsedInput.source === 'js'
          ? await resolveJsGeneration(
              markerAwareRecording,
              jsSuitePlan?.itGroups ?? toItGroups(analyzedRecording, normalizedRecording.title)
            )
          : null

      if (resolvedJsGeneration) {
        summarizeSelectorWarnings(resolvedJsGeneration.warnings)
      }

      const hydratedSuitePlan =
        parsedInput.source === 'js' && jsSuitePlan
          ? rehydrateSuitePlan(
              jsSuitePlan,
              resolvedJsGeneration?.recording.steps ?? markerAwareRecording.steps
            )
          : jsSuitePlan
      const generationHelpers = hydratedSuitePlan
        ? stripSemanticMarkerStepsFromHelpers(hydratedSuitePlan.helpers)
        : undefined
      const generationScenarios =
        hydratedSuitePlan && generationHelpers
          ? stripSemanticMarkerStepsFromScenarios(hydratedSuitePlan.scenarios, generationHelpers)
          : undefined
      const generationItGroups =
        parsedInput.source === 'js'
          ? stripSemanticMarkerStepsFromItGroups(
              resolvedJsGeneration?.itGroups ??
                hydratedSuitePlan?.itGroups ??
                toItGroups(analyzedRecording, normalizedRecording.title)
            )
          : toItGroups(analyzedRecording, normalizedRecording.title)

      const generated =
        parsedInput.source === 'js'
          ? generateTestFromGroups(normalizedRecording.title, generationItGroups, {
              outputPath,
              dryRun: options.dryRun,
              conventions,
              queryResults: resolvedJsGeneration?.queryResults ?? [],
              helpers: generationHelpers,
              scenarios: generationScenarios,
              renderTarget: repoRenderTarget,
            })
          : generateTest(analyzedRecording, { outputPath, dryRun: options.dryRun })

      if (hydratedSuitePlan?.warnings.length) {
        generated.code = [
          ...hydratedSuitePlan.warnings.map((warning) => `// tayo-boundary-warning: ${warning}`),
          generated.code,
        ].join('\n')
      }

      if (parsedInput.source === 'js') {
        emitQuerySummary(resolvedJsGeneration?.queryResults ?? [])
      }

      const scoreResult =
        parsedInput.source === 'js'
          ? scoreGeneratedTest(generated.code, resolvedJsGeneration?.queryResults ?? [])
          : scoreGeneratedTest(generated.code)
      const boundaryIssues = analyzeBoundaryIsolation(generated.code)

      logScore(scoreResult)
      emitLowConfidenceBanner(scoreResult)
      emitScoreHints(scoreResult, resolvedJsGeneration?.queryResults ?? [], boundaryIssues)

      if (options.dryRun) {
        console.log(pc.yellow('\nDry run — test preview:\n'))
        console.log(pc.dim('─'.repeat(60)))
        console.log(generated.code)
        console.log(pc.dim('─'.repeat(60)))
        console.log(pc.dim(`\n[tayo] Score: ${scoreResult.total}/100 (${scoreResult.grade})`))
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
