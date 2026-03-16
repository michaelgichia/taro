/**
 * Generate command
 * Internal runtime-only generation pipeline for Testing Library Recorder JS exports.
 */

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { cwd, stdin, stdout } from 'node:process'

import { Command } from 'commander'
import pc from 'picocolors'

import { normalizeJsBaseline } from '#core/baseline-normalizer.ts'
import { analyzeBoundaryIsolation } from '#core/boundary-intelligence.ts'
import { discoverBoundaryImportsFromSource } from '#core/boundary-learning.ts'
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from '#core/boundary-support.ts'
import {
  type Finding,
  formatFindingsBlock,
  hasBlockingFindings,
} from '#core/findings-reporter.ts'
import { emitQuerySummary, generateTestFromGroups } from '#core/generator.ts'
import { loadInput } from '#core/input-loader.ts'
import { type JsParseResult, parseJsRecording } from '#core/js-parser.ts'
import type { MockAnalysis } from '#core/mock-intelligence.ts'
import { analyzeMocks } from '#core/mock-intelligence.ts'
import { isTestIdQueryMethod } from '#core/query-policy.ts'
import {
  analyzeRecording,
  findVisualCaptureCandidates,
} from '#core/recording-intelligence.ts'
import type {
  CaptureVisualStateAuthOptions,
  ReplayStepDebugTrace,
} from '#core/resolver.ts'
import {
  captureVisualState,
  createPageInspector,
  openCapturePage,
  replayStep,
  resolveSelector,
} from '#core/resolver.ts'
import { scoreGeneratedTest } from '#core/scorer.ts'
import { enrichCanonicalSemanticMarkers } from '#core/semantic-marker-enrichment.ts'
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '#core/state.ts'
import type { JsSuitePlan } from '#core/suite-planner.ts'
import { planJsSuite } from '#core/suite-planner.ts'
import { verifySyntax } from '#core/verifier.ts'
import { writeTestFile } from '#core/writer.ts'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  QueryDescriptor,
  QueryResult,
  SelectorDescriptor,
  SelectorResolutionPhase,
  SelectorResolutionResult,
  SemanticMarkerAssertionUnresolvedReason,
  StepId,
  UnresolvedSemanticMarkerAssertionResolution,
  VisualState,
} from '#types/recording.ts'
import type {
  MarkerCoverageTotals,
  MarkerReviewDiagnostics,
  ScoreResult,
} from '#types/score.ts'
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroPlaywrightAuthProfile,
} from '#types/state.ts'

interface GenerateCommandContext {
  input?: Pick<typeof stdin, 'isTTY'>
  output?: Pick<typeof stdout, 'isTTY'>
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

type AuthPreflightStatus =
  | 'not_required'
  | 'unknown_recipe'
  | 'authenticated'
  | 'failed'

/**
 * Writes an operational log line to stderr.
 *
 * Stdout is reserved for the findings envelope, so callers must use this helper
 * for routine status output from the generation pipeline.
 *
 * @param {string} msg - Supplies the already-formatted message to emit as a single stderr line.
 */
function log(msg: string): void {
  process.stderr.write(msg + '\n')
}

/**
 * Builds a selector replay reporter that mirrors debug traces to stderr and optionally persists them as JSONL.
 *
 * When `enabled` is false, the returned reporter becomes a no-op even if a JSON path is provided.
 * When `jsonPath` is set, `persist()` writes one serialized trace record per line.
 *
 * @param {{ enabled: boolean, jsonPath?: string }} options - Enables live tracing and, when `jsonPath` is set, records structured diagnostics for later inspection.
 * @returns {SelectorDebugReporter} A reporter with replay, selector, step-summary, and browser-failure hooks for the JS generation pipeline.
 */
function createSelectorDebugReporter(options: {
  enabled: boolean
  jsonPath?: string
}): SelectorDebugReporter {
  const records: DebugTraceRecord[] = []

  const emit = (record: DebugTraceRecord, line: string) => {
    // Keep debug reporting zero-cost for normal runs unless the caller explicitly opted in.
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

/**
 * Emits the findings envelope to stdout and terminates the process with the matching exit code.
 *
 * This helper never returns. A blocking finding exits with code `1`; otherwise the command exits with `0`.
 *
 * @param {Finding[]} findings - Provides the complete finding set to serialize, including any blocking items that should flip the exit status.
 * @throws {never} Always terminates the current process.
 */
function flushFindings(findings: Finding[]): never {
  if (findings.length > 0) {
    process.stdout.write(formatFindingsBlock(findings) + '\n')
  }
  process.exit(hasBlockingFindings(findings) ? 1 : 0)
}

const EMPTY_MARKER_DIAGNOSTICS: MarkerReviewDiagnostics = {
  canonicalRecoveries: 0,
  placementConflicts: 0,
  placementCorrections: 0,
}
const MANUAL_VISUAL_AUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH = '.taro/playwright/.auth/user.json'
const PAGE_CONFIRMED_CONTEXT_TERM_BONUS = 50

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

/**
 * Derives the default generated test path for a recorder export.
 *
 * The returned file always lives beside `inputPath` and replaces the source extension with `.test.tsx`.
 *
 * @param {string} inputPath - Identifies the recorder export whose sibling test file path should be derived.
 * @returns {string} The generated test file path in `<name>.test.tsx` format.
 *   Example: `flows/login.js` becomes `flows/login.test.tsx`.
 */
function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '')
  return join(dir, `${name}.test.tsx`)
}

/**
 * Checks whether a path already points at a test or spec file.
 *
 * @param {string} filePath - Supplies the path to classify using Taro's Jest/Vitest-style filename conventions.
 * @returns {boolean} `true` when the path ends with `.test.*` or `.spec.*`; otherwise `false`.
 */
function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/u.test(filePath)
}

/**
 * Checks whether an import specifier is relative to its source file.
 *
 * @param {string} importPath - Supplies the raw module specifier from source code.
 * @returns {boolean} `true` for `./` and `../` imports; otherwise `false`.
 */
function isRelativeImportPath(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../')
}

/**
 * Checks whether a filesystem path is accessible to the current process.
 *
 * @param {string} filePath - Identifies the file or directory to probe with `fs.access`.
 * @returns {Promise<boolean>} Resolves to `true` when the path is reachable; otherwise `false`.
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves a relative import from a source file to the most likely on-disk module path.
 *
 * Non-relative specifiers bypass resolution and return `null`. When no candidate exists,
 * the unresolved absolute target path is still returned so callers can keep deriving paths from it.
 *
 * @param {{ projectRoot: string, sourceFile: string, importPath: string }} params - Provides the repo root, the importing file, and the raw import specifier to resolve.
 * @returns {Promise<string | null>} The absolute imported file path, or `null` when the import is not relative.
 */
