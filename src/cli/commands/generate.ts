/**
 * Generate command
 * Internal runtime-only generation pipeline for Testing Library Recorder JS exports.
 */

import { Command } from 'commander'
import { access, mkdir, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { cwd } from 'node:process'
import pc from 'picocolors'
import { ensureProjectStateDir } from '../../project-state.js'
import { writeTestFile } from '../../core/writer.js'
import {
  captureVisualState,
  resolveSelector,
} from '../../core/resolver.js'
import { scoreGeneratedTest } from '../../core/scorer.js'
import { analyzeBoundaryIsolation } from '../../core/boundary-intelligence.js'
import { verifySyntax } from '../../core/verifier.js'
import {
  analyzeRecording,
  findVisualCaptureCandidates,
} from '../../core/recording-intelligence.js'
import { analyzeMocks } from '../../core/mock-intelligence.js'
import { generateTestFromGroups, emitQuerySummary } from '../../core/generator.js'
import { loadInput } from '../../core/input-loader.js'
import { normalizeJsBaseline } from '../../core/baseline-normalizer.js'
import { planJsSuite } from '../../core/suite-planner.js'
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '../../core/state.js'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  SemanticMarkerAssertionUnresolvedReason,
  SelectorDescriptor,
  SelectorResolutionResult,
  StepId,
  UnresolvedSemanticMarkerAssertionResolution,
  VisualState,
} from '../../types/recording.js'
import type { MarkerCoverageTotals, ScoreResult } from '../../types/score.js'
import type { MockAnalysis } from '../../core/mock-intelligence.js'
import type { JsSuitePlan } from '../../core/suite-planner.js'
import type { RepoRenderTargetCandidate, ResolvedTaroPackageProfile } from '../../types/state.js'
import { isTestIdQueryMethod } from '../../core/query-policy.js'

const EMPTY_MARKER_COVERAGE: MarkerCoverageTotals = {
  detected: 0,
  emitted: 0,
  unresolved: 0,
}

const CONTEXT_SEARCH_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.taro',
  'coverage',
  '.next',
  '.nuxt',
])

const CONTEXT_SEARCH_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const GENERIC_CONTEXT_TERMS = new Set([
  'add',
  'back',
  'cancel',
  'close',
  'continue',
  'done',
  'next',
  'open',
  'save',
  'submit',
])

const UNRESOLVED_MARKER_REASON_GUIDANCE: Record<
  SemanticMarkerAssertionUnresolvedReason,
  string
> = {
  'missing-marker-candidate':
    'Semantic marker candidate metadata is missing. Re-record or keep marker metadata intact.',
  'missing-anchor':
    'Marker has no reliable anchor step. Re-record with marker near the intended assertion moment.',
  'missing-query':
    'Recorder evidence is missing an accessible query. Capture a clearer role/name or visible text.',
  'unsupported-proof-subject':
    'Marker proof subject is unsupported for safe RTL conversion. Use role/name or visible text proof.',
  'ambiguous-field-context':
    'Field context is ambiguous. Capture a single, specific field label or value target.',
  'unsupported-field-context':
    'Field context could not map to a trusted RTL field query. Record a clearer label/placeholder.',
  'generic-container':
    'Marker points to a generic container. Capture the concrete user-facing element instead.',
  'css-only-evidence':
    'Marker is backed only by CSS-like evidence. Capture semantic role/name or visible text evidence.',
  'icon-only-target':
    'Marker target is icon-only and ambiguous. Capture surrounding accessible text context.',
  'hidden-evidence':
    'Marker evidence depends on hidden/implementation selectors. Capture user-visible evidence instead.',
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '')
  return join(dir, `${name}.test.tsx`)
}

interface RepoContextMatch {
  filePath: string
  matchedTerms: string[]
  kind: 'source' | 'test'
  score: number
}

function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  )
}

function normalizeContextTerm(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length < 4 || looksLikeSelectorLikeString(normalized)) {
    return null
  }

  const lower = normalized.toLowerCase()
  if (!/\s/.test(normalized) && GENERIC_CONTEXT_TERMS.has(lower)) {
    return null
  }

  return normalized
}

