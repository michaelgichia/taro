/**
 * Generate command
 * Internal runtime-only generation pipeline for Testing Library Recorder JS exports.
 */

import { Command } from 'commander'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { cwd, stdin, stdout } from 'node:process'
import pc from 'picocolors'
import { writeTestFile } from '../../core/writer.js'
import {
  captureVisualState,
  createPageInspector,
  openCapturePage,
  replayStep,
  resolveSelector,
} from '../../core/resolver.js'
import type {
  CaptureVisualStateAuthOptions,
  ReplayStepDebugTrace,
} from '../../core/resolver.js'
import { scoreGeneratedTest } from '../../core/scorer.js'
import { analyzeBoundaryIsolation } from '../../core/boundary-intelligence.js'
import { verifySyntax } from '../../core/verifier.js'
import { enrichCanonicalSemanticMarkers } from '../../core/semantic-marker-enrichment.js'
import {
  analyzeRecording,
  findVisualCaptureCandidates,
} from '../../core/recording-intelligence.js'
import { analyzeMocks } from '../../core/mock-intelligence.js'
import { generateTestFromGroups, emitQuerySummary } from '../../core/generator.js'
import { loadInput } from '../../core/input-loader.js'
import { parseJsRecording, type JsParseResult } from '../../core/js-parser.js'
import { normalizeJsBaseline } from '../../core/baseline-normalizer.js'
import { planJsSuite } from '../../core/suite-planner.js'
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from '../../core/boundary-support.js'
import { discoverBoundaryImportsFromSource } from '../../core/boundary-learning.js'
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '../../core/state.js'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  QueryDescriptor,
  QueryResult,
  SemanticMarkerAssertionUnresolvedReason,
  SelectorDescriptor,
  SelectorResolutionPhase,
  SelectorResolutionResult,
  StepId,
  UnresolvedSemanticMarkerAssertionResolution,
  VisualState,
} from '../../types/recording.js'
import type {
  MarkerCoverageTotals,
  MarkerReviewDiagnostics,
  ScoreResult,
} from '../../types/score.js'
import type { MockAnalysis } from '../../core/mock-intelligence.js'
import type { JsSuitePlan } from '../../core/suite-planner.js'
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroPlaywrightAuthProfile,
} from '../../types/state.js'
import { isTestIdQueryMethod } from '../../core/query-policy.js'
import {
  type Finding,
  formatFindingsBlock,
  hasBlockingFindings,
} from '../../core/findings-reporter.js'

/** Write an operational log line to stderr. Never use console.log in this file — stdout is reserved for the findings envelope. */
function log(msg: string): void {
  process.stderr.write(msg + '\n')
}

type DebugTraceRecord =
  | {
      kind: 'replay-attempt'
      action: string
      error?: string
      fallbackLocators?: string[]
      locatorSource: string
      locatorValue?: string
      pageTitle?: string
      pageUrl?: string
      playwrightAction: string
      result: string
      stepId?: string
      target?: string
      timeoutMs: number
    }
  | {
      kind: 'selector-resolution'
      cssSelector: string
      derivedQuery?: string
      inspectSource: string
      inspectionError?: string
      pageUrl?: string
      phase?: string
      reason?: string
      result: string
      stepId: string
    }
  | {
      kind: 'step-summary'
      action: string
      replayed: boolean
      selectorsResolved: number
      selectorsStillUnresolved: number
      stepId: string
      warningCount: number
    }
  | {
      kind: 'replay-browser-failure'
      authStrategy?: string
      error: string
      url: string
    }

interface SelectorDebugReporter {
  enabled: boolean
  persist(): Promise<void>
  traceBrowserFailure(record: {
    authStrategy?: string
    error: string
    url: string
  }): void
  traceReplay(debug?: ReplayStepDebugTrace): void
  traceSelector(result: SelectorResolutionResult): void
  traceStepSummary(record: {
    action: string
    replayed: boolean
    selectorsResolved: number
    selectorsStillUnresolved: number
    stepId: string
    warningCount: number
  }): void
}

function createSelectorDebugReporter(options: {
  enabled: boolean
  jsonPath?: string
}): SelectorDebugReporter {
  const records: DebugTraceRecord[] = []

  const emit = (record: DebugTraceRecord, line: string) => {
    if (!options.enabled) {
      return
    }

    log(line)
    if (options.jsonPath) {
      records.push(record)
    }
  }

  const formatValue = (value: string | number | boolean | undefined) =>
    JSON.stringify(value ?? '')

  return {
    enabled: options.enabled,
    traceReplay(debug) {
      if (!options.enabled || !debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'replay-attempt',
        action: debug.action,
        error: debug.error,
        fallbackLocators: debug.fallbackLocators,
        locatorSource: debug.locatorSource,
        locatorValue: debug.locatorValue,
        pageTitle: debug.pageTitle,
        pageUrl: debug.pageUrl,
        playwrightAction: debug.playwrightAction,
        result: debug.result,
        stepId: debug.stepId,
        target: debug.target,
        timeoutMs: debug.timeoutMs,
      }

      emit(
        record,
        [
          '[taro][replay]',
          `step=${debug.stepId ?? '(unknown)'}`,
          `action=${debug.action}`,
          `target=${formatValue(debug.target)}`,
          `url=${formatValue(debug.pageUrl)}`,
          `locatorSource=${debug.locatorSource}`,
          `locatorValue=${formatValue(debug.locatorValue)}`,
          `playwrightAction=${formatValue(debug.playwrightAction)}`,
          `timeoutMs=${debug.timeoutMs}`,
          `result=${debug.result}`,
          `error=${formatValue(debug.error)}`,
        ].join(' ')
      )
    },
    traceSelector(result) {
      if (!options.enabled || !result.debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'selector-resolution',
        cssSelector: result.debug.cssSelector,
        derivedQuery: result.debug.derivedQuery,
        inspectSource: result.debug.inspectSource,
        inspectionError: result.debug.inspectionError,
        pageUrl: result.debug.pageUrl,
        phase: result.debug.phase,
        reason:
          result.status === 'unresolved'
            ? result.reason
            : result.debug.reason,
        result: result.status,
        stepId: result.stepId,
      }

      emit(
        record,
        [
          '[taro][selector]',
          `step=${result.stepId}`,
          `css=${formatValue(result.debug.cssSelector)}`,
          `phase=${result.debug.phase ?? 'n/a'}`,
          `inspectSource=${result.debug.inspectSource}`,
          `url=${formatValue(result.debug.pageUrl)}`,
          `result=${result.status}`,
          `reason=${formatValue(
            result.status === 'unresolved' ? result.reason : result.debug.reason
          )}`,
          `inspectionError=${formatValue(result.debug.inspectionError)}`,
          `derivedQuery=${formatValue(result.debug.derivedQuery)}`,
        ].join(' ')
      )
    },
    traceStepSummary(record) {
      emit(
        {
          kind: 'step-summary',
          action: record.action,
          replayed: record.replayed,
          selectorsResolved: record.selectorsResolved,
          selectorsStillUnresolved: record.selectorsStillUnresolved,
          stepId: record.stepId,
          warningCount: record.warningCount,
        },
        [
          '[taro][step-summary]',
          `step=${record.stepId}`,
          `action=${record.action}`,
          `replayed=${record.replayed}`,
          `selectorsResolved=${record.selectorsResolved}`,
          `selectorsStillUnresolved=${record.selectorsStillUnresolved}`,
          `warningCount=${record.warningCount}`,
        ].join(' ')
      )
    },
    traceBrowserFailure(record) {
      emit(
        {
          kind: 'replay-browser-failure',
          authStrategy: record.authStrategy,
          error: record.error,
          url: record.url,
        },
        [
          '[taro][replay-browser]',
          `url=${formatValue(record.url)}`,
          `authStrategy=${formatValue(record.authStrategy)}`,
          `error=${formatValue(record.error)}`,
        ].join(' ')
      )
    },
    async persist() {
      if (!options.jsonPath) {
        return
      }

      await mkdir(dirname(options.jsonPath), { recursive: true })
      const body = records.map((record) => JSON.stringify(record)).join('\n')
      await writeFile(options.jsonPath, body.length > 0 ? `${body}\n` : '', 'utf-8')
    },
  }
}