async function resolveImportedFilePath(params: {
  projectRoot: string
  sourceFile: string
  importPath: string
}): Promise<string | null> {
  const { projectRoot, sourceFile, importPath } = params
  // Only repo-local relative imports can be chased to an on-disk render target.
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

  // Preserve the unresolved absolute path so downstream code can still derive a stable output location.
  return rawTargetPath
}

/**
 * Resolves the concrete source file that should anchor generation for a repo render target.
 *
 * Test-file candidates are followed through their relative import so generation can target the real module instead of the test wrapper.
 *
 * @param {{ projectRoot: string, renderTarget: RepoRenderTargetCandidate | null }} params - Supplies the repo root and the selected render target candidate, or `null` to bypass resolution.
 * @returns {Promise<string | null>} The absolute render target file path, or `null` when no render target is available.
 */
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

/**
 * Rebases a learned render-helper import so it remains valid from a new output directory.
 *
 * Helpers that are missing, non-relative, or learned from non-test sources are returned unchanged.
 *
 * @param {{ projectRoot: string, outputPath: string, renderHelper: ResolvedTaroPackageProfile['effectiveRenderHelper'] }} params - Supplies the repo root, the final output file, and the render-helper profile to adapt.
 * @returns {ResolvedTaroPackageProfile['effectiveRenderHelper']} The original helper or a copy with `importPath` rewritten relative to `outputPath`.
 */
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

/**
 * Checks whether a string looks like CSS selector syntax rather than user-facing text.
 *
 * @param {string} value - Supplies the candidate text to classify before it is reused as repo context or coverage evidence.
 * @returns {boolean} `true` when the value resembles selector syntax or a raw HTML tag; otherwise `false`.
 */
function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  )
}

/**
 * Normalizes repo-context text and filters out terms that are too generic to search reliably.
 *
 * Short strings, selector-like fragments, and one-word generic actions such as `save` or `close`
 * are rejected so later context matching stays biased toward meaningful UI evidence.
 *
 * @param {string} [value] - Supplies raw UI text to normalize; empty, generic, or selector-like input returns `null`.
 * @returns {string | null} The trimmed context term, or `null` when the value should not influence repo grounding.
 */
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

/**
 * Normalizes text for case-insensitive substring comparison.
 *
 * @param {string | null} [value] - Supplies the source text to trim, collapse, and lowercase before comparison.
 * @returns {string | null} The normalized text, or `null` when the input is empty after trimming.
 */
function normalizeComparableText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized ? normalized : null
}

/**
 * Checks whether a coverage token is too generic to count as meaningful evidence.
 *
 * @param {string} token - Supplies a normalized coverage token extracted from recording or generated code.
 * @returns {boolean} `true` when the token is a generic UI or Testing Library term that should be ignored.
 */
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

/**
 * Extracts normalized comparison tokens from user-facing text or quoted code fragments.
 *
 * Selector-like values, generic tokens, and very short fragments are discarded to keep coverage checks focused on distinguishing text.
 *
 * @param {string | null} [value] - Supplies recorder text or generated code from which meaningful comparison tokens should be collected.
 * @returns {string[]} Unique normalized tokens suitable for loose flow-coverage matching.
 */
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

/**
 * Collects the primary and secondary coverage tokens that represent a recorder step.
 *
 * Navigation, scrolling, wait steps, and top-level location/title assertions are treated as non-measurable
 * because their evidence is either structural or too indirect for token-based matching.
 *
 * @param {NormalizedStep} step - Supplies the analyzed recorder step whose visible evidence should be mapped into coverage tokens.
 * @returns {{ measurable: boolean, primary: string[], secondary: string[] }} The measurable flag plus the primary and secondary token sets for the step.
 */