function scoreContextTerm(term: string): number {
  let score = term.length
  if (/\s/.test(term)) {
    score += 10
  }
  if (/[()/:+-]/.test(term)) {
    score += 4
  }
  if (/\d/.test(term)) {
    score += 2
  }

  return score
}

function collectRepoContextSearchTerms(recording: NormalizedRecording): string[] {
  const termScores = new Map<string, number>()

  const registerTerm = (value?: string) => {
    const term = normalizeContextTerm(value)
    if (!term) {
      return
    }

    termScores.set(term, (termScores.get(term) ?? 0) + scoreContextTerm(term))
  }

  registerTerm(recording.title)
  for (const step of recording.steps) {
    registerTerm(step.target)
    registerTerm(step.value)
  }

  return [...termScores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term)
    .slice(0, 8)
}

async function findRepoContextMatches(params: {
  projectRoot: string
  terms: string[]
  excludePaths: string[]
}): Promise<RepoContextMatch[]> {
  const { projectRoot, terms, excludePaths } = params
  if (terms.length === 0) {
    return []
  }

  const normalizedTerms = terms.map((term) => ({
    raw: term,
    lower: term.toLowerCase(),
    weight: scoreContextTerm(term),
  }))
  const comparableProjectRoot = normalizeComparablePath(resolve(projectRoot))
  const excluded = new Set(
    excludePaths.map((value) => normalizeComparablePath(resolve(value)))
  )
  const excludedRelativePaths = new Set(
    excludePaths
      .map((value) =>
        relative(comparableProjectRoot, normalizeComparablePath(resolve(value))).replace(/\\/g, '/')
      )
      .filter((value) => value && !value.startsWith('..'))
  )
  const matches: RepoContextMatch[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!CONTEXT_SEARCH_SKIP_DIRS.has(entry.name)) {
          await walk(fullPath)
        }
        continue
      }

      if (!entry.isFile() || !CONTEXT_SEARCH_EXTENSIONS.has(extname(entry.name))) {
        continue
      }

      const resolvedPath = normalizeComparablePath(resolve(fullPath))
      const relativePath = relative(comparableProjectRoot, resolvedPath).replace(/\\/g, '/')
      if (excluded.has(resolvedPath) || excludedRelativePaths.has(relativePath)) {
        continue
      }

      let content: string
      try {
        content = await readFile(resolvedPath, 'utf-8')
      } catch {
        continue
      }

      if (content.length > 500_000) {
        continue
      }

      const lowered = content.toLowerCase()
      const matchedTerms = normalizedTerms
        .filter((term) => lowered.includes(term.lower))
        .map((term) => term.raw)

      if (matchedTerms.length === 0) {
        continue
      }

      const score = normalizedTerms
        .filter((term) => matchedTerms.includes(term.raw))
        .reduce((sum, term) => sum + term.weight, 0)

      matches.push({
        filePath: relativePath,
        matchedTerms,
        kind: /\.(test|spec)\.[jt]sx?$/u.test(entry.name) ? 'test' : 'source',
        score,
      })
    }
  }

  await walk(projectRoot)

  return matches
    .sort((left, right) => {
      return (
        right.score - left.score ||
        right.matchedTerms.length - left.matchedTerms.length ||
        left.filePath.localeCompare(right.filePath)
      )
    })
    .slice(0, 10)
}

function formatContextMatchesSummary(matches: RepoContextMatch[]): string {
  return matches
    .slice(0, 3)
    .map((match) => `${match.filePath} [${match.matchedTerms.slice(0, 2).join(', ')}]`)
    .join(' | ')
}

function normalizeComparablePath(value: string): string {
  return value.replace(/^\/private(?=\/var\/)/u, '')
}