/** Emit the findings envelope to stdout and exit with the correct code. Call on every execution path exit. */
function flushFindings(findings: Finding[]): never {
  if (findings.length > 0) {
    process.stdout.write(formatFindingsBlock(findings) + '\n')
  }
  process.exit(hasBlockingFindings(findings) ? 1 : 0)
}

const EMPTY_MARKER_COVERAGE: MarkerCoverageTotals = {
  detected: 0,
  emitted: 0,
  unresolved: 0,
}
const EMPTY_MARKER_DIAGNOSTICS: MarkerReviewDiagnostics = {
  canonicalRecoveries: 0,
  placementConflicts: 0,
  placementCorrections: 0,
}
const MANUAL_VISUAL_AUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH = '.taro/playwright/.auth/user.json'
const PAGE_CONFIRMED_CONTEXT_TERM_BONUS = 50

interface GenerateCommandContext {
  input?: Pick<typeof stdin, 'isTTY'>
  output?: Pick<typeof stdout, 'isTTY'>
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
  'boundary-placement-conflict':
    'Marker could not be assigned to a single safe scenario. Keep the checkpoint near the intended state change or repair the scenario split.',
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '')
  return join(dir, `${name}.test.tsx`)
}

function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/u.test(filePath)
}

function isRelativeImportPath(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../')
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveImportedFilePath(params: {
  projectRoot: string
  sourceFile: string
  importPath: string
}): Promise<string | null> {
  const { projectRoot, sourceFile, importPath } = params
  if (!isRelativeImportPath(importPath)) {
    return null
  }

  const sourceDir = dirname(resolve(projectRoot, sourceFile))
  const rawTargetPath = resolve(sourceDir, importPath)
  const candidates = [
    rawTargetPath,
    `${rawTargetPath}.ts`,
    `${rawTargetPath}.tsx`,
    `${rawTargetPath}.js`,
    `${rawTargetPath}.jsx`,
    join(rawTargetPath, 'index.ts'),
    join(rawTargetPath, 'index.tsx'),
    join(rawTargetPath, 'index.js'),
    join(rawTargetPath, 'index.jsx'),
  ]

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return rawTargetPath
}

async function resolveRenderTargetFile(params: {
  projectRoot: string
  renderTarget: RepoRenderTargetCandidate | null
}): Promise<string | null> {
  const { projectRoot, renderTarget } = params
  if (!renderTarget) {
    return null
  }

  if (!isTestFilePath(renderTarget.sourceTestFile)) {
    return resolve(projectRoot, renderTarget.sourceTestFile)
  }

  return resolveImportedFilePath({
    projectRoot,
    sourceFile: renderTarget.sourceTestFile,
    importPath: renderTarget.importPath,
  })
}

function rebaseRenderHelperImportPath(params: {
  projectRoot: string
  outputPath: string
  renderHelper: ResolvedTaroPackageProfile['effectiveRenderHelper']
}): ResolvedTaroPackageProfile['effectiveRenderHelper'] {
  const { projectRoot, outputPath, renderHelper } = params
  if (
    !renderHelper ||
    !isRelativeImportPath(renderHelper.importPath) ||
    !isTestFilePath(renderHelper.sourceTestFile)
  ) {
    return renderHelper
  }

  const absoluteImportPath = resolve(
    dirname(resolve(projectRoot, renderHelper.sourceTestFile)),
    renderHelper.importPath
  )

  return {
    ...renderHelper,
    importPath: toImportPath(dirname(outputPath), absoluteImportPath),
  }
}

interface RepoContextMatch {
  filePath: string
  matchedTerms: string[]
  kind: 'source' | 'test'
  score: number
}

interface FlowCoverageSummary {
  totalSteps: number
  coveredSteps: number
  coveredStepIds: string[]
  uncoveredStepIds: string[]
}

interface OutputAssessment {
  flowCoverage: FlowCoverageSummary
  scoreResult: ScoreResult
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

function normalizeComparableText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized ? normalized : null
}

function isGenericCoverageToken(token: string): boolean {
  return (
    GENERIC_CONTEXT_TERMS.has(token) ||
    [
      'screen',
      'within',
      'document',
      'location.href',
      'document.title',
      'button',
      'textbox',
      'heading',
      'dialog',
      'combobox',
      'listitem',
      'link',
      'checkbox',
      'radio',
      'switch',
      'option',
      'getbyrole',
      'findbyrole',
      'querybyrole',
      'getbytext',
      'findbytext',
      'querybytext',
    ].includes(token)
  )
}

function collectComparableTokens(value?: string | null): string[] {
  if (!value) {
    return []
  }

  const tokens = new Set<string>()
  const normalized = normalizeComparableText(value)
  const register = (candidate?: string | null) => {
    const comparable = normalizeComparableText(candidate)
    if (
      !comparable ||
      comparable.length < 2 ||
      looksLikeSelectorLikeString(comparable) ||
      isGenericCoverageToken(comparable)
    ) {
      return
    }

    tokens.add(comparable)
  }

  if (!/\bscreen\.|\bwithin\(|\bdocument\./i.test(value)) {
    register(normalized)
  }

  const quotedMatches = value.matchAll(/['"`]([^'"`\n]{2,120})['"`]/g)
  for (const match of quotedMatches) {
    register(match[1])
  }

  return [...tokens]
}

function collectStepCoverageTokens(step: NormalizedStep): {
  measurable: boolean
  primary: string[]
  secondary: string[]
} {
  if (step.action === 'navigate' || step.action === 'scroll' || step.action === 'waitForSelector') {
    return {
      measurable: false,
      primary: [],
      secondary: [],
    }
  }

  if (
    step.action === 'assert' &&
    (step.target === 'location.href' || step.target === 'document.title')
  ) {
    return {
      measurable: false,
      primary: [],
      secondary: [],
    }
  }

  const primary = new Set<string>()
  const secondary = new Set<string>()
  const registerPrimary = (value?: string | null) => {
    for (const token of collectComparableTokens(value)) {
      primary.add(token)
    }
  }
  const registerSecondary = (value?: string | null) => {
    for (const token of collectComparableTokens(value)) {
      secondary.add(token)
    }
  }

  registerPrimary(step.target)
  registerPrimary(step.semanticMarkerCandidate?.proofText)
  registerPrimary(step.semanticMarkerCandidate?.target)
  registerPrimary(step.semanticMarkerCandidate?.query?.target)
  registerPrimary(step.semanticMarkerCandidate?.query?.name)
  registerPrimary(step.unresolvedSemanticMarker?.proofText)
  registerPrimary(step.unresolvedSemanticMarker?.target)
  registerPrimary(step.unresolvedSemanticMarker?.query?.target)
  registerPrimary(step.unresolvedSemanticMarker?.query?.name)

  if (step.action === 'fill' || step.action === 'select' || step.action === 'assert') {
    registerSecondary(step.value)
  }

  const hasEvidence = primary.size > 0 || secondary.size > 0
  return {
    measurable: hasEvidence,
    primary: [...primary],
    secondary: [...secondary],
  }
}

function codeIncludesCoverageToken(normalizedCode: string, token: string): boolean {
  return normalizedCode.includes(token)
}

function buildFlowCoverageSummary(
  analyzedRecording: AnalyzedRecording,
  code: string
): FlowCoverageSummary {
  const normalizedCode = normalizeComparableText(code) ?? ''
  let totalSteps = 0
  let coveredSteps = 0
  const coveredStepIds: string[] = []
  const uncoveredStepIds: string[] = []

  for (const step of analyzedRecording.steps) {
    const coverageTokens = collectStepCoverageTokens(step)
    if (!coverageTokens.measurable) {
      continue
    }

    totalSteps += 1
    const hasPrimaryCoverage =
      coverageTokens.primary.length === 0 ||
      coverageTokens.primary.some((token) => codeIncludesCoverageToken(normalizedCode, token))
    const hasSecondaryCoverage =
      coverageTokens.secondary.length === 0 ||
      coverageTokens.secondary.some((token) => codeIncludesCoverageToken(normalizedCode, token))
    const matched = hasPrimaryCoverage && hasSecondaryCoverage

    if (matched) {
      coveredSteps += 1
      coveredStepIds.push(step.id ?? `${step.action}-${totalSteps}`)
    } else {
      uncoveredStepIds.push(step.id ?? `${step.action}-${totalSteps}`)
    }
  }

  return {
    totalSteps,
    coveredSteps,
    coveredStepIds,
    uncoveredStepIds,
  }
}

function mapParsedQueriesToResults(parsed: JsParseResult): QueryResult[] {
  return parsed.queries.map((query) => ({
    method: query.method,
    query: query.raw ?? query.target ?? query.name ?? query.role ?? query.method,
    quality: query.quality ?? 'fragile',
    line: query.line,
  }))
}

async function assessOutputAgainstRecording(params: {
  analyzedRecording: AnalyzedRecording
  code: string
}): Promise<OutputAssessment> {
  const parsed = await parseJsRecording(params.code)
  const flowCoverage = buildFlowCoverageSummary(params.analyzedRecording, params.code)
  const scoreResult = scoreGeneratedTest(params.code, {
    queryResults: mapParsedQueriesToResults(parsed),
  })

  return {
    flowCoverage,
    scoreResult,
  }
}

function compareOutputAssessments(candidate: OutputAssessment, existing: OutputAssessment): number {
  const coverageDelta = candidate.flowCoverage.coveredSteps - existing.flowCoverage.coveredSteps
  if (coverageDelta !== 0) {
    return coverageDelta
  }

  if (candidate.scoreResult.requiresReview !== existing.scoreResult.requiresReview) {
    return candidate.scoreResult.requiresReview ? -1 : 1
  }

  const scoreDelta = candidate.scoreResult.total - existing.scoreResult.total
  if (scoreDelta !== 0) {
    return scoreDelta
  }

  return existing.scoreResult.blockers.length - candidate.scoreResult.blockers.length
}

function logExistingOutputDecision(params: {
  outputPath: string
  candidate: OutputAssessment
  existing: OutputAssessment
  overwrite: boolean
}): void {
  const { outputPath, candidate, existing, overwrite } = params
  log(pc.dim('[taro]') + ` Existing output detected: ${outputPath}`)
  log(
    pc.dim('[taro]') +
      ` Recorder flow coverage — existing ${existing.flowCoverage.coveredSteps}/${existing.flowCoverage.totalSteps}, ` +
      `candidate ${candidate.flowCoverage.coveredSteps}/${candidate.flowCoverage.totalSteps}`
  )
  log(
    pc.dim('[taro]') +
      ` Quality — existing ${existing.scoreResult.total}/100 (${existing.scoreResult.grade}), ` +
      `candidate ${candidate.scoreResult.total}/100 (${candidate.scoreResult.grade})`
  )

  if (overwrite) {
    log(
      pc.yellow(
        `[taro] Existing output will be updated because the new generation improves flow coverage or overall quality.`
      )
    )
    return
  }

  log(
    pc.green(
      `[taro] Keeping the existing test because it already matches or exceeds the new generation for Recorder flow coverage and quality.`
    )
  )
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

function collectVisualElementContextTerm(visualState: VisualState): string | null {
  const candidates = [
    visualState.element?.ariaLabel,
    visualState.element?.labelText,
    visualState.element?.innerText,
    visualState.element?.altText,
    visualState.element?.title,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeContextTerm(candidate ?? undefined)
    if (normalized) {
      return normalized
    }
  }

  return null
}

function collectPageConfirmedContextTerms(visualState: VisualState | null): string[] {
  if (!visualState) {
    return []
  }

  const terms = new Set<string>()
  const register = (value?: string | null) => {
    const normalized = normalizeContextTerm(value ?? undefined)
    if (normalized) {
      terms.add(normalized)
    }
  }

  for (const landmark of visualState.matchedLandmarks ?? []) {
    register(landmark)
  }

  if (
    visualState.status === 'auth-interrupted' ||
    visualState.status === 'auth-recovery-failed' ||
    visualState.status === 'auth-recovery-timed-out'
  ) {
    return [...terms]
  }

  register(visualState.dialog?.title)
  for (const action of visualState.dialog?.actions ?? []) {
    register(action)
  }
  register(collectVisualElementContextTerm(visualState))

  return [...terms]
}

function summarizePageConfirmedContext(visualState: VisualState | null): void {
  const confirmedTerms = collectPageConfirmedContextTerms(visualState)
  if (confirmedTerms.length === 0) {
    return
  }

  log(
    pc.dim('[taro]') +
      ` Page-confirmed context: ${confirmedTerms.slice(0, 3).join(' | ')}`
  )
}

function collectRepoContextSearchTerms(
  recording: NormalizedRecording,
  visualState: VisualState | null = null
): string[] {
  const termScores = new Map<string, number>()

  const registerTerm = (value?: string, bonus = 0) => {
    const term = normalizeContextTerm(value)
    if (!term) {
      return
    }

    termScores.set(
      term,
      (termScores.get(term) ?? 0) + scoreContextTerm(term) + bonus
    )
  }

  for (const confirmedTerm of collectPageConfirmedContextTerms(visualState)) {
    registerTerm(confirmedTerm, PAGE_CONFIRMED_CONTEXT_TERM_BONUS)
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
  log(
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
  const gateStatus =
    scoreResult.markerQualityGate.status === 'warn'
      ? pc.yellow('WARN')
      : pc.green('PASS')
  log(pc.dim('[taro]') + ' Marker coverage:')
  log(pc.dim('[taro]') + `   detected: ${scoreResult.markerCoverage.detected}`)
  log(pc.dim('[taro]') + `   emitted: ${scoreResult.markerCoverage.emitted}`)
  log(pc.dim('[taro]') + `   unresolved: ${scoreResult.markerCoverage.unresolved}`)
  log(
    pc.dim('[taro]') +
      `   QUAL-02 gate: ${gateStatus} (${scoreResult.markerQualityGate.reason})`
  )

  if (scoreResult.markerQualityGate.failing) {
    console.warn(pc.yellow(`[taro] QUAL-02 WARN: ${scoreResult.markerQualityGate.message}`))
  }
}

function collectPlannedMarkerAssertions(suitePlan: JsSuitePlan): PlannedMarkerAssertion[] {
  return suitePlan.scenarios.flatMap((scenario) => scenario.markerAssertions ?? [])
}

function buildMarkerReviewDiagnostics(
  suitePlan: JsSuitePlan | null
): MarkerReviewDiagnostics {
  if (!suitePlan) {
    return EMPTY_MARKER_DIAGNOSTICS
  }

  let canonicalRecoveries = 0
  let placementCorrections = 0

  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    if (markerAssertion.diagnostics?.canonicalRecovery) {
      canonicalRecoveries += 1
    }
    if (markerAssertion.diagnostics?.placementCorrection) {
      placementCorrections += 1
    }
  }

  const placementConflicts = collectUnresolvedMarkerAssertions(suitePlan).filter(
    (marker) => marker.reason === 'boundary-placement-conflict'
  ).length

  return {
    canonicalRecoveries,
    placementConflicts,
    placementCorrections,
  }
}

function emitRecoveredMarkerDiagnostics(suitePlan: JsSuitePlan | null): void {
  if (!suitePlan) {
    return
  }

  const seenMarkerStepIds = new Set<string>()
  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    const recovery = markerAssertion.diagnostics?.canonicalRecovery
    if (!recovery || seenMarkerStepIds.has(markerAssertion.markerStepId)) {
      continue
    }

    seenMarkerStepIds.add(markerAssertion.markerStepId)
    log(
      pc.dim('[taro]') +
        ` MKR-01 canonical-copy marker=${markerAssertion.markerStepId} ` +
        `file=${recovery.sourceFile} from="${recovery.fromText}" to="${recovery.toText}"`
    )
  }
}

function emitMarkerPlacementCorrections(suitePlan: JsSuitePlan | null): void {
  if (!suitePlan) {
    return
  }

  const seenMarkerStepIds = new Set<string>()
  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    const placementCorrection = markerAssertion.diagnostics?.placementCorrection
    if (!placementCorrection || seenMarkerStepIds.has(markerAssertion.markerStepId)) {
      continue
    }

    seenMarkerStepIds.add(markerAssertion.markerStepId)
    console.warn(
      pc.yellow(
        `[taro] MKR-02 placement-correction marker=${markerAssertion.markerStepId} from="${placementCorrection.fromScenarioName}" to="${placementCorrection.toScenarioName}"`
      )
    )
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
    log(
      pc.yellow(
        `[taro] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`
      )
    )
  }

  if (scoreResult.dimensions.assertionSpecificity < 60) {
    log(
      pc.yellow(
        '[taro] Tip: Add specific matchers like toHaveValue() for better assertions'
      )
    )
  }

  if (scoreResult.dimensions.testStructure < 60) {
    log(
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

  log(pc.dim('[taro]') + ` Recording cleanup: ${parts.join(', ')}`)
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

function canSuccessfulReplayRevealAdditionalState(step: NormalizedStep): boolean {
  return (
    step.action === 'click' ||
    step.action === 'fill' ||
    step.action === 'select' ||
    step.action === 'navigate' ||
    step.action === 'keyDown'
  )
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

function normalizeLandmarkCandidate(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }

  if (
    normalized.length < 3 ||
    /^https?:\/\//i.test(normalized) ||
    /^(document|location)\./i.test(normalized) ||
    /(?:[#.]|>|:|=|nth-(?:child|of-type)|querySelector)/i.test(normalized)
  ) {
    return null
  }

  return normalized
}

function findExpectedPageTitle(recording: NormalizedRecording): string | undefined {
  const titleAssertion = recording.steps.find(
    (step) => step.action === 'assert' && step.target === 'document.title' && typeof step.value === 'string'
  )
  return typeof titleAssertion?.value === 'string' ? titleAssertion.value : undefined
}

function collectExpectedLandmarks(recording: NormalizedRecording): string[] {
  const values = new Set<string>()
  const register = (candidate?: string) => {
    const normalized = normalizeLandmarkCandidate(candidate)
    if (normalized) {
      values.add(normalized)
    }
  }

  for (const query of recording.baseline?.queries ?? []) {
    register(query.name)
    register(query.target)
  }

  for (const step of recording.steps) {
    if (step.action !== 'click' && step.action !== 'assert' && step.action !== 'fill') {
      continue
    }

    register(step.target)
    if (typeof step.value === 'string') {
      register(step.value)
    }
  }

  return [...values].slice(0, 5)
}

function toProjectRelativePath(projectRoot: string, filePath: string): string {
  const absoluteFilePath = resolve(filePath)
  const normalized = relative(projectRoot, absoluteFilePath).replace(/\\/g, '/')
  if (normalized && !normalized.startsWith('..')) {
    return normalized
  }

  const authLikeSuffix = absoluteFilePath
    .replace(/\\/g, '/')
    .match(/(?:^|\/)(playwright\/\.auth\/.+|\.auth\/.+|e2e\/\.auth\/.+|tests\/e2e\/\.auth\/.+)$/)
  if (authLikeSuffix?.[1]) {
    return authLikeSuffix[1]
  }

  return normalized.length === 0 ? '.' : normalized
}

async function resolveOptionalFilePath(
  projectRoot: string,
  inputPath: string | undefined
): Promise<{
  absolutePath: string
  relativePath: string
} | null> {
  if (!inputPath) {
    return null
  }

  const absolutePath = resolve(projectRoot, inputPath)
  try {
    await access(absolutePath)
    return {
      absolutePath,
      relativePath: toProjectRelativePath(projectRoot, absolutePath),
    }
  } catch {
    console.warn(pc.yellow(`[taro] Visual auth: file not found ${absolutePath}; continuing without it.`))
    return null
  }
}

function hasInteractiveVisualAuthCapability(
  context: GenerateCommandContext = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean((context.input ?? stdin).isTTY && (context.output ?? stdout).isTTY)
  )
}

function resolveVisualAuthStorageStatePath(
  projectRoot: string,
  auth: TaroPlaywrightAuthProfile | null
): {
  absolutePath: string
  relativePath: string
} {
  const relativePath =
    auth?.strategy === 'storageState' ? auth.path : DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH

  return {
    absolutePath: resolve(projectRoot, relativePath),
    relativePath,
  }
}

function resolveVisualCaptureScreenshotDir(projectRoot: string): string {
  return resolve(projectRoot, '.taro', 'playwright', 'screenshots')
}

type AuthPreflightStatus =
  | 'not_required'
  | 'unknown_recipe'
  | 'authenticated'
  | 'failed'

function resolveAuthPreflightStatus(params: {
  auth: TaroPlaywrightAuthProfile | null
  url?: string
  visualState: VisualState | null
}): AuthPreflightStatus | null {
  const { auth, url, visualState } = params
  if (!url || !visualState) {
    return null
  }

  switch (visualState.status) {
    case 'auth-recovered':
      return 'authenticated'
    case 'auth-recovery-failed':
    case 'auth-recovery-timed-out':
      return 'failed'
    case 'auth-interrupted':
      return auth ? 'failed' : 'unknown_recipe'
    case 'captured':
      return auth ? 'authenticated' : 'not_required'
    case 'capture-failed':
      return null
  }
}

function summarizeAuthPreflight(params: {
  auth: TaroPlaywrightAuthProfile | null
  url?: string
  visualState: VisualState | null
}): void {
  const status = resolveAuthPreflightStatus(params)
  if (!status) {
    return
  }

  log(pc.dim('[taro]') + ` Auth status: ${status}`)
}

function summarizePlaywrightAuth(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile?.playwrightAuth) {
    return
  }

  log(
    pc.dim('[taro]') +
      ` Visual auth: ${packageProfile.playwrightAuth.strategy}=${packageProfile.playwrightAuth.path} (${packageProfile.playwrightAuth.source})`
  )
}

function summarizeVisualState(visualState: VisualState | null): void {
  if (!visualState) {
    return
  }

  if (visualState.status === 'capture-failed') {
    for (const warning of visualState.warnings) {
      console.warn(pc.yellow(`[taro] ${warning}`))
    }
    return
  }

  if (visualState.status === 'auth-interrupted') {
    const interrupt = visualState.interrupt
    console.warn(
      pc.yellow('[taro] Visual context unavailable: authentication required before reaching the target UI.')
    )
    if (interrupt) {
      console.warn(
        pc.yellow('[taro]') +
          ` Reached: ${interrupt.reachedUrl}${interrupt.actualTitle ? ` (${interrupt.actualTitle})` : ''}`
      )
      if (interrupt.expectedUrl) {
        console.warn(pc.yellow('[taro]') + ` Expected: ${interrupt.expectedUrl}`)
      }
      if (interrupt.expectedTitle) {
        console.warn(pc.yellow('[taro]') + ` Expected title: ${interrupt.expectedTitle}`)
      }
      console.warn(pc.yellow('[taro]') + ` Signals: ${interrupt.signals.join(', ')}`)
      if (interrupt.strategy === 'storageState' && interrupt.path) {
        console.warn(
          pc.yellow('[taro]') +
            ` Reuse or replace the saved storage state with --auth ${interrupt.path}.`
        )
      } else if (interrupt.strategy === 'instructions' && interrupt.path) {
        console.warn(
          pc.yellow('[taro]') +
            ` Review the saved auth instructions at ${interrupt.path}, or provide --auth for automatic session injection.`
        )
      } else {
        console.warn(
          pc.yellow('[taro]') +
            ' Options: --auth <storageState.json>, --instructions <auth.md>, or --no-screenshots.'
        )
      }
    }
    if (visualState.screenshotPath) {
      log(pc.dim('[taro]') + ` Auth checkpoint screenshot: ${visualState.screenshotPath}`)
    }
    return
  }

  if (visualState.status === 'auth-recovered') {
    log(pc.dim('[taro]') + ' Visual auth recovered via Playwright runtime.')
    if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
      log(
        pc.dim('[taro]') +
          ` Retried recorded URL once after auth recovery: ${visualState.authRecovery.retryToExpectedUrl.targetUrl}`
      )
    }
    if (visualState.startingPointConfirmed) {
      log(pc.dim('[taro]') + ` Starting point confirmed: ${visualState.finalUrl}`)
    }
    if (visualState.authRecovery?.persistedAuthPath) {
      log(
        pc.dim('[taro]') +
          ` Saved Playwright storageState: ${visualState.authRecovery.persistedAuthPath}`
      )
    }
    if (visualState.screenshotPath) {
      log(
        pc.dim('[taro]') + ` Starting point screenshot: ${visualState.screenshotPath}`
      )
    }
    return
  }

  if (
    visualState.status === 'auth-recovery-failed' ||
    visualState.status === 'auth-recovery-timed-out'
  ) {
    const label =
      visualState.status === 'auth-recovery-timed-out'
        ? 'Playwright authentication timed out.'
        : 'Playwright authentication could not be completed.'
    console.warn(pc.yellow(`[taro] ${label}`))
    if (visualState.authRecovery?.instructionsPath) {
      console.warn(
        pc.yellow('[taro]') +
          ` Visual auth instructions: ${visualState.authRecovery.instructionsPath}`
      )
    }
    if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
      const retry = visualState.authRecovery.retryToExpectedUrl
      const failureDetail =
        retry.outcome === 'failed' && retry.error ? ` (${retry.error})` : ''
      console.warn(
        pc.yellow('[taro]') +
          ` Retried recorded URL once after auth recovery: ${retry.targetUrl}${failureDetail}`
      )
    }
    if (visualState.screenshotPath) {
      log(pc.dim('[taro]') + ` Auth checkpoint screenshot: ${visualState.screenshotPath}`)
    }
    for (const warning of visualState.warnings) {
      console.warn(pc.yellow(`[taro] ${warning}`))
    }
    return
  }

  const parts = [visualState.reason]
  if (visualState.dialog?.title) {
    parts.push(`dialog=${visualState.dialog.title}`)
  }
  if (visualState.startingPointConfirmed) {
    parts.push(`page=${visualState.finalUrl}`)
  }
  if (visualState.screenshotPath && !visualState.startingPointConfirmed) {
    parts.push(`screenshot=${visualState.screenshotPath}`)
  }

  log(pc.dim('[taro]') + ` Visual state: ${parts.join(', ')}`)
  if (visualState.startingPointConfirmed && visualState.screenshotPath) {
    log(
      pc.dim('[taro]') + ` Starting point screenshot: ${visualState.screenshotPath}`
    )
  }
  for (const warning of visualState.warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`))
  }
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
  if (mockAnalysis.interactionContracts.length > 0) {
    parts.push(`${mockAnalysis.interactionContracts.length} interaction contract(s)`)
  }

  if (mockAnalysis.instabilityWarnings.length > 0) {
    parts.push(`${mockAnalysis.instabilityWarnings.length} stability warning(s)`)
  }
  if (mockAnalysis.boundaryProfiles.length > 0) {
    parts.push(`${mockAnalysis.boundaryProfiles.length} boundary profile(s)`)
  }

  if (parts.length === 0) {
    return
  }

  log(pc.dim('[taro]') + ` Mock analysis: ${parts.join(', ')}`)

  const topRecommendation = mockAnalysis.recommendations[0]
  if (topRecommendation) {
    log(
      pc.dim('[taro]') +
        ` Mock hint: ${topRecommendation.kind} ${topRecommendation.target} (${topRecommendation.count} file(s))`
    )
  }

  const preferredSharedMock = Object.entries(mockAnalysis.preferredSharedMocks)[0]
  if (preferredSharedMock) {
    log(
      pc.dim('[taro]') +
        ` Shared mock preference: ${preferredSharedMock[0]} -> ${preferredSharedMock[1]}`
    )
  }

  if (mockAnalysis.forbidMocks.length > 0) {
    console.warn(
      pc.yellow(`[taro] Mock policy: forbidden targets ${mockAnalysis.forbidMocks.join(', ')}`)
    )
  }
  if (mockAnalysis.forbidBoundaryTargets.length > 0) {
    console.warn(
      pc.yellow(
        `[taro] Boundary policy: forbidden targets ${mockAnalysis.forbidBoundaryTargets.join(', ')}`
      )
    )
  }

  const topLifecycle = mockAnalysis.mutationLifecycles[0]
  if (topLifecycle) {
    log(
      pc.dim('[taro]') +
        ` Mutation lifecycle: ${topLifecycle.stages.join(' -> ')} in ${topLifecycle.file}`
    )
  }

  const topContract = mockAnalysis.interactionContracts[0]
  if (topContract) {
    log(
      pc.dim('[taro]') +
        ` Interaction contract: ${topContract.kind} (${topContract.states.join(', ')}) in ${topContract.file}`
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

function summarizeSuiteContracts(plan: JsSuitePlan): void {
  if (plan.contracts.length === 0) {
    return
  }

  const primaryContract = plan.contracts[0]!
  const synthesizedCount = plan.scenarios.filter(
    (scenario) => scenario.provenance === 'synthesized-companion'
  ).length

  log(
    pc.dim('[taro]') +
      ` Contract planner: ${primaryContract.kind}, confidence=${primaryContract.confidence}, synthesized=${synthesizedCount}`
  )
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
    `boundaries=${packageProfile.boundaryProfiles.length}`,
    `inlineMocks=${packageProfile.inlineSafeMockTargets.length}`,
  ]

  log(pc.dim('[taro]') + ` State profile: ${parts.join(', ')}`)
}

async function auditBoundaryPolicy(
  code: string,
  packageProfile: ResolvedTaroPackageProfile | null,
  renderTargetFile: string | null
): Promise<string[]> {
  if (!packageProfile) {
    if (!renderTargetFile) {
      return []
    }
  }

  const warnings: string[] = []
  const discoveredImports = renderTargetFile
    ? await discoverBoundaryImportsFromSource(renderTargetFile)
    : []
  const forbiddenTargets = new Set<string>([
    ...(packageProfile?.forbidMocks ?? []),
    ...(packageProfile?.forbidBoundaryTargets ?? []),
    ...((packageProfile?.boundaryProfiles ?? [])
      .filter((profile) => profile.strategy === 'forbid')
      .map((profile) => profile.target)),
    ...discoveredImports
      .filter((importedBoundary) => importedBoundary.guardrailReason)
      .map((importedBoundary) => importedBoundary.target),
  ])

  for (const target of forbiddenTargets) {
    if (
      code.includes(`vi.mock('${target}'`) ||
      code.includes(`vi.mock("${target}"`) ||
      code.includes(`jest.mock('${target}'`) ||
      code.includes(`jest.mock("${target}"`)
    ) {
      warnings.push(`Generated test mocks forbidden boundary target "${target}".`)
    }
  }

  for (const discoveredImport of discoveredImports) {
    if (
      !discoveredImport.guardrailReason ||
      (!code.includes(`vi.mock('${discoveredImport.target}'`) &&
        !code.includes(`vi.mock("${discoveredImport.target}"`) &&
        !code.includes(`jest.mock('${discoveredImport.target}'`) &&
        !code.includes(`jest.mock("${discoveredImport.target}"`))
    ) {
      continue
    }

    warnings.push(
      `Generated test mocks protected UI boundary "${discoveredImport.target}". Repo-owned UI wrappers must remain real at test time; fix portal, animation, or cleanup issues at the source instead of mocking around them.`
    )
  }

  for (const profile of packageProfile?.boundaryProfiles ?? []) {
    if (
      ['shared-module-factory', 'scaffolded-module-factory'].includes(profile.strategy) &&
      profile.supportImportPath &&
      (code.includes(`vi.mock('${profile.target}'`) ||
        code.includes(`vi.mock("${profile.target}"`) ||
        code.includes(`jest.mock('${profile.target}'`) ||
        code.includes(`jest.mock("${profile.target}"`)) &&
      !code.includes(profile.supportImportPath)
    ) {
      warnings.push(
        `Generated test bypasses learned central boundary support for "${profile.target}".`
      )
    }
  }

  if (
    packageProfile?.boundaryProfiles.some((profile) => profile.strategy === 'provider-wrapper') &&
    !packageProfile?.effectiveRenderHelper &&
    code.includes('render(')
  ) {
    warnings.push(
      'Generated test may bypass a learned provider-wrapper boundary because no shared render helper was applied.'
    )
  }

  return warnings
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
  suitePlan: JsSuitePlan,
  options: {
    packageProfile?: ResolvedTaroPackageProfile | null
    visualState?: VisualState | null
  } = {}
): number {
  const { packageProfile, visualState } = options
  const recordingTokens = new Set([
    ...tokenizeSuiteHint(recording.title),
    ...recording.steps.flatMap((step) => tokenizeSuiteHint(step.target ?? '')),
  ])
  const confirmedTokens = new Set(
    collectPageConfirmedContextTerms(visualState ?? null).flatMap((term) => tokenizeSuiteHint(term))
  )
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
    if (confirmedTokens.has(token)) {
      score += 5
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

  if (
    packageProfile?.packagePath &&
    packageProfile.packagePath !== '.' &&
    (candidate.sourceTestFile === packageProfile.packagePath ||
      candidate.sourceTestFile.startsWith(`${packageProfile.packagePath}/`))
  ) {
    score += 8
  }

  return score
}

function resolveRepoRenderTarget(params: {
  candidates: RepoRenderTargetCandidate[]
  packageProfile?: ResolvedTaroPackageProfile | null
  recording: NormalizedRecording
  mockAnalysis: MockAnalysis | null
  suitePlan: JsSuitePlan
  visualState?: VisualState | null
}): RepoRenderTargetCandidate | null {
  const { candidates, packageProfile, recording, mockAnalysis, suitePlan, visualState } = params
  if (candidates.length === 0) {
    return null
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRenderTargetCandidate(candidate, recording, mockAnalysis, suitePlan, {
        packageProfile,
        visualState,
      }),
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
  itGroups: ItGroup[],
  options?: {
    auth?: CaptureVisualStateAuthOptions | null
    debugReporter?: SelectorDebugReporter
  }
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

  const hasSelectorsToResolve = selectorGroups.size > 0
  const hasUrl = Boolean(recording.url)
  const debugReporter = options?.debugReporter

  if (hasSelectorsToResolve && hasUrl) {
    // REPLAY PATH: open one persistent browser and replay steps in order
    log(
      pc.dim('[taro]') +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright with step replay...`
    )

    const selectorStepIds = new Set(selectorGroups.keys())
    let browser: import('playwright').Browser | null = null

    try {
      const authOptions = options?.auth ?? undefined
      const captureSession = await openCapturePage({
        auth: authOptions,
        headless: true,
        timeoutMs: 10000,
        url: recording.url!,
      })
      browser = captureSession.browser
      const page = captureSession.page
      const inspect = createPageInspector(page)
      const unresolvedSelectorResolutions = new Map<StepId, SelectorResolutionResult>()

      const resolveStepSelectors = async (
        stepId: StepId,
        phase: SelectorResolutionPhase
      ): Promise<{
        resolved: number
      }> => {
        const selectors = selectorGroups.get(stepId)
        if (!selectors?.length) {
          unresolvedSelectorResolutions.delete(stepId)
          return { resolved: 0 }
        }

        const currentStep = updatedSteps.get(stepId) ?? stepMap.get(stepId)
        if (!currentStep) {
          unresolvedSelectorResolutions.delete(stepId)
          selectorStepIds.delete(stepId)
          return { resolved: 0 }
        }

        const preservedQuery = getStepQueryDescriptor(currentStep)
        const stepWarnings: string[] = []
        let chosenResolution: SelectorResolutionResult | undefined

        if (preservedQuery) {
          chosenResolution = await resolveSelector(selectors[0]!, {
            debug: {
              inspectSource: 'preserved-query',
              phase,
            },
            url: recording.url,
            preservedQuery,
          })
          debugReporter?.traceSelector(chosenResolution)
        } else {
          for (const selector of selectors) {
            const resolution = await resolveSelector(selector, {
              debug: {
                inspectSource: 'persistent-page',
                phase,
              },
              url: recording.url,
              inspect,
            })
            debugReporter?.traceSelector(resolution)

            if (resolution.status === 'resolved') {
              chosenResolution = resolution
              break
            }

            stepWarnings.push(...resolution.warnings)
            chosenResolution ??= resolution
          }
        }

        if (!chosenResolution) {
          return { resolved: 0 }
        }

        const resolution = mergeSelectorResolutionWarnings(chosenResolution, stepWarnings)
        updatedSteps.set(stepId, applySelectorResolution(currentStep, resolution))

        if (resolution.status === 'resolved') {
          unresolvedSelectorResolutions.delete(stepId)
          if (resolution.outcome !== 'preserved-query') {
            queryResults.push(queryDescriptorToResult(resolution.query))
          }
          return { resolved: 1 }
        }

        unresolvedSelectorResolutions.set(stepId, resolution)
        return { resolved: 0 }
      }

      for (const step of recording.steps) {
        const stepId = step.id
        let selectorsResolvedThisStep = 0

        // Resolve selectors BEFORE replaying this step (DOM is in pre-step state)
        if (stepId && selectorStepIds.has(stepId)) {
          const stats = await resolveStepSelectors(stepId, 'pre-step')
          selectorsResolvedThisStep += stats.resolved
        }

        // Replay the step to advance DOM state for subsequent steps
        const replayResult = await replayStep(page, step, {
          collectDebug: debugReporter?.enabled,
        })
        debugReporter?.traceReplay(replayResult.debug)
        if (!replayResult.replayed && replayResult.warning) {
          console.warn(
            pc.yellow('[taro]') +
              pc.dim(' Step replay: ') +
              replayResult.warning
          )
        }

        if (
          replayResult.replayed &&
          canSuccessfulReplayRevealAdditionalState(step) &&
          unresolvedSelectorResolutions.size > 0
        ) {
          for (const unresolvedStepId of unresolvedSelectorResolutions.keys()) {
            const stats = await resolveStepSelectors(unresolvedStepId, 'post-step')
            selectorsResolvedThisStep += stats.resolved
          }
        }

        debugReporter?.traceStepSummary({
          action: step.action,
          replayed: replayResult.replayed,
          selectorsResolved: selectorsResolvedThisStep,
          selectorsStillUnresolved: unresolvedSelectorResolutions.size,
          stepId: stepId ?? '(unknown)',
          warningCount: replayResult.warning ? 1 : 0,
        })
      }

      for (const resolution of unresolvedSelectorResolutions.values()) {
        if (resolution.status !== 'unresolved') {
          continue
        }

        warnings.push(
          `QRY-03 [${resolution.stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
        )
      }
    } catch (error) {
      // Browser open failed — fall through, selectors remain unresolved
      const message = error instanceof Error ? error.message : 'Unknown error'
      debugReporter?.traceBrowserFailure({
        authStrategy: options?.auth?.strategy,
        error: message,
        url: recording.url!,
      })
      console.warn(
        pc.yellow('[taro]') +
          ` Step replay browser failed: ${message}. Selectors will remain unresolved.`
      )
    } finally {
      await browser?.close().catch(() => undefined)
    }
  } else if (hasSelectorsToResolve) {
    // FALLBACK PATH: no URL available, resolve without replay (original behavior)
    log(
      pc.dim('[taro]') +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright...`
    )

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
          debug: {
            inspectSource: 'preserved-query',
            phase: 'fallback-no-replay',
          },
          url: recording.url,
          preservedQuery,
        })
        debugReporter?.traceSelector(chosenResolution)
      } else {
        for (const selector of selectors) {
          const resolution = await resolveSelector(selector, {
            debug: {
              inspectSource: 'fresh-browser',
              phase: 'fallback-no-replay',
            },
            url: recording.url,
          })
          debugReporter?.traceSelector(resolution)

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
  auth?: TaroPlaywrightAuthProfile | null
  authRecovery?: {
    enabled: boolean
    instructionsPath?: string
    persistedAuthPath?: string
    saveStorageStatePath?: string
    timeoutMs: number
  }
  projectRoot: string
  recording: NormalizedRecording
  selector?: string
  skipScreenshotArtifacts?: boolean
  url?: string
}): Promise<VisualState | null> {
  const {
    analyzedRecording,
    auth,
    authRecovery,
    projectRoot,
    recording,
    selector,
    skipScreenshotArtifacts = false,
    url,
  } = params
  if (!url) {
    return null
  }

  const candidates = findVisualCaptureCandidates(analyzedRecording)
  const expected = {
    landmarks: collectExpectedLandmarks(recording),
    title: findExpectedPageTitle(recording),
    url,
  }
  const screenshotDir = skipScreenshotArtifacts
    ? undefined
    : resolveVisualCaptureScreenshotDir(projectRoot)
  const authOptions = auth
    ? {
        path: resolve(projectRoot, auth.path),
        strategy: auth.strategy,
      }
    : null

  if (candidates.length > 0) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: candidates[0]!.reason,
      screenshotDir,
      selector: candidates[0]!.selector,
    })
  }

  if (selector) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: 'ambiguous-ui',
      screenshotDir,
      selector,
    })
  }

  return captureVisualState(url, {
    auth: authOptions,
    authRecovery,
    expected,
    reason: 'page-context',
    screenshotDir,
  })
}

async function persistRecoveredVisualAuth(params: {
  packageProfile: ResolvedTaroPackageProfile | null
  projectRoot: string
  visualState: VisualState | null
}): Promise<TaroPlaywrightAuthProfile | null> {
  const { packageProfile, projectRoot, visualState } = params
  if (
    visualState?.status !== 'auth-recovered' ||
    !visualState.authRecovery?.persistedAuthPath
  ) {
    return null
  }

  const persistedAuth: TaroPlaywrightAuthProfile = {
    strategy: 'storageState',
    path: visualState.authRecovery.persistedAuthPath,
    detectedAt: 'generate',
    source: 'manual',
  }

  if (!packageProfile) {
    console.warn(
      pc.yellow('[taro] Visual auth: storageState was saved, but no package profile was available to persist it in state.')
    )
    return persistedAuth
  }

  try {
    const persisted = await persistPlaywrightAuthProfile(
      projectRoot,
      packageProfile.packagePath,
      persistedAuth
    )
    if (persisted) {
      log(
        pc.dim('[taro]') +
          ` Persisted visual auth for package ${packageProfile.packagePath}: ${persistedAuth.strategy}=${persistedAuth.path}`
      )
    } else {
      console.warn(
        pc.yellow('[taro] Visual auth: storageState was saved, but Taro could not persist it in state.')
      )
    }
  } catch {
    console.warn(
      pc.yellow('[taro] Visual auth: storageState was saved, but persisting it in .taro/state.json failed.')
    )
  }

  return persistedAuth
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
    process.exit(2)
  }

  log(pc.green('[taro] ✓ post-write verified'))

  try {
    await refreshTaroState(projectRoot)
    await appendGeneratedTestRecord(projectRoot, {
      packagePath: packageProfile?.packagePath ?? '.',
      recordingFile,
      testFile: outputPath,
      scoreResult,
    })
    log(
      pc.dim('[taro]') +
        ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? '.'}.`
    )
  } catch {
    // State updates are best-effort; generation should still succeed.
  }
}

export function createGenerateCommand(context: GenerateCommandContext = {}): Command {
  const generate = new Command('__generate')

  generate
    .description('Internal runtime-only generator for Testing Library Recorder JS exports')
    .argument('<file>', 'Path to the recorder export file (.js)')
    .option('-i, --interactive-auth', 'Force interactive Playwright auth recovery even when stdio is not detected as TTY')
    .option('--auth <file>', 'Path to a Playwright storageState JSON file for optional visual capture')
    .option('--instructions <file>', 'Path to a non-secret auth instructions file for optional visual capture')
    .option('--no-screenshots', 'Skip optional Playwright screenshots and visual inspection')
    .option('--debug-selectors', 'Emit detailed selector resolution and Playwright replay diagnostics')
    .option('--debug-selectors-json <file>', 'Write selector resolution and Playwright replay diagnostics as JSONL')
    .action(async (file: string) => {
      const filePath = resolve(file)
      const projectRoot = cwd()
      const findings: Finding[] = []
      const commandOptions = generate.opts<{
        auth?: string
        debugSelectors?: boolean
        debugSelectorsJson?: string
        interactiveAuth?: boolean
        instructions?: string
        screenshots?: boolean
      }>()
      const screenshotsEnabled = commandOptions.screenshots !== false
      const debugReporter = createSelectorDebugReporter({
        enabled: Boolean(commandOptions.debugSelectors || commandOptions.debugSelectorsJson),
        jsonPath: commandOptions.debugSelectorsJson
          ? resolve(projectRoot, commandOptions.debugSelectorsJson)
          : undefined,
      })

      // 1. Verify file is accessible
      try {
        await access(filePath)
      } catch {
        console.error(
          pc.red('Error:') + ` File not found or not accessible: ${pc.bold(filePath)}`
        )
        process.exit(2)
      }

      let parsedInput: Awaited<ReturnType<typeof loadInput>>
      try {
        parsedInput = await loadInput(filePath)
      } catch (err) {
        console.error(
          pc.red('Error:') + ` Failed to parse recording: ${pc.bold(filePath)}\n${String(err)}`
        )
        process.exit(2)
      }

      let normalizedRecording = normalizeJsBaseline(parsedInput)
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
      const explicitAuthPath = await resolveOptionalFilePath(projectRoot, commandOptions.auth)
      const explicitInstructionsPath = await resolveOptionalFilePath(
        projectRoot,
        commandOptions.instructions
      )
      if (explicitAuthPath && explicitInstructionsPath) {
        console.warn(
          pc.yellow('[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run.')
        )
      }
      let visualAuth: TaroPlaywrightAuthProfile | null =
        explicitAuthPath
          ? {
              strategy: 'storageState',
              path: explicitAuthPath.relativePath,
              detectedAt: 'generate',
              source: 'manual',
            }
          : explicitInstructionsPath
            ? {
                strategy: 'instructions',
                path: explicitInstructionsPath.relativePath,
                detectedAt: 'generate',
                source: 'manual',
              }
            : packageProfile?.playwrightAuth ?? null
      const authInstructionsPath =
        explicitInstructionsPath?.relativePath ??
        (visualAuth?.strategy === 'instructions' ? visualAuth.path : undefined)
      const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
        context,
        commandOptions.interactiveAuth === true
      )
      const recoveryStorageStatePath = resolveVisualAuthStorageStatePath(
        projectRoot,
        visualAuth
      )
      const earlyAnalyzedRecording = analyzeRecording(normalizedRecording)
      const recordingUrl = findRecordingUrl(earlyAnalyzedRecording)
      // Authentication preflight runs before repo grounding so Playwright-confirmed
      // route and landmark evidence can steer context matching when available.
      let visualState = await maybeCaptureVisualState({
        analyzedRecording: earlyAnalyzedRecording,
        auth: visualAuth,
        authRecovery: screenshotsEnabled
          ? {
              enabled: interactiveVisualAuth,
              instructionsPath: authInstructionsPath,
              persistedAuthPath: recoveryStorageStatePath.relativePath,
              saveStorageStatePath: recoveryStorageStatePath.absolutePath,
              timeoutMs: MANUAL_VISUAL_AUTH_TIMEOUT_MS,
            }
          : undefined,
        projectRoot,
        recording: normalizedRecording,
        selector: getPrimarySelector(normalizedRecording),
        skipScreenshotArtifacts: !screenshotsEnabled,
        url: recordingUrl,
      })
      if (!screenshotsEnabled) {
        log(
          pc.dim('[taro]') +
            ' Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran.'
        )
      }
      summarizeAuthPreflight({
        auth: visualAuth,
        url: recordingUrl,
        visualState,
      })
      summarizeVisualState(visualState)
      summarizePageConfirmedContext(visualState)
      const contextSearchTerms = collectRepoContextSearchTerms(normalizedRecording, visualState)
      const contextMatches = await findRepoContextMatches({
        projectRoot,
        terms: contextSearchTerms,
        excludePaths: [filePath, defaultOutputPath],
      })
      normalizedRecording = await enrichCanonicalSemanticMarkers({
        contextMatches,
        projectRoot,
        recording: normalizedRecording,
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
          log(
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

      if ((explicitAuthPath || explicitInstructionsPath) && packageProfile && visualAuth) {
        const persisted = await persistPlaywrightAuthProfile(
          projectRoot,
          packageProfile.packagePath,
          visualAuth
        )
        if (persisted) {
          log(
            pc.dim('[taro]') +
              ` Persisted visual auth for package ${packageProfile.packagePath}: ${visualAuth.strategy}=${visualAuth.path}`
          )
        } else {
          console.warn(
            pc.yellow('[taro] Visual auth: resolved the auth path for this run but could not persist it in state.')
          )
        }
      } else if ((explicitAuthPath || explicitInstructionsPath) && !packageProfile && visualAuth) {
        console.warn(
          pc.yellow('[taro] Visual auth: using the explicit auth path for this run, but no package profile was available to persist it.')
        )
      }

      if (!hadState) {
        log(pc.dim('[taro]') + ' Bootstrapped .taro/state.json from current repo tests.')
      }
      if (contextMatches.length > 0) {
        log(
          pc.dim('[taro]') +
            ` Context matches: ${formatContextMatchesSummary(contextMatches)}`
        )
      }
      if (packageProfile?.appliedOverrides.length) {
        log(
          pc.dim('[taro]') +
            ` Applied overrides for ${packageProfile.packagePath}: ${packageProfile.appliedOverrides.join(', ')}`
        )
      }
      if (contextProfileReason && packageProfile) {
        log(
          pc.dim('[taro]') +
            ` Context-selected package profile ${packageProfile.packagePath}: ${contextProfileReason}.`
        )
      }
      summarizeResolvedPackageProfile(packageProfile)
      summarizePlaywrightAuth(packageProfile)

      log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps` +
          `, ${normalizedRecording.baseline?.itGroups.length ?? 0} test group(s)`
      )

      const analyzedRecording = analyzeRecording(normalizedRecording)
      const markerAwareRecording = mergeAnalyzedStepState(normalizedRecording, analyzedRecording)
      summarizeCleanup(analyzedRecording)
      const recoveredVisualAuth = await persistRecoveredVisualAuth({
        packageProfile,
        projectRoot,
        visualState,
      })
      if (recoveredVisualAuth) {
        visualAuth = recoveredVisualAuth
      }
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
        packageProfile,
        recording: normalizedRecording,
        mockAnalysis,
        suitePlan: rawJsSuitePlan,
        visualState,
      })
      const resolvedRenderTargetFile = await resolveRenderTargetFile({
        projectRoot,
        renderTarget: repoRenderTarget,
      })
      const outputPath = resolvedRenderTargetFile
        ? deriveOutputPath(resolvedRenderTargetFile)
        : defaultOutputPath
      const generationRenderTarget =
        repoRenderTarget && resolvedRenderTargetFile
          ? {
              ...repoRenderTarget,
              importPath: toImportPath(dirname(outputPath), resolvedRenderTargetFile),
            }
          : repoRenderTarget
      const generationRenderHelper = rebaseRenderHelperImportPath({
        projectRoot,
        outputPath,
        renderHelper: packageProfile?.effectiveRenderHelper ?? null,
      })
      const boundarySupportPlan = await planBoundarySupport({
        projectRoot,
        outputPath,
        packageProfile,
        renderTargetFile: resolvedRenderTargetFile,
        renderTarget: repoRenderTarget,
      })

      if (boundarySupportPlan.warnings.length > 0) {
        for (const warning of boundarySupportPlan.warnings) {
          console.warn(pc.yellow(`[taro] Boundary support: ${warning}`))
        }
      }

      const jsSuitePlan = rawJsSuitePlan
        ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
        : null

      if (jsSuitePlan) {
        summarizeBoundaryWarnings(jsSuitePlan.warnings)
        summarizeSuiteContracts(jsSuitePlan)
      }

      const resolvedJsGeneration = await resolveJsGeneration(
        markerAwareRecording,
        jsSuitePlan?.itGroups ?? toItGroups(analyzedRecording, normalizedRecording.title),
        {
          auth: visualAuth
            ? { path: resolve(projectRoot, visualAuth.path), strategy: visualAuth.strategy }
            : undefined,
          debugReporter,
        }
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
        renderTarget: generationRenderTarget,
        renderHelper: generationRenderHelper,
      })
      generated.code = applyBoundarySupport(generated.code, boundarySupportPlan)
      const boundaryPolicyWarnings = await auditBoundaryPolicy(
        generated.code,
        packageProfile,
        resolvedRenderTargetFile
      )
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
      if (boundaryPolicyWarnings.length > 0) {
        generated.code = [
          ...boundaryPolicyWarnings.map((warning) => `// taro-boundary-warning: ${warning}`),
          generated.code,
        ].join('\n')
      }

      emitQuerySummary(resolvedJsGeneration?.queryResults ?? [])

      const markerDiagnostics = buildMarkerReviewDiagnostics(hydratedSuitePlan)
      const candidateFlowCoverage = buildFlowCoverageSummary(analyzedRecording, generated.code)
      const scoreResult = scoreGeneratedTest(generated.code, {
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        markerCoverage,
        markerDiagnostics,
      })
      const boundaryIssues = analyzeBoundaryIsolation(generated.code)
      const candidateAssessment: OutputAssessment = {
        flowCoverage: candidateFlowCoverage,
        scoreResult,
      }

      let shouldOverwriteExistingOutput = false
      if (await pathExists(outputPath)) {
        try {
          const existingCode = await readFile(outputPath, 'utf-8')
          const existingAssessment = await assessOutputAgainstRecording({
            analyzedRecording,
            code: existingCode,
          })
          shouldOverwriteExistingOutput =
            compareOutputAssessments(candidateAssessment, existingAssessment) > 0
          logExistingOutputDecision({
            outputPath,
            candidate: candidateAssessment,
            existing: existingAssessment,
            overwrite: shouldOverwriteExistingOutput,
          })

          if (!shouldOverwriteExistingOutput) {
            await debugReporter.persist()
            flushFindings(findings)
          }
        } catch (error) {
          console.warn(
            pc.yellow(
              `[taro] Existing output could not be assessed cleanly, so Taro will preserve it instead of overwriting blindly.`
            )
          )
          console.warn(pc.yellow(`[taro] Assessment detail: ${String(error)}`))
          await debugReporter.persist()
          flushFindings(findings)
        }
      }

      logScore(scoreResult)
      emitMarkerCoverageSection(scoreResult)
      emitRecoveredMarkerDiagnostics(hydratedSuitePlan)
      emitMarkerPlacementCorrections(hydratedSuitePlan)
      emitUnresolvedMarkerWarnings(hydratedSuitePlan)
      for (const warning of boundaryPolicyWarnings) {
        console.warn(pc.yellow(`[taro] Boundary policy: ${warning}`))
      }
      if (boundarySupportPlan.requiresReview) {
        console.warn(
          pc.yellow(
            '[taro] Boundary support requires manual review because one or more collaborators were scaffolded with generic defaults.'
          )
        )
      }
      emitLowConfidenceBanner(scoreResult)
      emitScoreHints(scoreResult, resolvedJsGeneration?.queryResults ?? [], boundaryIssues)

      try {
        await materializeBoundarySupport(boundarySupportPlan)
        const result = await writeTestFile(generated.code, outputPath, {
          createDir: true,
          overwriteExisting: shouldOverwriteExistingOutput,
        })
        await finalizeGeneratedOutput({
          code: generated.code,
          outputPath: result.filePath,
          projectRoot,
          recordingFile: filePath,
          scoreResult,
          packageProfile,
        })
        const action = result.overwritten ? pc.yellow('Updated') : pc.green('Created')
        log(`${action}: ${pc.bold(result.filePath)}`)
      } catch (err) {
        await debugReporter.persist()
        process.stderr.write(pc.red('Error:') + ` ${String(err)}` + '\n')
        process.exit(2)
      }
      await debugReporter.persist()
      flushFindings(findings)
    })

  return generate
}