function collectStepCoverageTokens(step: NormalizedStep): {
  measurable: boolean
  primary: string[]
  secondary: string[]
} {
  // Structural/navigation steps are intentionally excluded because token matching would create noisy false positives.
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

  // Input-like steps need both the control identifier and the asserted/entered value to count as covered.
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

/**
 * Checks whether normalized generated code contains a specific coverage token.
 *
 * @param {string} normalizedCode - Supplies the already-normalized code string to search.
 * @param {string} token - Supplies the normalized token that must appear in the code to count as covered.
 * @returns {boolean} `true` when the token is present in `normalizedCode`; otherwise `false`.
 */
function codeIncludesCoverageToken(normalizedCode: string, token: string): boolean {
  return normalizedCode.includes(token)
}

/**
 * Summarizes how much of a recorded flow is reflected by the generated code.
 *
 * A step counts as covered only when at least one primary token and, when present,
 * at least one secondary token appear in the normalized output code.
 *
 * @param {AnalyzedRecording} analyzedRecording - Supplies the analyzed recording whose measurable steps should be scored.
 * @param {string} code - Supplies the generated test code to evaluate against the recording.
 * @returns {FlowCoverageSummary} Coverage totals plus the covered and uncovered step identifiers.
 */
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
    // Primary evidence captures the subject of the step; secondary evidence captures the user-visible value when one matters.
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

/**
 * Converts parsed query descriptors into scorer-friendly query results.
 *
 * @param {JsParseResult} parsed - Supplies the parsed JS recording output whose queries should be normalized for scoring.
 * @returns {QueryResult[]} Query metadata in the shape expected by `scoreGeneratedTest`.
 */
function mapParsedQueriesToResults(parsed: JsParseResult): QueryResult[] {
  return parsed.queries.map((query) => ({
    method: query.method,
    query: query.raw ?? query.target ?? query.name ?? query.role ?? query.method,
    quality: query.quality ?? 'fragile',
    line: query.line,
  }))
}

/**
 * Scores generated code against both recorder flow coverage and query-quality heuristics.
 *
 * @param {{ analyzedRecording: AnalyzedRecording, code: string }} params - Supplies the analyzed recording and candidate test code to assess.
 * @returns {Promise<OutputAssessment>} The combined flow-coverage and quality assessment for the candidate output.
 */
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

/**
 * Compares two output assessments to decide which generated file is stronger.
 *
 * Coverage wins first, then manual-review status, then numeric score, then blocker count.
 *
 * @param {OutputAssessment} candidate - Supplies the newly generated assessment to compare.
 * @param {OutputAssessment} existing - Supplies the assessment for the already-present output file.
 * @returns {number} A positive number when `candidate` is better, a negative number when `existing` is better, or `0` when they are effectively tied.
 */
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

/**
 * Logs why Taro will keep or replace an existing generated test file.
 *
 * @param {{ outputPath: string, candidate: OutputAssessment, existing: OutputAssessment, overwrite: boolean }} params - Supplies the file path, both assessments, and the final overwrite decision to report.
 */
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

/**
 * Scores a repo-context term by how specific it is likely to be.
 *
 * Longer terms and terms with whitespace, punctuation, or digits receive extra weight so context searches prioritize distinctive UI text.
 *
 * @param {string} term - Supplies the normalized term to rank.
 * @returns {number} A relative specificity score where higher values mean better search evidence.
 */
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

/**
 * Extracts the best user-facing context term from the focused visual element.
 *
 * The search prefers accessible labels before falling back to visible text-like fields.
 *
 * @param {VisualState} visualState - Supplies the captured visual state whose focused element should contribute context.
 * @returns {string | null} The first normalized element term, or `null` when no reliable text is available.
 */
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

/**
 * Collects repo-grounding terms that Playwright confirmed on the page.
 *
 * Authentication interruption states only contribute already-known landmark evidence; fully captured states
 * can also contribute dialog text and focused-element context.
 *
 * @param {VisualState | null} visualState - Supplies the visual capture result, or `null` to bypass page-confirmed context.
 * @returns {string[]} Unique normalized context terms confirmed by the live page state.
 */
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

  // Interrupted auth flows only have trustworthy top-level landmarks; deeper UI signals come from the wrong page.
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

/**
 * Logs a short summary of the strongest page-confirmed repo-context terms.
 *
 * @param {VisualState | null} visualState - Supplies the visual state whose confirmed terms should be reported; `null` or empty terms produce no output.
 */
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

/**
 * Collects and ranks the recorder terms that should drive repo-context matching.
 *
 * Page-confirmed terms receive a bonus so verified live-page evidence outranks unconfirmed recorder text.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose title and steps provide search evidence.
 * @param {VisualState | null} [visualState=null] - Supplies optional page-confirmed context that should boost matching terms.
 * @returns {string[]} Up to eight ranked search terms ordered from strongest to weakest evidence.
 */
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

  // Recorder title and step text still matter, but live page confirmation should dominate the ranking when available.
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

/**
 * Scans the repository for source and test files that match the strongest recording context terms.
 *
 * The search skips large files, generated directories, and explicitly excluded paths, then returns only the top-ranked matches.
 *
 * @param {{ projectRoot: string, terms: string[], excludePaths: string[] }} params - Supplies the repo root, ranked search terms, and absolute or relative paths that must be ignored.
 * @returns {Promise<RepoContextMatch[]>} The strongest matching files with their matched terms, kind, and aggregate score.
 */
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
        // Skip generated and dependency directories so context matching stays fast and relevant.
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

      // Very large files are rarely useful as grounding evidence and are expensive to scan repeatedly.
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

/**
 * Formats the top repo-context matches into a compact log-friendly summary.
 *
 * @param {RepoContextMatch[]} matches - Supplies ranked context matches to condense for stderr logging.
 * @returns {string} A `file [term, term]` summary joined with ` | ` separators.
 */
function formatContextMatchesSummary(matches: RepoContextMatch[]): string {
  return matches
    .slice(0, 3)
    .map((match) => `${match.filePath} [${match.matchedTerms.slice(0, 2).join(', ')}]`)
    .join(' | ')
}

/**
 * Normalizes a path for equality comparisons across macOS `/private/var` aliases.
 *
 * @param {string} value - Supplies the absolute path to normalize before comparing or rebasing it.
 * @returns {string} The comparable path with the `/private` prefix removed for `/var` locations.
 */
function normalizeComparablePath(value: string): string {
  return value.replace(/^\/private(?=\/var\/)/u, '')
}

/**
 * Resolves the most relevant learned package profile from repo-context matches.
 *
 * If no match outranks the current profile, the existing profile is preserved and the reason is `null`.
 *
 * @param {{ state: Awaited<ReturnType<typeof loadOrBootstrapTaroState>>['state'], currentProfile: ResolvedTaroPackageProfile | null, projectRoot: string, overrides: Awaited<ReturnType<typeof readTaroOverrides>>, matches: RepoContextMatch[] }} params - Supplies the current state snapshot, active profile, repo root, overrides, and ranked context matches.
 * @returns {{ profile: ResolvedTaroPackageProfile | null, reason: string | null }} The selected package profile and a short explanation when context matching changed it.
 */
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
  // Longest package paths win prefix checks first so nested workspace packages are matched before parent folders.
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
  // Do not churn the active profile unless repo evidence clearly points at a different package.
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

/**
 * Converts an absolute file path into a relative import specifier from a directory.
 *
 * The returned import omits the file extension and always starts with `.`.
 *
 * @param {string} fromDir - Supplies the directory from which the import should be written.
 * @param {string} absoluteFilePath - Supplies the absolute file path to convert into an import specifier.
 * @returns {string} A relative import path without a file extension.
 *   Example: `./components/Foo`.
 */
function toImportPath(fromDir: string, absoluteFilePath: string): string {
  const withoutExtension = normalizeComparablePath(absoluteFilePath).replace(/\.[^.]+$/u, '')
  const relativePath = relative(
    normalizeComparablePath(fromDir),
    withoutExtension
  ).replace(/\\/g, '/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

/**
 * Checks whether a filename stem looks like a component or module symbol suitable as a render target.
 *
 * @param {string} symbol - Supplies the candidate symbol name derived from a matched file path.
 * @returns {boolean} `true` when the symbol looks like a PascalCase identifier; otherwise `false`.
 */
function isLikelyRenderTargetSymbol(symbol: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/u.test(symbol)
}

/**
 * Derives repo render-target candidates from source files that matched recording context.
 *
 * Only source files with symbol-like basenames become candidates, and duplicate symbol/import pairs are removed.
 *
 * @param {{ projectRoot: string, outputPath: string, matches: RepoContextMatch[] }} params - Supplies the repo root, the expected output path, and the ranked context matches to transform.
 * @returns {RepoRenderTargetCandidate[]} Render-target candidates inferred from repo context matches.
 */
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
    // Only source files can become render targets; test files are evidence, not components to render directly.
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

/**
 * Logs the overall generated-test score and its dimension breakdown.
 *
 * @param {ScoreResult} scoreResult - Supplies the scoring result to summarize for the operator.
 */
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

/**
 * Logs semantic-marker coverage totals and warns when the quality gate is failing.
 *
 * @param {ScoreResult} scoreResult - Supplies the scoring result whose marker coverage and gate status should be reported.
 */
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

/**
 * Collects every planned marker assertion across all suite scenarios.
 *
 * @param {JsSuitePlan} suitePlan - Supplies the suite plan whose scenario marker assertions should be flattened.
 * @returns {PlannedMarkerAssertion[]} All planned marker assertions in scenario order.
 */
function collectPlannedMarkerAssertions(suitePlan: JsSuitePlan): PlannedMarkerAssertion[] {
  return suitePlan.scenarios.flatMap((scenario) => scenario.markerAssertions ?? [])
}

/**
 * Builds marker-review diagnostics from a suite plan.
 *
 * A `null` plan returns the shared empty diagnostic totals so callers can score generated output without branching.
 *
 * @param {JsSuitePlan | null} suitePlan - Supplies the suite plan to inspect, or `null` when no plan could be produced.
 * @returns {MarkerReviewDiagnostics} Counts for canonical recoveries, placement conflicts, and placement corrections.
 */
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

  // Placement conflicts are tracked on unresolved markers because they never became safe emitted assertions.
  const placementConflicts = collectUnresolvedMarkerAssertions(suitePlan).filter(
    (marker) => marker.reason === 'boundary-placement-conflict'
  ).length

  return {
    canonicalRecoveries,
    placementConflicts,
    placementCorrections,
  }
}

/**
 * Logs canonical semantic-marker recovery events once per marker step.
 *
 * @param {JsSuitePlan | null} suitePlan - Supplies the suite plan whose recovered marker assertions should be reported; `null` produces no output.
 */
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

/**
 * Warns when marker assertions had to be moved between scenarios.
 *
 * @param {JsSuitePlan | null} suitePlan - Supplies the suite plan whose placement corrections should be reported; `null` produces no output.
 */
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

/**
 * Normalizes the most helpful hint text for an unresolved marker assertion.
 *
 * @param {UnresolvedSemanticMarkerAssertionResolution} marker - Supplies the unresolved marker whose proof text, target, query, or selector should be summarized.
 * @returns {string} A single-line hint string, or `'none'` when the marker has no usable evidence text.
 */
function normalizeUnresolvedMarkerHint(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const hint = marker.proofText ?? marker.target ?? marker.query?.raw ?? marker.selector?.selector
  const normalized = hint?.replace(/\s+/g, ' ').trim()
  return normalized && normalized.length > 0 ? normalized : 'none'
}

/**
 * Resolves the most specific source line available for an unresolved marker assertion.
 *
 * @param {UnresolvedSemanticMarkerAssertionResolution} marker - Supplies the unresolved marker whose explicit line or source-context line should be reported.
 * @returns {string} The source line number as a string, or `'unknown'` when no finite line is available.
 */
function formatUnresolvedMarkerLine(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const line = marker.line ?? marker.sourceContext.line
  return Number.isFinite(line) ? String(line) : 'unknown'
}

/**
 * Formats an unresolved semantic-marker warning for stderr output.
 *
 * @param {UnresolvedSemanticMarkerAssertionResolution} marker - Supplies the unresolved marker to describe.
 * @returns {string} A single-line `MKR-03` warning with line, reason, guidance, and hint text.
 */
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

/**
 * Collects unique unresolved semantic-marker assertions across all scenarios.
 *
 * Marker step IDs are deduplicated so the same unresolved marker is only surfaced once.
 *
 * @param {JsSuitePlan} suitePlan - Supplies the suite plan whose unresolved marker assertions should be flattened.
 * @returns {UnresolvedSemanticMarkerAssertionResolution[]} The deduplicated unresolved marker assertions.
 */
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

/**
 * Warns for every unresolved semantic marker in a suite plan.
 *
 * @param {JsSuitePlan | null} suitePlan - Supplies the suite plan to inspect; `null` produces no output.
 */
function emitUnresolvedMarkerWarnings(suitePlan: JsSuitePlan | null): void {
  if (!suitePlan) {
    return
  }

  const unresolvedMarkers = collectUnresolvedMarkerAssertions(suitePlan)
  for (const unresolvedMarker of unresolvedMarkers) {
    console.warn(pc.yellow(`[taro] ${formatUnresolvedMarkerWarning(unresolvedMarker)}`))
  }
}

/**
 * Warns when the generated test still requires manual review.
 *
 * @param {ScoreResult} scoreResult - Supplies the scoring result whose review requirement and blockers should be reported.
 */
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

/**
 * Emits targeted improvement hints for weak scoring dimensions.
 *
 * @param {ScoreResult} scoreResult - Supplies the scoring result that determines which hints should be shown.
 * @param {QueryResult[]} [queryResults=[]] - Supplies the generated query set so query-quality hints can mention test-id overuse.
 * @param {ReturnType<typeof analyzeBoundaryIsolation>} [boundaryIssues=analyzeBoundaryIsolation('')] - Supplies precomputed boundary issues; the empty-analysis default skips recomputation by callers that have none.
 */
function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = [],
  boundaryIssues = analyzeBoundaryIsolation('')
): void {
  if (scoreResult.dimensions.queryQuality < 60) {
    // Test-id heavy output usually means Taro could not recover accessible affordances from the recording or repo.
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

/**
 * Logs the cleanup operations applied during recording analysis.
 *
 * @param {AnalyzedRecording} analyzedRecording - Supplies the analyzed recording whose cleanup diagnostics should be summarized.
 */
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

/**
 * Counts emitted and unresolved marker assertions across planned scenarios.
 *
 * @param {JsSuitePlan['scenarios']} scenarios - Supplies the planned scenarios whose marker totals should be aggregated.
 * @returns {Pick<MarkerCoverageTotals, 'emitted' | 'unresolved'>} Aggregate emitted and unresolved marker counts.
 */
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

/**
 * Builds the marker-coverage totals that should feed generated-test scoring.
 *
 * When no suite plan exists, emitted markers stay at `0` and totals fall back to analysis diagnostics.
 *
 * @param {{ analyzedRecording: AnalyzedRecording, suitePlan: JsSuitePlan | null }} params - Supplies the analyzed recording and optional suite plan that produced marker assertions.
 * @returns {MarkerCoverageTotals} Detected, emitted, and unresolved semantic-marker totals.
 */
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
  // Use the higher total so scoring does not undercount markers when analysis and planning observed different subsets.
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

/**
 * Merges marker-related analysis back into the normalized recording steps.
 *
 * Steps without stable IDs are left untouched because they cannot be matched safely to analyzed state.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording that generation continues to use.
 * @param {AnalyzedRecording} analyzedRecording - Supplies the analyzed recording whose marker state and metadata should be merged back in.
 * @returns {NormalizedRecording} A copy of the recording with matched step metadata enriched from analysis.
 */
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
        // Marker fields are only copied when analysis produced them so we do not overwrite recorder data with `undefined`.
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

/**
 * Returns the analyzed intent groups or a single fallback group when none were inferred.
 *
 * @param {AnalyzedRecording} analyzedRecording - Supplies the analyzed recording whose intent groups should drive test grouping.
 * @param {string} fallbackTitle - Supplies the fallback group name when no intent groups are available.
 * @returns {ItGroup[]} The inferred intent groups, or one fallback group containing every analyzed step.
 */
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

/**
 * Converts a query descriptor into a scorer-friendly query result.
 *
 * @param {QueryDescriptor} descriptor - Supplies the learned or preserved query descriptor to normalize.
 * @returns {QueryResult} The normalized query result with query text, quality, method, and source line.
 */
function queryDescriptorToResult(descriptor: QueryDescriptor): QueryResult {
  return {
    query: descriptor.raw ?? descriptor.target ?? descriptor.method,
    quality: descriptor.quality ?? 'fragile',
    method: descriptor.method,
    line: descriptor.line,
  }
}

/**
 * Checks whether an unknown metadata value is a query descriptor.
 *
 * @param {unknown} value - Supplies the metadata value to narrow before reading query fields from it.
 * @returns {value is QueryDescriptor} `true` when the value is an object with a string `method` field.
 */
function isQueryDescriptor(value: unknown): value is QueryDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    typeof value.method === 'string'
  )
}

/**
 * Returns the preserved query descriptor attached to a normalized step, if present.
 *
 * @param {NormalizedStep} step - Supplies the step whose metadata may already contain a trusted query descriptor.
 * @returns {QueryDescriptor | undefined} The preserved query descriptor, or `undefined` when metadata does not contain one.
 */
function getStepQueryDescriptor(step: NormalizedStep): QueryDescriptor | undefined {
  const query = step.metadata?.query
  return isQueryDescriptor(query) ? query : undefined
}

/**
 * Groups baseline selector descriptors by the step they belong to.
 *
 * @param {SelectorDescriptor[]} selectors - Supplies the selector descriptors to group by `stepId`.
 * @returns {Map<StepId, SelectorDescriptor[]>} A map from step ID to the selectors recorded for that step.
 */
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

/**
 * Merges new selector-resolution warnings into an existing resolution without duplicating entries.
 *
 * @param {SelectorResolutionResult} resolution - Supplies the existing selector-resolution result.
 * @param {string[]} warnings - Supplies additional warnings gathered while trying alternate selectors.
 * @returns {SelectorResolutionResult} The original result when no warnings were added, otherwise a copy with merged warnings.
 */
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

/**
 * Applies a selector-resolution result to a normalized step's metadata.
 *
 * Resolved queries are copied into `metadata.query`; unresolved results only record the resolution details.
 *
 * @param {NormalizedStep} step - Supplies the step to enrich with selector-resolution metadata.
 * @param {SelectorResolutionResult} resolution - Supplies the resolution outcome to attach to the step.
 * @returns {NormalizedStep} A copy of the step with updated selector-resolution metadata.
 */
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

/**
 * Checks whether replaying a step can reveal more DOM state for later selector resolution.
 *
 * @param {NormalizedStep} step - Supplies the step that may advance the page into a more informative state.
 * @returns {boolean} `true` for interactions that can expose additional UI; otherwise `false`.
 */
function canSuccessfulReplayRevealAdditionalState(step: NormalizedStep): boolean {
  return (
    step.action === 'click' ||
    step.action === 'fill' ||
    step.action === 'select' ||
    step.action === 'navigate' ||
    step.action === 'keyDown'
  )
}

/**
 * Rebinds grouped steps to the latest step objects by step ID.
 *
 * @param {ItGroup[]} itGroups - Supplies the existing test groups whose step references should be refreshed.
 * @param {NormalizedStep[]} steps - Supplies the latest step objects keyed by their stable step IDs.
 * @returns {ItGroup[]} The groups with each step swapped for the latest matching step when available.
 */
function rehydrateItGroups(itGroups: ItGroup[], steps: NormalizedStep[]): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]))

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => (step.id ? stepMap.get(step.id) ?? step : step)),
  }))
}