function resolvePackageProfileFromContextMatches(params: {
  state: Awaited<ReturnType<typeof loadOrBootstrapTaroState>>['state']
  currentProfile: ResolvedTaroPackageProfile | null
  projectRoot: string
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>
  matches: RepoContextMatch[]
}): { profile: ResolvedTaroPackageProfile | null; reason: string | null } {
  const { state, currentProfile, projectRoot, overrides, matches } = params
  if (matches.length === 0) {
    return {
      profile: currentProfile,
      reason: null,
    }
  }

  const scores = new Map<string, { score: number; filePath: string }>()
  const packagePaths = Object.keys(state.packages).sort((left, right) => right.length - left.length)

  for (const match of matches) {
    const matchingPackagePath = packagePaths.find((packagePath) => {
      return packagePath !== '.' &&
        (match.filePath === packagePath || match.filePath.startsWith(`${packagePath}/`))
    })

    if (!matchingPackagePath) {
      continue
    }

    const existing = scores.get(matchingPackagePath)
    if (existing) {
      existing.score += match.score
      continue
    }

    scores.set(matchingPackagePath, {
      score: match.score,
      filePath: match.filePath,
    })
  }

  const bestMatch = [...scores.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[0].localeCompare(right[0]))[0]

  if (!bestMatch) {
    return {
      profile: currentProfile,
      reason: null,
    }
  }

  const [packagePath, info] = bestMatch
  if (currentProfile?.packagePath === packagePath || info.score <= 0) {
    return {
      profile: currentProfile,
      reason: null,
    }
  }

  const resolvedProfile = resolveTaroPackageProfile(
    state,
    projectRoot,
    join(projectRoot, packagePath, '__taro-context-match__.test.tsx'),
    overrides
  )

  if (!resolvedProfile) {
    return {
      profile: currentProfile,
      reason: null,
    }
  }

  return {
    profile: resolvedProfile,
    reason: `${info.filePath} matched recording text evidence`,
  }
}

function toImportPath(fromDir: string, absoluteFilePath: string): string {
  const withoutExtension = normalizeComparablePath(absoluteFilePath).replace(/\.[^.]+$/u, '')
  const relativePath = relative(
    normalizeComparablePath(fromDir),
    withoutExtension
  ).replace(/\\/g, '/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function isLikelyRenderTargetSymbol(symbol: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/u.test(symbol)
}

function deriveContextRenderTargets(params: {
  projectRoot: string
  outputPath: string
  matches: RepoContextMatch[]
}): RepoRenderTargetCandidate[] {
  const { projectRoot, outputPath, matches } = params
  const candidates: RepoRenderTargetCandidate[] = []
  const seen = new Set<string>()
  const outputDir = dirname(outputPath)

  for (const match of matches) {
    if (match.kind !== 'source') {
      continue
    }

    const absolutePath = join(projectRoot, match.filePath)
    const symbol = basename(match.filePath).replace(/\.[^.]+$/u, '')
    if (!isLikelyRenderTargetSymbol(symbol)) {
      continue
    }

    const importPath = toImportPath(outputDir, absolutePath)
    const dedupeKey = `${symbol}|${importPath}`
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    candidates.push({
      symbol,
      importPath,
      sourceTestFile: match.filePath,
      helperNames: [],
      usesWithin: false,
      evidenceTerms: match.matchedTerms,
    })
  }

  return candidates
}

function logScore(scoreResult: ScoreResult): void {
  const markerCoverageSummary =
    `markers: detected=${scoreResult.markerCoverage.detected}, ` +
    `emitted=${scoreResult.markerCoverage.emitted}, ` +
    `unresolved=${scoreResult.markerCoverage.unresolved}`
  console.log(
    pc.dim('[taro]') +
      ` Score: ${scoreResult.total}/100 (${scoreResult.grade}) — ` +
      `query: ${scoreResult.dimensions.queryQuality}, ` +
      `assertions: ${scoreResult.dimensions.assertionSpecificity}, ` +
      `structure: ${scoreResult.dimensions.testStructure}, ` +
      `boundary: ${scoreResult.dimensions.boundaryIsolation}, ` +
      markerCoverageSummary
  )
}

function emitMarkerCoverageSection(scoreResult: ScoreResult): void {
  const gateStatus = scoreResult.markerQualityGate.failing ? pc.red('FAIL') : pc.green('PASS')
  console.log(pc.dim('[taro]') + ' Marker coverage:')
  console.log(pc.dim('[taro]') + `   detected: ${scoreResult.markerCoverage.detected}`)
  console.log(pc.dim('[taro]') + `   emitted: ${scoreResult.markerCoverage.emitted}`)
  console.log(pc.dim('[taro]') + `   unresolved: ${scoreResult.markerCoverage.unresolved}`)
  console.log(
    pc.dim('[taro]') +
      `   QUAL-02 gate: ${gateStatus} (${scoreResult.markerQualityGate.reason})`
  )

  if (scoreResult.markerQualityGate.failing) {
    console.error(pc.red(`[taro] QUAL-02 FAIL: ${scoreResult.markerQualityGate.message}`))
  }
}

function normalizeUnresolvedMarkerHint(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const hint = marker.proofText ?? marker.target ?? marker.query?.raw ?? marker.selector?.selector
  const normalized = hint?.replace(/\s+/g, ' ').trim()
  return normalized && normalized.length > 0 ? normalized : 'none'
}

function formatUnresolvedMarkerLine(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const line = marker.line ?? marker.sourceContext.line
  return Number.isFinite(line) ? String(line) : 'unknown'
}

function formatUnresolvedMarkerWarning(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const line = formatUnresolvedMarkerLine(marker)
  const hint = normalizeUnresolvedMarkerHint(marker)
  const guidance = UNRESOLVED_MARKER_REASON_GUIDANCE[marker.reason]

  return (
    `MKR-03 unresolved-marker marker=${marker.markerStepId} ` +
    `line: ${line} reason=${marker.reason} ` +
    `detail="${guidance}" hint="${hint}"`
  )
}

function collectUnresolvedMarkerAssertions(
  suitePlan: JsSuitePlan
): UnresolvedSemanticMarkerAssertionResolution[] {
  const seenMarkerStepIds = new Set<string>()
  const unresolvedMarkers: UnresolvedSemanticMarkerAssertionResolution[] = []

  for (const scenario of suitePlan.scenarios) {
    for (const unresolvedMarker of scenario.unresolvedMarkerAssertions ?? []) {
      if (seenMarkerStepIds.has(unresolvedMarker.markerStepId)) {
        continue
      }

      seenMarkerStepIds.add(unresolvedMarker.markerStepId)
      unresolvedMarkers.push(unresolvedMarker)
    }
  }

  return unresolvedMarkers
}

function emitUnresolvedMarkerWarnings(suitePlan: JsSuitePlan | null): void {
  if (!suitePlan) {
    return
  }

  const unresolvedMarkers = collectUnresolvedMarkerAssertions(suitePlan)
  for (const unresolvedMarker of unresolvedMarkers) {
    console.warn(pc.yellow(`[taro] ${formatUnresolvedMarkerWarning(unresolvedMarker)}`))
  }
}

function enforceMarkerGateExit(scoreResult: ScoreResult): void {
  if (!scoreResult.markerQualityGate.failing) {
    return
  }

  process.exitCode = 1
  console.error(pc.red('[taro] Exiting with code 1: QUAL-02 gate failed after generation.'))
}

function emitLowConfidenceBanner(scoreResult: ScoreResult): void {
  if (!scoreResult.requiresReview) {
    return
  }

  console.warn(
    pc.yellow(
      `[taro] Manual review required — this generated test is still a draft (${scoreResult.total}/100, ${scoreResult.grade}).`
    )
  )

  if (scoreResult.blockers.length > 0) {
    console.warn(pc.yellow(`[taro] Top blockers: ${scoreResult.blockers.join(' | ')}`))
  }
}

function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = [],
  boundaryIssues = analyzeBoundaryIsolation('')
): void {
  if (scoreResult.dimensions.queryQuality < 60) {
    const testIdCount = queryResults.filter((queryResult) => {
      return isTestIdQueryMethod(queryResult.method)
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

  if (scoreResult.dimensions.boundaryIsolation < 60) {
    for (const issue of boundaryIssues) {
      console.warn(pc.yellow(`[taro] Boundary: ${issue.message}`))
      console.warn(pc.yellow(`[taro] Tip: ${issue.suggestion}`))
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

  console.log(pc.dim('[taro]') + ` Recording cleanup: ${parts.join(', ')}`)
}

function countPlannedScenarioMarkers(
  scenarios: JsSuitePlan['scenarios']
): Pick<MarkerCoverageTotals, 'emitted' | 'unresolved'> {
  return scenarios.reduce(
    (totals, scenario) => ({
      emitted: totals.emitted + (scenario.markerAssertions?.length ?? 0),
      unresolved: totals.unresolved + (scenario.unresolvedMarkerAssertions?.length ?? 0),
    }),
    {
      emitted: 0,
      unresolved: 0,
    }
  )
}

function buildMarkerCoverageSummary(params: {
  analyzedRecording: AnalyzedRecording
  suitePlan: JsSuitePlan | null
}): MarkerCoverageTotals {
  const { analyzedRecording, suitePlan } = params
  const preservedMarkers = analyzedRecording.diagnostics.preservedSemanticMarkers ?? 0
  const diagnosticUnresolvedMarkers = analyzedRecording.diagnostics.unresolvedSemanticMarkers ?? 0

  if (!suitePlan) {
    return {
      detected: preservedMarkers + diagnosticUnresolvedMarkers,
      emitted: 0,
      unresolved: diagnosticUnresolvedMarkers,
    }
  }

  const plannedMarkerTotals = countPlannedScenarioMarkers(suitePlan.scenarios)
  const unresolved = plannedMarkerTotals.unresolved
  const detected = Math.max(
    preservedMarkers + unresolved,
    plannedMarkerTotals.emitted + unresolved
  )

  return {
    detected,
    emitted: plannedMarkerTotals.emitted,
    unresolved,
  }
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
    .filter(
      (scenario) =>
        scenario.steps.length > 0 ||
        scenario.helperRefs.length > 0 ||
        (scenario.markerAssertions?.length ?? 0) > 0
    )
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

  console.log(pc.dim('[taro]') + ` Visual state: ${parts.join(', ')}`)
}

function summarizeMockAnalysis(mockAnalysis: MockAnalysis | null): void {
  if (!mockAnalysis) {
    return
  }

  const parts: string[] = []
  if (mockAnalysis.source === 'package-profile' && mockAnalysis.packagePath) {
    parts.push(`package=${mockAnalysis.packagePath}`)
  }

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

  const preferredSharedMock = Object.entries(mockAnalysis.preferredSharedMocks)[0]
  if (preferredSharedMock) {
    console.log(
      pc.dim('[taro]') +
        ` Shared mock preference: ${preferredSharedMock[0]} -> ${preferredSharedMock[1]}`
    )
  }

  if (mockAnalysis.forbidMocks.length > 0) {
    console.warn(
      pc.yellow(`[taro] Mock policy: forbidden targets ${mockAnalysis.forbidMocks.join(', ')}`)
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

function summarizeBoundaryWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] Boundary: ${warning}`))
  }
}

function summarizeResolvedPackageProfile(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile) {
    console.warn(
      pc.yellow('[taro] State profile: no matching package profile found; using generic defaults.')
    )
    return
  }

  const parts = [
    `package=${packageProfile.packagePath}`,
    `runner=${packageProfile.effectiveRunner}`,
    `renderHelper=${packageProfile.effectiveRenderHelper?.name ?? 'none'}`,
    `sharedMocks=${packageProfile.sharedMockFactories.length}`,
    `inlineMocks=${packageProfile.inlineSafeMockTargets.length}`,
  ]

  console.log(pc.dim('[taro]') + ` State profile: ${parts.join(', ')}`)
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
    ...(candidate.evidenceTerms ?? []).flatMap((term) => tokenizeSuiteHint(term)),
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
        !warning.includes('Taro could not resolve the exact render target from repo context') &&
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
      pc.dim('[taro]') +
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
    console.warn(pc.yellow(`[taro] ${warning}`))
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
  const stateDir = await ensureProjectStateDir(projectRoot)
  const visualDir = join(stateDir, 'visual')

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

async function maybeAnalyzeMocks(
  projectRoot: string,
  packageProfile: ResolvedTaroPackageProfile | null
): Promise<MockAnalysis | null> {
  try {
    return await analyzeMocks(projectRoot, { packageProfile })
  } catch {
    return null
  }
}

async function finalizeGeneratedOutput(params: {
  code: string
  outputPath: string
  projectRoot: string
  recordingFile: string
  scoreResult: ScoreResult
  packageProfile: ResolvedTaroPackageProfile | null
}): Promise<void> {
  const { code, outputPath, projectRoot, recordingFile, scoreResult, packageProfile } = params

  const verification = verifySyntax(code, outputPath)
  if (!verification.valid) {
    console.error(pc.red('[taro] Error: Post-write verification failed'))
    console.error(pc.red(`  ${verification.error}`))
    console.error(pc.red('  This is a Taro bug. Please report it.'))
    process.exit(1)
  }

  console.log(pc.green('[taro] ✓ post-write verified'))

  try {
    await refreshTaroState(projectRoot)
    await appendGeneratedTestRecord(projectRoot, {
      packagePath: packageProfile?.packagePath ?? '.',
      recordingFile,
      testFile: outputPath,
      scoreResult,
    })
    console.log(
      pc.dim('[taro]') +
        ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? '.'}.`
    )
  } catch {
    // State updates are best-effort; generation should still succeed.
  }
}

export function createGenerateCommand(): Command {
  const generate = new Command('__generate')

  generate
    .description('Internal runtime-only generator for Testing Library Recorder JS exports')
    .argument('<file>', 'Path to the recorder export file (.js)')
    .action(async (file: string) => {
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

      const normalizedRecording = normalizeJsBaseline(parsedInput)
      const hadState = await access(join(projectRoot, '.taro', 'state.json'))
        .then(() => true)
        .catch(() => false)
      const defaultOutputPath = deriveOutputPath(filePath)
      let bootstrappedState = await loadOrBootstrapTaroState(projectRoot)
      let overrides = await readTaroOverrides(projectRoot)
      let packageProfile = resolveTaroPackageProfile(
        bootstrappedState.state,
        projectRoot,
        defaultOutputPath,
        overrides
      )
      const contextSearchTerms = collectRepoContextSearchTerms(normalizedRecording)
      const contextMatches = await findRepoContextMatches({
        projectRoot,
        terms: contextSearchTerms,
        excludePaths: [filePath, defaultOutputPath],
      })
      const contextProfile = resolvePackageProfileFromContextMatches({
        state: bootstrappedState.state,
        currentProfile: packageProfile,
        projectRoot,
        overrides,
        matches: contextMatches,
      })
      packageProfile = contextProfile.profile
      let contextProfileReason = contextProfile.reason

      if (bootstrappedState.summary.warnings.length > 0) {
        for (const warning of bootstrappedState.summary.warnings) {
          console.warn(pc.yellow(`[taro] State: ${warning}`))
        }
      }

      if (packageProfile) {
        const staleness = await detectPackageProfileStaleness(projectRoot, packageProfile)
        if (staleness.stale) {
          console.log(
            pc.dim('[taro]') +
              ` Detected stale package profile ${packageProfile.packagePath}; refreshing before generation.`
          )
          if (staleness.reason) {
            console.warn(pc.yellow(`[taro] State: ${staleness.reason}`))
          }
          bootstrappedState = await refreshTaroState(projectRoot)
          overrides = await readTaroOverrides(projectRoot)
          packageProfile = resolveTaroPackageProfile(
            bootstrappedState.state,
            projectRoot,
            defaultOutputPath,
            overrides
          )
          const refreshedContextProfile = resolvePackageProfileFromContextMatches({
            state: bootstrappedState.state,
            currentProfile: packageProfile,
            projectRoot,
            overrides,
            matches: contextMatches,
          })
          packageProfile = refreshedContextProfile.profile
          contextProfileReason = refreshedContextProfile.reason
        }
      }

      const conventions =
        packageProfile?.conventions ?? {
          scannedAt: new Date().toISOString(),
          projectRoot,
          importStyle: 'esm',
          mockPattern: 'none',
          testFiles: [],
          folderPattern: 'unknown',
          fileExtension: 'ts',
        }
      const contextRenderTargets = deriveContextRenderTargets({
        projectRoot,
        outputPath: defaultOutputPath,
        matches: contextMatches,
      })
      const repoRenderTargets = [...contextRenderTargets, ...(packageProfile?.renderTargets ?? [])]

      if (!hadState) {
        console.log(pc.dim('[taro]') + ' Bootstrapped .taro/state.json from current repo tests.')
      }
      if (contextMatches.length > 0) {
        console.log(
          pc.dim('[taro]') +
            ` Context matches: ${formatContextMatchesSummary(contextMatches)}`
        )
      }
      if (packageProfile?.appliedOverrides.length) {
        console.log(
          pc.dim('[taro]') +
            ` Applied overrides for ${packageProfile.packagePath}: ${packageProfile.appliedOverrides.join(', ')}`
        )
      }
      if (contextProfileReason && packageProfile) {
        console.log(
          pc.dim('[taro]') +
            ` Context-selected package profile ${packageProfile.packagePath}: ${contextProfileReason}.`
        )
      }
      summarizeResolvedPackageProfile(packageProfile)

      console.log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps` +
          `, ${normalizedRecording.baseline?.itGroups.length ?? 0} test group(s)`
      )

      const analyzedRecording = analyzeRecording(normalizedRecording)
      const markerAwareRecording = mergeAnalyzedStepState(normalizedRecording, analyzedRecording)
      summarizeCleanup(analyzedRecording)
      const visualState = await maybeCaptureVisualState({
        analyzedRecording,
        projectRoot,
        selector: getPrimarySelector(normalizedRecording),
        url: findRecordingUrl(analyzedRecording),
      })
      summarizeVisualState(visualState)
      const mockAnalysis = await maybeAnalyzeMocks(projectRoot, packageProfile)
      summarizeMockAnalysis(mockAnalysis)
      const rawJsSuitePlan = planJsSuite({
        recording: markerAwareRecording,
        analyzedRecording,
        mockAnalysis,
        fallbackTitle: normalizedRecording.title,
      })

      const repoRenderTarget = resolveRepoRenderTarget({
        candidates: repoRenderTargets,
        recording: normalizedRecording,
        mockAnalysis,
        suitePlan: rawJsSuitePlan,
      })
      const outputPath = defaultOutputPath

      const jsSuitePlan = rawJsSuitePlan
        ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
        : null

      if (jsSuitePlan) {
        summarizeBoundaryWarnings(jsSuitePlan.warnings)
      }

      const resolvedJsGeneration = await resolveJsGeneration(
        markerAwareRecording,
        jsSuitePlan?.itGroups ?? toItGroups(analyzedRecording, normalizedRecording.title)
      )

      if (resolvedJsGeneration) {
        summarizeSelectorWarnings(resolvedJsGeneration.warnings)
      }

      const hydratedSuitePlan = jsSuitePlan
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
      const generationItGroups = stripSemanticMarkerStepsFromItGroups(
        resolvedJsGeneration?.itGroups ??
          hydratedSuitePlan?.itGroups ??
          toItGroups(analyzedRecording, normalizedRecording.title)
      )

      const generated = generateTestFromGroups(normalizedRecording.title, generationItGroups, {
        outputPath,
        conventions,
        runner: packageProfile?.effectiveRunner ?? 'unknown',
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        helpers: generationHelpers,
        scenarios: generationScenarios,
        renderTarget: repoRenderTarget,
        renderHelper: packageProfile?.effectiveRenderHelper ?? null,
      })
      const markerCoverage = buildMarkerCoverageSummary({
        analyzedRecording,
        suitePlan: hydratedSuitePlan,
      })

      if (hydratedSuitePlan?.warnings.length) {
        generated.code = [
          ...hydratedSuitePlan.warnings.map((warning) => `// taro-boundary-warning: ${warning}`),
          generated.code,
        ].join('\n')
      }

      emitQuerySummary(resolvedJsGeneration?.queryResults ?? [])

      const scoreResult = scoreGeneratedTest(generated.code, {
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        markerCoverage,
      })
      const boundaryIssues = analyzeBoundaryIsolation(generated.code)

      logScore(scoreResult)
      emitMarkerCoverageSection(scoreResult)
      emitUnresolvedMarkerWarnings(hydratedSuitePlan)
      emitLowConfidenceBanner(scoreResult)
      emitScoreHints(scoreResult, resolvedJsGeneration?.queryResults ?? [], boundaryIssues)

      try {
        const result = await writeTestFile(generated.code, outputPath, { createDir: true })
        await finalizeGeneratedOutput({
          code: generated.code,
          outputPath: result.filePath,
          projectRoot,
          recordingFile: filePath,
          scoreResult,
          packageProfile,
        })
        const action = result.overwritten ? pc.yellow('Updated') : pc.green('Created')
        console.log(`${action}: ${pc.bold(result.filePath)}`)
        enforceMarkerGateExit(scoreResult)
      } catch (err) {
        console.error(pc.red('Error:') + ` ${String(err)}`)
        process.exit(1)
      }
    })

  return generate
}