/**
 * Rebinds every step reference inside a suite plan to the latest step objects.
 *
 * @param {JsSuitePlan} plan - Supplies the suite plan to refresh after selector resolution or analysis updates.
 * @param {NormalizedStep[]} steps - Supplies the latest step objects keyed by step ID.
 * @returns {JsSuitePlan} A copy of the plan with refreshed steps in groups, helpers, and scenarios.
 */
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

/**
 * Checks whether a step exists only to carry semantic-marker metadata.
 *
 * @param {NormalizedStep} step - Supplies the step to classify.
 * @returns {boolean} `true` when the step is linked to a semantic marker or unresolved semantic marker.
 */
function isSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker)
}

/**
 * Removes semantic-marker-only steps from generated `it()` groups.
 *
 * Empty groups are dropped after filtering.
 *
 * @param {ItGroup[]} itGroups - Supplies the grouped steps that will feed code generation.
 * @returns {ItGroup[]} The filtered groups with marker-only steps removed.
 */
function stripSemanticMarkerStepsFromItGroups(itGroups: ItGroup[]): ItGroup[] {
  return itGroups
    .map((group) => ({
      ...group,
      steps: group.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((group) => group.steps.length > 0)
}

/**
 * Removes semantic-marker-only steps from generated helper plans.
 *
 * Empty helpers are dropped after filtering.
 *
 * @param {JsSuitePlan['helpers']} helpers - Supplies the planned helpers to sanitize before code generation.
 * @returns {JsSuitePlan['helpers']} The filtered helper list with marker-only steps removed.
 */
function stripSemanticMarkerStepsFromHelpers(helpers: JsSuitePlan['helpers']): JsSuitePlan['helpers'] {
  return helpers
    .map((helper) => ({
      ...helper,
      steps: helper.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((helper) => helper.steps.length > 0)
}

/**
 * Removes semantic-marker-only steps from scenarios and prunes helper references that no longer exist.
 *
 * Scenarios are kept when they still contain steps, helper refs, or marker assertions.
 *
 * @param {JsSuitePlan['scenarios']} scenarios - Supplies the planned scenarios to sanitize before code generation.
 * @param {JsSuitePlan['helpers']} helpers - Supplies the filtered helper list used to validate remaining helper references.
 * @returns {JsSuitePlan['scenarios']} The filtered scenarios with stale helper references removed.
 */
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

/**
 * Deduplicates query results by method, query text, and line number.
 *
 * @param {QueryResult[]} queryResults - Supplies the query results to deduplicate before scoring or code generation.
 * @returns {QueryResult[]} The first occurrence of each unique query result.
 */
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

/**
 * Returns the first baseline selector recorded for a flow, if any.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose baseline selector list may seed visual capture.
 * @returns {string | undefined} The first selector string, or `undefined` when no baseline selectors were recorded.
 */
function getPrimarySelector(recording: NormalizedRecording): string | undefined {
  return recording.baseline?.selectors[0]?.selector
}

/**
 * Normalizes visible text candidates for page-landmark matching and filters out implementation-like values.
 *
 * URLs, DOM globals, selector fragments, and very short strings are rejected because they are poor visual landmarks.
 *
 * @param {string} [value] - Supplies the raw text candidate to normalize for landmark matching.
 * @returns {string | null} The normalized landmark text, or `null` when the value should be ignored.
 */
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

/**
 * Returns the asserted document title from a recording, if the flow captured one.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose title assertions should be inspected.
 * @returns {string | undefined} The asserted page title, or `undefined` when no title assertion exists.
 */
function findExpectedPageTitle(recording: NormalizedRecording): string | undefined {
  const titleAssertion = recording.steps.find(
    (step) => step.action === 'assert' && step.target === 'document.title' && typeof step.value === 'string'
  )
  return typeof titleAssertion?.value === 'string' ? titleAssertion.value : undefined
}

/**
 * Collects up to five visible-text landmarks that should confirm the captured page.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose baseline queries and key steps provide landmark text.
 * @returns {string[]} Unique landmark strings ordered by discovery and capped at five entries.
 */
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
    // Only interactions/assertions with user-visible targets are strong enough to validate the captured page.
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

/**
 * Converts an absolute path into the most useful project-relative path for state and log output.
 *
 * Known auth-file suffixes are preserved even when the file sits outside the project root so persisted auth settings stay portable.
 *
 * @param {string} projectRoot - Supplies the project root used to relativize the path.
 * @param {string} filePath - Supplies the file path to rewrite for state storage or logging.
 * @returns {string} A project-relative path, an auth-like suffix, or `.` when the input is the project root.
 */
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

/**
 * Resolves an optional CLI file argument to absolute and project-relative forms.
 *
 * Missing input bypasses resolution and returns `null`. Unreadable paths also return `null`
 * after warning so visual-auth features can continue without failing generation.
 *
 * @param {string} projectRoot - Supplies the project root used to derive the persisted relative path.
 * @param {string | undefined} inputPath - Supplies the optional CLI path; `undefined` bypasses all work.
 * @returns {Promise<{ absolutePath: string, relativePath: string } | null>} The resolved absolute and relative paths, or `null` when the file should be ignored.
 */
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

/**
 * Checks whether this command run can support interactive visual-auth recovery.
 *
 * A forced interactive flag bypasses stdio TTY detection.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles to inspect instead of the process globals.
 * @param {boolean} [forceInteractiveAuth=false] - Forces interactive auth support even when stdin or stdout is not a TTY.
 * @returns {boolean} `true` when interactive auth recovery is allowed for this run.
 */
function hasInteractiveVisualAuthCapability(
  context: GenerateCommandContext = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean((context.input ?? stdin).isTTY && (context.output ?? stdout).isTTY)
  )
}

/**
 * Resolves the storage-state path Taro should reuse or save for visual authentication.
 *
 * When the learned auth profile is not already a `storageState` profile, the default Taro auth path is returned.
 *
 * @param {string} projectRoot - Supplies the project root used to expand the relative storage-state path.
 * @param {TaroPlaywrightAuthProfile | null} auth - Supplies the current auth profile, or `null` to fall back to the default storage-state path.
 * @returns {{ absolutePath: string, relativePath: string }} The absolute and project-relative storage-state path pair.
 */
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

/**
 * Resolves the directory where visual-capture screenshots should be stored.
 *
 * @param {string} projectRoot - Supplies the project root that owns the `.taro/playwright/screenshots` directory.
 * @returns {string} The absolute screenshot artifact directory path.
 */
function resolveVisualCaptureScreenshotDir(projectRoot: string): string {
  return resolve(projectRoot, '.taro', 'playwright', 'screenshots')
}

/**
 * Maps a visual-capture result into a concise auth preflight status for logging.
 *
 * When the recording has no URL or no visual state, the status is unknown and this returns `null`.
 *
 * @param {{ auth: TaroPlaywrightAuthProfile | null, url?: string, visualState: VisualState | null }} params - Supplies the auth profile, target URL, and visual capture result to classify.
 * @returns {AuthPreflightStatus | null} The auth status label, or `null` when preflight status cannot be inferred.
 */
function resolveAuthPreflightStatus(params: {
  auth: TaroPlaywrightAuthProfile | null
  url?: string
  visualState: VisualState | null
}): AuthPreflightStatus | null {
  const { auth, url, visualState } = params
  if (!url || !visualState) {
    return null
  }

  // The auth summary is intentionally coarse because it drives operator guidance, not control flow.
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

/**
 * Logs the auth preflight status when visual capture produced a meaningful auth outcome.
 *
 * @param {{ auth: TaroPlaywrightAuthProfile | null, url?: string, visualState: VisualState | null }} params - Supplies the auth profile, target URL, and visual state to summarize.
 */
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

/**
 * Logs the learned Playwright auth profile that will be reused for visual capture.
 *
 * @param {ResolvedTaroPackageProfile | null} packageProfile - Supplies the resolved package profile whose `playwrightAuth` setting should be reported.
 */
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

/**
 * Logs each visual-state warning on its own warning line.
 *
 * @param {VisualState} visualState - Supplies the visual state whose warning messages should be emitted.
 */
function summarizeVisualStateWarnings(visualState: VisualState): void {
  for (const warning of visualState.warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`))
  }
}

/**
 * Logs the screenshot path for an auth checkpoint when one was captured.
 *
 * @param {VisualState} visualState - Supplies the visual state whose auth checkpoint screenshot should be reported.
 */
function summarizeAuthCheckpointScreenshot(visualState: VisualState): void {
  if (visualState.screenshotPath) {
    log(pc.dim('[taro]') + ` Auth checkpoint screenshot: ${visualState.screenshotPath}`)
  }
}

/**
 * Logs the screenshot path for a confirmed starting point when one was captured.
 *
 * @param {VisualState} visualState - Supplies the visual state whose starting-point screenshot should be reported.
 */
function summarizeStartingPointScreenshot(visualState: VisualState): void {
  if (visualState.screenshotPath) {
    log(pc.dim('[taro]') + ` Starting point screenshot: ${visualState.screenshotPath}`)
  }
}

/**
 * Logs the auth interruption details that explain why visual capture could not reach the target UI.
 *
 * @param {VisualState} visualState - Supplies the interrupted visual state to summarize.
 */
function summarizeAuthInterruptedVisualState(visualState: VisualState): void {
  const interrupt = visualState.interrupt
  console.warn(
    pc.yellow('[taro] Visual context unavailable: authentication required before reaching the target UI.')
  )

  if (interrupt) {
    // Show both the reached page and the expected page so the operator can repair the auth recipe quickly.
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

  summarizeAuthCheckpointScreenshot(visualState)
}

/**
 * Logs the details for a visual state recovered through Playwright authentication.
 *
 * @param {VisualState} visualState - Supplies the recovered visual state to summarize.
 */
function summarizeRecoveredVisualState(visualState: VisualState): void {
  // Successful recovery is worth logging in detail because it changes both confidence and future auth reuse.
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

  summarizeStartingPointScreenshot(visualState)
}

/**
 * Logs the details for a failed or timed-out Playwright auth recovery attempt.
 *
 * @param {VisualState} visualState - Supplies the failed recovery state to summarize.
 */
function summarizeFailedAuthRecoveryVisualState(visualState: VisualState): void {
  // Failed recovery still preserves partial evidence such as instructions and screenshots for manual follow-up.
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

  summarizeAuthCheckpointScreenshot(visualState)
  summarizeVisualStateWarnings(visualState)
}

/**
 * Logs the generic captured visual state summary for non-auth-special cases.
 *
 * @param {VisualState} visualState - Supplies the captured visual state to summarize.
 */
function summarizeCapturedVisualState(visualState: VisualState): void {
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
  if (visualState.startingPointConfirmed) {
    summarizeStartingPointScreenshot(visualState)
  }
  summarizeVisualStateWarnings(visualState)
}

/**
 * Logs the visual-capture outcome, including auth interruptions, recovery, and warnings.
 *
 * @param {VisualState | null} visualState - Supplies the visual state to summarize; `null` produces no output.
 */
function summarizeVisualState(visualState: VisualState | null): void {
  if (!visualState) {
    return
  }

  // Capture failures only have warning text, so keep the output limited to those actionable messages.
  if (visualState.status === 'capture-failed') {
    summarizeVisualStateWarnings(visualState)
    return
  }

  if (visualState.status === 'auth-interrupted') {
    summarizeAuthInterruptedVisualState(visualState)
    return
  }

  if (visualState.status === 'auth-recovered') {
    summarizeRecoveredVisualState(visualState)
    return
  }

  if (
    visualState.status === 'auth-recovery-failed' ||
    visualState.status === 'auth-recovery-timed-out'
  ) {
    summarizeFailedAuthRecoveryVisualState(visualState)
    return
  }

  summarizeCapturedVisualState(visualState)
}

/**
 * Logs the strongest mock-analysis findings and policy warnings.
 *
 * @param {MockAnalysis | null} mockAnalysis - Supplies the mock analysis to summarize; `null` produces no output.
 */
function summarizeMockAnalysis(mockAnalysis: MockAnalysis | null): void {
  if (!mockAnalysis) {
    return
  }

  const parts: string[] = []
  // The summary line only includes high-signal counts; detailed examples are logged separately below.
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

/**
 * Logs each suite-planning boundary warning as a separate warning line.
 *
 * @param {string[]} warnings - Supplies the boundary warnings to surface to the operator.
 */
function summarizeBoundaryWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] Boundary: ${warning}`))
  }
}

/**
 * Logs the primary suite contract and synthesized-scenario count.
 *
 * @param {JsSuitePlan} plan - Supplies the suite plan whose contract planner output should be summarized.
 */
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

/**
 * Logs the resolved package profile or warns when generation is using generic defaults.
 *
 * @param {ResolvedTaroPackageProfile | null} packageProfile - Supplies the resolved package profile, or `null` when no learned profile matched the output path.
 */
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

/**
 * Audits generated code for boundary-policy violations and missing learned support wiring.
 *
 * @param {string} code - Supplies the generated test code to inspect.
 * @param {ResolvedTaroPackageProfile | null} packageProfile - Supplies the resolved package profile whose forbid lists and boundary profiles should be enforced.
 * @param {string | null} renderTargetFile - Supplies the concrete render-target file to inspect for protected boundary imports; `null` skips source discovery.
 * @returns {Promise<string[]>} Human-readable boundary-policy warnings that should be surfaced or prepended to the generated file.
 */
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
  // Source-level import discovery extends learned policy with repo-owned guardrails found on the chosen render target.
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
    // Shared/scaffolded factories must be imported when their target is mocked, otherwise the generated test bypasses learned setup.
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

/**
 * Tokenizes free-form suite hints into lowercase alphanumeric search tokens.
 *
 * @param {string} value - Supplies the text to tokenize for render-target scoring.
 * @returns {string[]} Tokens with length three or greater.
 */
function tokenizeSuiteHint(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
}

/**
 * Scores how well a repo render-target candidate matches the current recording and suite plan.
 *
 * Recording text, page-confirmed terms, render-boundary shape, mock-analysis signals, and package ownership
 * all contribute to the final score.
 *
 * @param {RepoRenderTargetCandidate} candidate - Supplies the render-target candidate to rank.
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose title and steps define user-facing context.
 * @param {MockAnalysis | null} mockAnalysis - Supplies optional mock-analysis signals that can slightly boost likely matches.
 * @param {JsSuitePlan} suitePlan - Supplies the planned suite so render-boundary shape can influence scoring.
 * @param {{ packageProfile?: ResolvedTaroPackageProfile | null, visualState?: VisualState | null }} [options={}] - Supplies optional package-profile and live-page context that can boost likely matches.
 * @returns {number} A relative fit score where higher values indicate a stronger render-target candidate.
 */
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

/**
 * Selects the best repo render target from the available candidates.
 *
 * Candidates with non-positive scores are discarded, so this can return `null` even when candidates were provided.
 *
 * @param {{ candidates: RepoRenderTargetCandidate[], packageProfile?: ResolvedTaroPackageProfile | null, recording: NormalizedRecording, mockAnalysis: MockAnalysis | null, suitePlan: JsSuitePlan, visualState?: VisualState | null }} params - Supplies the candidates and the context needed to rank them.
 * @returns {RepoRenderTargetCandidate | null} The highest-ranked render target, or `null` when none earns a positive score.
 */
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

  // Drop zero-score candidates entirely so weak textual overlap does not silently pick an arbitrary component.
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

/**
 * Applies a resolved repo render target to a suite plan and clears placeholder warnings.
 *
 * @param {JsSuitePlan} suitePlan - Supplies the suite plan to update.
 * @param {RepoRenderTargetCandidate | null} renderTarget - Supplies the resolved render target, or `null` to leave the plan unchanged.
 * @returns {JsSuitePlan} The updated suite plan with a resolved render-boundary target and adjusted warnings.
 */
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

/**
 * Returns the recording URL from analyzed metadata or the first navigate step.
 *
 * @param {AnalyzedRecording} analyzedRecording - Supplies the analyzed recording whose canonical URL should be recovered.
 * @returns {string | undefined} The recording URL, or `undefined` when the flow contains no navigable URL evidence.
 */
function findRecordingUrl(analyzedRecording: AnalyzedRecording): string | undefined {
  return analyzedRecording.url ?? analyzedRecording.steps.find((step) => step.action === 'navigate')?.target
}

/**
 * Resolves baseline selectors into queries and rehydrates the recording state used for JS generation.
 *
 * When selector replay is possible, this replays the flow in a persistent browser so pre-step and post-step DOM
 * states can both contribute to selector recovery. Without a URL, it falls back to per-selector resolution.
 *
 * @param {NormalizedRecording} recording - Supplies the normalized recording whose baseline selectors may need Playwright resolution.
 * @param {ItGroup[]} itGroups - Supplies the grouped steps that should be rehydrated with any selector-resolution updates.
 * @param {{ auth?: CaptureVisualStateAuthOptions | null, debugReporter?: SelectorDebugReporter }} [options] - Supplies optional Playwright auth and debug-reporting hooks for selector replay.
 * @returns {Promise<{ itGroups: ItGroup[], queryResults: QueryResult[], recording: NormalizedRecording, warnings: string[] }>} The updated groups, deduplicated query results, refreshed recording, and unresolved-selector warnings.
 */
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
          // Preserve recorder-learned queries whenever possible; they are usually safer than re-deriving from live DOM heuristics.
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
          // Try selectors in recorder order and keep the first success, but retain all warnings from failed attempts.
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
          // Only synthesize new query results when the query actually came from replay-time resolution.
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
          // Recheck unresolved selectors after state-changing actions because dialogs and lazy UI often appear one step later.
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
        // Without a stable replay URL, each selector gets one fresh browser attempt and we keep the best available outcome.
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

/**
 * Logs each selector-resolution warning as a warning line.
 *
 * @param {string[]} warnings - Supplies the selector warnings to surface after JS generation resolution.
 */
function summarizeSelectorWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`))
  }
}

/**
 * Captures visual state for the recording URL when screenshots or page confirmation are available.
 *
 * The capture prefers recorder-derived visual candidates, then an explicit selector, and finally page-level context.
 * Missing URLs bypass capture entirely and return `null`.
 *
 * @param {{ analyzedRecording: AnalyzedRecording, auth?: TaroPlaywrightAuthProfile | null, authRecovery?: { enabled: boolean, instructionsPath?: string, persistedAuthPath?: string, saveStorageStatePath?: string, timeoutMs: number }, projectRoot: string, recording: NormalizedRecording, selector?: string, skipScreenshotArtifacts?: boolean, url?: string }} params - Supplies the analyzed recording, auth options, project paths, optional selector override, and the target URL.
 * @returns {Promise<VisualState | null>} The captured visual state, or `null` when capture is not possible for this run.
 */
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

  // Prefer recorder-derived visual checkpoints because they are tied to meaningful user-visible moments in the flow.
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
    // Fall back to the baseline selector when recorder intelligence could not isolate a clearer capture point.
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

/**
 * Persists a newly recovered Playwright storage-state profile when visual auth succeeded.
 *
 * When no package profile is available, the recovered profile is returned without being saved to Taro state.
 *
 * @param {{ packageProfile: ResolvedTaroPackageProfile | null, projectRoot: string, visualState: VisualState | null }} params - Supplies the active package profile, repo root, and visual state that may contain recovered auth.
 * @returns {Promise<TaroPlaywrightAuthProfile | null>} The recovered auth profile, or `null` when no new persisted auth was produced.
 */
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

  // Even when state persistence fails, return the recovered auth so the current run can still reuse it.
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

/**
 * Runs repo mock analysis and converts failures into a safe `null` result.
 *
 * @param {string} projectRoot - Supplies the repo root to analyze for mock conventions and policies.
 * @param {ResolvedTaroPackageProfile | null} packageProfile - Supplies the active package profile whose conventions should inform mock analysis.
 * @returns {Promise<MockAnalysis | null>} The mock analysis result, or `null` when analysis fails.
 */
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

/**
 * Verifies generated code and records the successful output in Taro state.
 *
 * Syntax verification failures terminate the process with exit code `2`. State refresh and history updates are best-effort
 * and do not fail generation once the file has been written successfully.
 *
 * @param {{ code: string, outputPath: string, projectRoot: string, recordingFile: string, scoreResult: ScoreResult, packageProfile: ResolvedTaroPackageProfile | null }} params - Supplies the generated code, output file, repo root, source recording file, score result, and active package profile.
 * @returns {Promise<void>} Resolves after verification and any best-effort state updates complete.
 * @throws {never} Exits the process when post-write syntax verification fails.
 */
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
  // Post-write syntax verification is a hard stop because emitting broken generated code is worse than failing the command.
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

/**
 * Creates the internal `__generate` CLI command for recorder-to-RTL generation.
 *
 * The command loads the recorder export, grounds it against repo state and optional visual evidence,
 * resolves selectors, generates the test file, updates Taro state, and exits through the findings envelope.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles used to detect whether interactive auth recovery is possible.
 * @returns {Command} The configured Commander command instance for internal JS generation.
 */
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

      // Fail fast before any repo analysis so the command never mutates state for a missing recording.
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
      // Explicit CLI auth always overrides learned profile auth so one-off recovery can be tested safely.
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
      // Run visual preflight before repo grounding so live route/landmark evidence can influence package and render-target selection.
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
          // Refresh stale learned state before generation so helper imports and boundary policy come from current repo reality.
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
      // Learned render targets and context-derived guesses are combined so repo evidence can fill gaps in state.
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

      // Repo render-target selection affects both the output location and the boundary support plan.
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
      // Boundary warnings are injected into the file so downstream reviewers see policy issues even outside CLI output.
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
          // Existing output is only replaced when the new generation is measurably better on coverage or quality.
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
        // Materialize shared boundary helpers before writing the test that imports them.
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
