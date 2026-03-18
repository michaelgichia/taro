import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import pc from 'picocolors'
import { type Browser, type BrowserContext, chromium,type Page } from 'playwright'

import {
  getUnsupportedSelectorReason,
  isDisplayValueQueryMethod,
  isLabelTextQueryMethod,
  isPlaceholderTextQueryMethod,
  isTestIdQueryMethod,
  isTextQueryMethod,
  toSingularAsyncQueryMethod
} from '#core/query-policy.ts'
import type {
  DialogState,
  ElementInfo,
  NormalizedAction,
  NormalizedStep,
  QueryDescriptor,
  QueryQuality,
  QueryResult,
  SelectorDescriptor,
  SelectorResolutionDebugInfo,
  SelectorResolutionInspectSource,
  SelectorResolutionPhase,
  SelectorResolutionResult,
  SemanticMarkerAssertion,
  SemanticMarkerAssertionProofKind,
  SemanticMarkerAssertionResolution,
  SemanticMarkerAssertionUnresolvedReason,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  StepId,
  UnresolvedSemanticMarker,
  VisualState,
} from '#types/recording.ts'
import type { TaroPlaywrightAuthStrategy } from '#types/state.ts'

/**
 * Maps HTML tag names to implied ARIA roles.
 * Used by deriveAccessibleQuery to determine accessible query method.
 */
const ROLE_MAP: Record<string, string> = {
  button: 'button',
  a: 'link',
  input: 'textbox',
  select: 'combobox',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
}

const GENERIC_FIELD_CONTEXT_PATTERN =
  /\b(details?|information|summary|review|section|panel|wrapper|container|layout|row|table|list|grid)\b/i

const FIELD_LABEL_HINT_PATTERN =
  /\b(name|email|phone|pin|quantity|amount|reference|description|notes?|comment|code|search|address|date|time|password|customer|type|number)\b/i
const AUTH_COPY_PATTERN =
  /\b(sign in|log in|continue with|single sign-on|sso|password|verification code|one-time code|two-factor|2fa|multi-factor|mfa|confirm it'?s you)\b/i

const PLAYWRIGHT_CAPTURE_FAILURE_PREFIX = 'Playwright visual capture failed.'
const PLAYWRIGHT_SELECTOR_INSPECTION_ERROR_PREFIX = 'Playwright selector inspection failed.'
const PLAYWRIGHT_AUTH_RECOVERY_POLL_MS = 1000
const PLAYWRIGHT_AUTH_RECOVERY_RETRY_LIMIT = 5
const PLAYWRIGHT_PAGE_CONFIRMATION_POLL_MS = 250
const PLAYWRIGHT_OPEN_RETRY_LIMIT = 3
const PLAYWRIGHT_OPEN_RETRY_DELAY_MS = 2000
const PLAYWRIGHT_STEP_REPLAY_TIMEOUT_MS = 5000

/**
 * Escapes single quotes in strings for use in generated query code.
 */
function escapeSingleQuote(str: string): string {
  return str.replace(/'/g, "\\'")
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function looksLikeCssSelector(target: string): boolean {
  const normalized = target.trim()
  if (!normalized) {
    return false
  }

  const descendantTagSelector = normalized.split(/\s+/)
  if (
    descendantTagSelector.length > 1 &&
    descendantTagSelector.every((segment) => /^[a-z][a-z0-9-]*$/.test(segment))
  ) {
    return true
  }

  return (
    /^[#.[]/.test(normalized) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>+~])/.test(normalized) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/.test(normalized) ||
    /^(css|xpath|text|id|data-testid|data-test-id|role)=/i.test(normalized)
  )
}

function resolveElementProbeLocator(
  page: Page,
  selector: string
): import('playwright').Locator {
  if (looksLikeCssSelector(selector)) {
    return page.locator(selector).first()
  }

  // Visual-state probes sometimes receive recorder target text such as
  // "Add Item". Treat those as visible-text checks instead of CSS.
  return page.getByText(selector, { exact: true }).first()
}

function isRetryablePlaywrightOpenError(error: unknown): boolean {
  const message = getErrorMessage(error)

  return (
    /Target page, context or browser has been closed/i.test(message) ||
    /Timeout \d+ms exceeded/i.test(message) ||
    /net::ERR_CONNECTION_REFUSED/i.test(message) ||
    /ERR_ABORTED/i.test(message)
  )
}

async function waitForRetryDelay(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

interface FoundSelectorInspectionResult {
  status: 'found'
  element: ElementInfo
}

interface MissingSelectorInspectionResult {
  status: 'selector-not-found'
}

interface FailedSelectorInspectionResult {
  status: 'inspection-failed'
  error: string
}

type SelectorInspectionResult =
  | FoundSelectorInspectionResult
  | MissingSelectorInspectionResult
  | FailedSelectorInspectionResult

interface ResolveSelectorOptions {
  debug?: {
    inspectSource?: SelectorResolutionInspectSource
    phase?: SelectorResolutionPhase
  }
  url?: string
  preservedQuery?: QueryDescriptor
  timeoutMs?: number
  inspect?: (
    url: string,
    cssSelector: string,
    timeoutMs?: number
  ) => Promise<SelectorInspectionResult>
}

async function readElementInfo(page: Page, selector: string): Promise<ElementInfo> {
  const locator = resolveElementProbeLocator(page, selector)
  const elementInfo = await locator.evaluate((el: Element) => {
    const htmlEl = el as HTMLElement
    type LabelableElement =
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLMeterElement
      | HTMLOutputElement
      | HTMLProgressElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    const normalizeText = (value?: string | null) => {
      const normalized = value?.replace(/\s+/g, ' ').trim()
      return normalized ? normalized : null
    }
    const labelableEl: LabelableElement | null =
      el instanceof HTMLButtonElement ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLMeterElement ||
      el instanceof HTMLOutputElement ||
      el instanceof HTMLProgressElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
        ? el
        : null
    const associatedLabelText =
      labelableEl?.labels
        ? Array.from(labelableEl.labels)
            .map((label) => normalizeText(label.textContent))
            .filter((value): value is string => Boolean(value))
            .join(' ')
        : null
    const ariaLabelledByText = normalizeText(
      el
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => normalizeText(document.getElementById(id)?.textContent))
        .filter((value): value is string => Boolean(value))
        .join(' ')
    )
    const labelText = normalizeText(associatedLabelText) ?? ariaLabelledByText
    const altText = normalizeText((el as HTMLImageElement).alt)
    const title = normalizeText(el.getAttribute('title'))
    const testId = normalizeText(
      el.getAttribute('data-testid') ?? el.getAttribute('data-test-id')
    )

    return {
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute('role') ?? null,
      ariaLabel: el.getAttribute('aria-label') ?? null,
      ariaLabelledBy: el.getAttribute('aria-labelledby') ?? null,
      labelText,
      innerText: htmlEl.innerText ?? '',
      altText,
      title,
      testId,
      value: (htmlEl as HTMLInputElement).value ?? undefined,
      type: (htmlEl as HTMLInputElement).type ?? undefined,
      placeholder: (htmlEl as HTMLInputElement).placeholder ?? null,
      isPresent: true,
    }
  })

  return elementInfo as ElementInfo
}

function getAccessibleName(info: ElementInfo): string | null {
  const accessibleName =
    info.ariaLabel ??
    info.labelText ??
    info.innerText ??
    info.altText ??
    info.title
  const normalizedName = accessibleName?.trim()

  return normalizedName ? normalizedName : null
}

function toQueryDescriptor(
  selector: SelectorDescriptor,
  query: QueryResult
): QueryDescriptor {
  return {
    stepId: selector.stepId,
    method: query.method,
    queryRoot: 'screen',
    line: selector.line,
    target: selector.selector,
    quality: query.quality,
    raw: query.query,
  }
}

function toUnresolvedSelectorResult(
  selector: SelectorDescriptor,
  outcome: Extract<
    SelectorResolutionResult,
    { status: 'unresolved' }
  >['outcome'],
  reason: string,
  options: {
    inspectSource?: SelectorResolutionInspectSource
    inspectionError?: string
    pageUrl?: string
    phase?: SelectorResolutionPhase
  } = {}
): SelectorResolutionResult {
  return {
    debug: buildSelectorResolutionDebugInfo(selector, {
      inspectSource: options.inspectSource ?? 'fresh-browser',
      inspectionError: options.inspectionError,
      pageUrl: options.pageUrl,
      phase: options.phase,
      reason,
      result: 'unresolved',
    }),
    status: 'unresolved',
    outcome,
    stepId: selector.stepId,
    selector,
    url: options.pageUrl,
    reason,
    inspectionError: options.inspectionError,
    warnings: [reason],
  }
}

function sanitizeCaptureSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'capture'
}

function formatQueryDescriptorForDebug(query: {
  method: string
  target?: string
  role?: string
  name?: string
}): string {
  if (query.method === 'getByRole' && query.role) {
    const parts = [`'${query.role}'`]
    if (query.name) {
      parts.push(`{ name: '${escapeSingleQuote(query.name)}' }`)
    }
    return `${query.method}(${parts.join(', ')})`
  }

  if (query.target) {
    return `${query.method}('${escapeSingleQuote(query.target)}')`
  }

  return `${query.method}()`
}

function buildSelectorResolutionDebugInfo(
  selector: SelectorDescriptor,
  options: {
    inspectSource: SelectorResolutionInspectSource
    inspectionError?: string
    pageUrl?: string
    phase?: SelectorResolutionPhase
    reason?: string
    result: SelectorResolutionResult['status']
    derivedQuery?: string
  }
): SelectorResolutionDebugInfo {
  return {
    cssSelector: selector.selector,
    derivedQuery: options.derivedQuery,
    inspectSource: options.inspectSource,
    inspectionError: options.inspectionError,
    pageUrl: options.pageUrl,
    phase: options.phase,
    reason: options.reason,
    result: options.result,
  }
}

function getSemanticMarkerCandidate(
  step: NormalizedStep
): SemanticMarkerCandidate | undefined {
  const metadataCandidate = step.metadata?.semanticMarkerCandidate

  if (
    metadataCandidate &&
    typeof metadataCandidate === 'object' &&
    'stepId' in metadataCandidate &&
    typeof metadataCandidate.stepId === 'string'
  ) {
    return metadataCandidate as SemanticMarkerCandidate
  }

  return step.semanticMarkerCandidate
}

function getSemanticMarkerLink(step: NormalizedStep): SemanticMarkerLink | undefined {
  const metadataLink = step.metadata?.semanticMarkerLink

  if (
    metadataLink &&
    typeof metadataLink === 'object' &&
    'markerStepId' in metadataLink &&
    typeof metadataLink.markerStepId === 'string'
  ) {
    return metadataLink as SemanticMarkerLink
  }

  return step.semanticMarkerLink
}

function getUnresolvedSemanticMarker(
  step: NormalizedStep
): UnresolvedSemanticMarker | undefined {
  const metadataMarker = step.metadata?.unresolvedSemanticMarker

  if (
    metadataMarker &&
    typeof metadataMarker === 'object' &&
    'stepId' in metadataMarker &&
    typeof metadataMarker.stepId === 'string'
  ) {
    return metadataMarker as UnresolvedSemanticMarker
  }

  return step.unresolvedSemanticMarker
}

function normalizeProofText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

function isIconOnlyText(value?: string): boolean {
  const normalized = normalizeProofText(value)
  if (!normalized) {
    return false
  }

  return normalized.length <= 2 && !/[a-z0-9]/i.test(normalized)
}

function getQueryScope(query: QueryDescriptor): string {
  if (query.raw) {
    const match = query.raw.match(/^(.*)\.(?:get|find|query)(?:All)?By[A-Za-z]+\(.+\)$/)
    if (match?.[1]) {
      return match[1]
    }
  }

  return 'screen'
}

function buildScopedQueryExpression(
  query: QueryDescriptor,
  method: string,
  options: {
    role?: string
    target?: string
    name?: string
  }
): string {
  const scope = getQueryScope(query)

  if (method === 'findByRole' && options.role && options.name) {
    return `${scope}.${method}('${escapeSingleQuote(options.role)}', { name: '${escapeSingleQuote(options.name)}' })`
  }

  return `${scope}.${method}('${escapeSingleQuote(options.target ?? '')}')`
}

function buildAsyncQueryDescriptor(
  query: QueryDescriptor,
  options: {
    method: string
    role?: string
    target?: string
    name?: string
  }
): QueryDescriptor {
  const raw = buildScopedQueryExpression(query, options.method, options)

  return {
    ...query,
    method: options.method,
    role: options.role ?? query.role,
    target: options.target ?? query.target,
    name: options.name ?? query.name,
    raw,
  }
}

function buildAssertion(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  query: QueryDescriptor,
  proofKind: SemanticMarkerAssertionProofKind
): SemanticMarkerAssertion | undefined {
  const semanticMarkerLink = getSemanticMarkerLink(step)
  const anchor = semanticMarkerLink ?? candidate.anchor

  if (!anchor?.anchorStepId || !anchor.relation || !query.raw) {
    return undefined
  }

  return {
    markerStepId: step.id ?? candidate.stepId,
    anchorStepId: anchor.anchorStepId,
    relation: anchor.relation,
    proofKind,
    proofSubject: candidate.proofSubject,
    target: candidate.target ?? step.target,
    proofText: candidate.proofText,
    line: candidate.line ?? step.line,
    query,
    queryExpression: query.raw,
    expectation: 'visibility',
    matcher: 'toBeVisible',
    sourceContext: candidate.sourceContext,
  }
}

function toUnresolvedAssertion(
  step: NormalizedStep,
  reason: SemanticMarkerAssertionUnresolvedReason,
  candidate?: SemanticMarkerCandidate,
  unresolvedMarker?: UnresolvedSemanticMarker
): SemanticMarkerAssertionResolution {
  const source = candidate ?? unresolvedMarker
  const anchor = source?.anchor

  return {
    status: 'unresolved',
    markerStepId: step.id ?? source?.stepId ?? 'unknown-step',
    anchorStepId: anchor?.anchorStepId,
    relation: anchor?.relation,
    reason,
    proofSubject: source?.proofSubject ?? 'unknown',
    target: source?.target ?? step.target,
    proofText: source?.proofText,
    line: source?.line ?? step.line,
    sourceContext: source?.sourceContext ?? {
      line: step.line,
      originalType: step.originalType,
    },
    query: source?.query,
    selector: source?.selector,
  }
}

function resolveRoleNameAssertion(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  query: QueryDescriptor
): SemanticMarkerAssertionResolution | undefined {
  const accessibleName = normalizeProofText(query.name ?? query.target ?? candidate.proofText)
  if (!query.role || !accessibleName || isIconOnlyText(accessibleName)) {
    return undefined
  }

  const asyncQuery = buildAsyncQueryDescriptor(query, {
    method: 'findByRole',
    role: query.role,
    target: accessibleName,
    name: accessibleName,
  })

  const assertion = buildAssertion(step, candidate, asyncQuery, 'role-name')
  return assertion
    ? {
        status: 'resolved',
        markerStepId: assertion.markerStepId,
        anchorStepId: assertion.anchorStepId,
        assertion,
      }
    : undefined
}

function resolveVisibleTextAssertion(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  query: QueryDescriptor
): SemanticMarkerAssertionResolution | undefined {
  const proofText = normalizeProofText(candidate.proofText ?? query.target ?? candidate.target)
  if (!proofText || isIconOnlyText(proofText)) {
    return undefined
  }

  const asyncQuery = buildAsyncQueryDescriptor(query, {
    method: 'findByText',
    target: proofText,
  })

  const assertion = buildAssertion(step, candidate, asyncQuery, 'visible-text')
  return assertion
    ? {
        status: 'resolved',
        markerStepId: assertion.markerStepId,
        anchorStepId: assertion.anchorStepId,
        assertion,
      }
    : undefined
}

function resolveVisibleValueAssertion(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  query: QueryDescriptor
): SemanticMarkerAssertionResolution | undefined {
  const proofText = normalizeProofText(candidate.proofText ?? query.target ?? candidate.target)
  if (!proofText || isIconOnlyText(proofText)) {
    return undefined
  }

  const nextMethod = isDisplayValueQueryMethod(query.method)
    ? 'findByDisplayValue'
    : 'findByText'
  const asyncQuery = buildAsyncQueryDescriptor(query, {
    method: nextMethod,
    target: proofText,
  })

  const assertion = buildAssertion(step, candidate, asyncQuery, 'visible-value')
  return assertion
    ? {
        status: 'resolved',
        markerStepId: assertion.markerStepId,
        anchorStepId: assertion.anchorStepId,
        assertion,
      }
    : undefined
}

function resolveFieldContextAssertion(
  step: NormalizedStep,
  candidate: SemanticMarkerCandidate,
  query: QueryDescriptor
): SemanticMarkerAssertionResolution {
  const proofText = normalizeProofText(candidate.proofText ?? query.target ?? candidate.target)
  if (!proofText) {
    return toUnresolvedAssertion(step, 'missing-query', candidate)
  }

  if (GENERIC_FIELD_CONTEXT_PATTERN.test(proofText)) {
    return toUnresolvedAssertion(step, 'generic-container', candidate)
  }

  if (/[/,]/.test(proofText)) {
    return toUnresolvedAssertion(step, 'ambiguous-field-context', candidate)
  }

  if (isLabelTextQueryMethod(query.method)) {
    const asyncQuery = buildAsyncQueryDescriptor(query, {
      method: 'findByLabelText',
      target: proofText,
    })
    const assertion =
      asyncQuery && buildAssertion(step, candidate, asyncQuery, 'label-text')

    return assertion
      ? {
          status: 'resolved',
          markerStepId: assertion.markerStepId,
          anchorStepId: assertion.anchorStepId,
          assertion,
        }
      : toUnresolvedAssertion(step, 'unsupported-field-context', candidate)
  }

  if (isPlaceholderTextQueryMethod(query.method)) {
    const asyncQuery = buildAsyncQueryDescriptor(query, {
      method: 'findByPlaceholderText',
      target: proofText,
    })
    const assertion =
      asyncQuery && buildAssertion(step, candidate, asyncQuery, 'placeholder-text')

    return assertion
      ? {
          status: 'resolved',
          markerStepId: assertion.markerStepId,
          anchorStepId: assertion.anchorStepId,
          assertion,
        }
      : toUnresolvedAssertion(step, 'unsupported-field-context', candidate)
  }

  if (isTextQueryMethod(query.method) && FIELD_LABEL_HINT_PATTERN.test(proofText)) {
    const asyncQuery = buildAsyncQueryDescriptor(query, {
      method: 'findByLabelText',
      target: proofText,
    })
    const assertion =
      asyncQuery && buildAssertion(step, candidate, asyncQuery, 'label-text')

    return assertion
      ? {
          status: 'resolved',
          markerStepId: assertion.markerStepId,
          anchorStepId: assertion.anchorStepId,
          assertion,
        }
      : toUnresolvedAssertion(step, 'unsupported-field-context', candidate)
  }

  if (isTextQueryMethod(query.method)) {
    return toUnresolvedAssertion(step, 'ambiguous-field-context', candidate)
  }

  return toUnresolvedAssertion(step, 'unsupported-field-context', candidate)
}

export function resolveSemanticMarkerAssertion(
  step: NormalizedStep
): SemanticMarkerAssertionResolution {
  const candidate = getSemanticMarkerCandidate(step)
  const unresolvedMarker = getUnresolvedSemanticMarker(step)

  if (!candidate) {
    return toUnresolvedAssertion(step, 'missing-marker-candidate', undefined, unresolvedMarker)
  }

  const anchorStepId =
    getSemanticMarkerLink(step)?.anchorStepId ??
    unresolvedMarker?.anchor?.anchorStepId ??
    candidate.anchor?.anchorStepId

  if (!anchorStepId) {
    return toUnresolvedAssertion(step, 'missing-anchor', candidate, unresolvedMarker)
  }

  if (unresolvedMarker?.reason === 'ambiguous-field-context') {
    return toUnresolvedAssertion(step, 'ambiguous-field-context', candidate, unresolvedMarker)
  }

  if (candidate.proofSubject === 'selector-target') {
    return toUnresolvedAssertion(step, 'css-only-evidence', candidate, unresolvedMarker)
  }

  if (candidate.proofSubject === 'unknown') {
    return toUnresolvedAssertion(step, 'unsupported-proof-subject', candidate, unresolvedMarker)
  }

  if (!candidate.query) {
    return toUnresolvedAssertion(step, 'missing-query', candidate, unresolvedMarker)
  }

  if (
    candidate.query.queryRoot === 'document' ||
    isTestIdQueryMethod(candidate.query.method) ||
    /data-testid|querySelector|nth-(?:of-type|child)|css-[\w-]+/i.test(
      candidate.query.raw ?? ''
    )
  ) {
    return toUnresolvedAssertion(step, 'hidden-evidence', candidate, unresolvedMarker)
  }

  if (isIconOnlyText(candidate.proofText ?? candidate.query.target ?? candidate.target)) {
    return toUnresolvedAssertion(step, 'icon-only-target', candidate, unresolvedMarker)
  }

  const roleNameResolution = resolveRoleNameAssertion(step, candidate, candidate.query)
  if (roleNameResolution) {
    return roleNameResolution
  }

  if (candidate.proofSubject === 'concrete-value') {
    return (
      resolveVisibleValueAssertion(step, candidate, candidate.query) ??
      toUnresolvedAssertion(step, 'missing-query', candidate, unresolvedMarker)
    )
  }

  if (
    candidate.proofSubject === 'visible-message' ||
    candidate.proofSubject === 'heading'
  ) {
    return (
      resolveVisibleTextAssertion(step, candidate, candidate.query) ??
      toUnresolvedAssertion(step, 'missing-query', candidate, unresolvedMarker)
    )
  }

  if (candidate.proofSubject === 'field-label') {
    return resolveFieldContextAssertion(step, candidate, candidate.query)
  }

  const asyncMethod = toSingularAsyncQueryMethod(candidate.query.method)
  return asyncMethod
    ? toUnresolvedAssertion(step, 'unsupported-proof-subject', candidate, unresolvedMarker)
    : toUnresolvedAssertion(step, 'missing-query', candidate, unresolvedMarker)
}

export async function extractDialogState(page: Page): Promise<DialogState | null> {
  try {
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
      if (!dialog) {
        return null
      }

      const titleNode = dialog.querySelector('h1, h2, h3, [aria-labelledby]')
      const descriptionNode = dialog.querySelector('[aria-describedby], p')
      const actionNodes = Array.from(
        dialog.querySelectorAll('button, [role="button"]')
      ) as HTMLElement[]

      return {
        role:
          (dialog.getAttribute('role') as 'dialog' | 'alertdialog' | null) ?? null,
        title: titleNode?.textContent?.trim() ?? null,
        description: descriptionNode?.textContent?.trim() ?? null,
        actions: actionNodes
          .map((node) => node.innerText?.trim())
          .filter((text): text is string => Boolean(text)),
        isOpen: true,
      }
    })

    return state as DialogState | null
  } catch {
    return null
  }
}

function normalizeComparableText(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
}

export function urlsMateriallyDiffer(expectedUrl?: string, actualUrl?: string): boolean {
  if (!expectedUrl || !actualUrl) {
    return false
  }

  try {
    const expected = new URL(expectedUrl)
    const actual = new URL(actualUrl)
    const expectedValue = `${expected.pathname.replace(/\/+$/, '') || '/'}${expected.search}`.toLowerCase()
    const actualValue = `${actual.pathname.replace(/\/+$/, '') || '/'}${actual.search}`.toLowerCase()
    return expectedValue !== actualValue
  } catch {
    return normalizeComparableText(expectedUrl) !== normalizeComparableText(actualUrl)
  }
}

function titlesMateriallyDiffer(expectedTitle?: string, actualTitle?: string): boolean {
  if (!expectedTitle || !actualTitle) {
    return false
  }

  const expected = normalizeComparableText(expectedTitle)
  const actual = normalizeComparableText(actualTitle)
  if (!expected || !actual) {
    return false
  }

  return !actual.includes(expected) && !expected.includes(actual)
}

async function readOptionalElementInfo(
  page: Page,
  selector?: string
): Promise<ElementInfo | null> {
  if (!selector) {
    return null
  }

  try {
    return await readElementInfo(page, selector)
  } catch {
    return null
  }
}

interface AuthCheckpointDetection {
  authSignals: string[]
  interrupt: boolean
  matchedLandmarks: string[]
  missingExpectedSelector: boolean
  missingLandmarks: string[]
  pageTitleMismatch: boolean
  routeMismatch: boolean
  reachedUrl: string
}

async function detectAuthCheckpoint(
  page: Page,
  options: {
    actualTitle: string
    allowManualInterrupt?: boolean
    element: ElementInfo | null
    expectedLandmarks?: string[]
    expectedTitle?: string
    expectedUrl?: string
    selector?: string
  }
): Promise<AuthCheckpointDetection> {
  const reachedUrl = page.url()
  const expectedLandmarks = options.expectedLandmarks ?? []
  const bodyAnalysis = await page
    .locator('body')
    .first()
    .evaluate((body: Element, landmarks: string[]) => {
      const root = body as HTMLElement
      const normalizedText = root.innerText.replace(/\s+/g, ' ').trim().toLowerCase()
      const buttons = Array.from(root.querySelectorAll('button, [role="button"], a'))
        .map((node) => (node as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().toLowerCase())
        .filter((value): value is string => Boolean(value))
      const headings = Array.from(root.querySelectorAll('h1, h2, h3, [role="heading"]'))
        .map((node) => (node as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().toLowerCase())
        .filter((value): value is string => Boolean(value))
      const matchedLandmarks = landmarks.filter((landmark) =>
        normalizedText.includes(landmark.toLowerCase())
      )
      const authSignals: string[] = []

      if (root.querySelector('input[type="password"], input[autocomplete="current-password"]')) {
        authSignals.push('password-input')
      }
      if (
        root.querySelector(
          'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="verification" i]'
        )
      ) {
        authSignals.push('verification-input')
      }
      if (root.querySelector('form[action*="login" i], form[action*="auth" i], form[action*="sso" i]')) {
        authSignals.push('auth-form')
      }
      const combinedCopy = [...buttons, ...headings, normalizedText].join(' ')
      if (/\b(sign in|log in|continue with|single sign-on|sso|password|verification code|2fa|mfa|checkpoint|challenge)\b/i.test(combinedCopy)) {
        authSignals.push('auth-copy')
      }

      return {
        authSignals,
        matchedLandmarks,
      }
    }, expectedLandmarks)
    .catch(() => ({
      authSignals: [] as string[],
      matchedLandmarks: [] as string[],
    }))

  const authSignals = new Set<string>(bodyAnalysis.authSignals)
  if (AUTH_COPY_PATTERN.test(options.actualTitle)) {
    authSignals.add('auth-title')
  }

  const routeMismatch = urlsMateriallyDiffer(options.expectedUrl, reachedUrl)
  const pageTitleMismatch = titlesMateriallyDiffer(options.expectedTitle, options.actualTitle)
  const missingExpectedSelector = Boolean(options.selector) && options.element === null
  const missingLandmarks = expectedLandmarks.filter(
    (landmark) => !bodyAnalysis.matchedLandmarks.includes(landmark)
  )
  const missingExpectedLandmarks =
    expectedLandmarks.length > 0 && bodyAnalysis.matchedLandmarks.length === 0
  const unresolvedPageMismatch =
    routeMismatch && (pageTitleMismatch || missingExpectedSelector || missingExpectedLandmarks)
  const interrupt =
    (authSignals.size > 0 ||
      ((options.allowManualInterrupt ?? false) && unresolvedPageMismatch)) &&
    (routeMismatch || pageTitleMismatch || missingExpectedSelector || missingExpectedLandmarks)

  return {
    authSignals: [...authSignals],
    interrupt,
    matchedLandmarks: bodyAnalysis.matchedLandmarks,
    missingExpectedSelector,
    missingLandmarks,
    pageTitleMismatch,
    routeMismatch,
    reachedUrl,
  }
}

async function capturePageScreenshot(
  page: Page,
  screenshotDir: string | undefined,
  nameHint: string
): Promise<string | undefined> {
  if (!screenshotDir) {
    return undefined
  }

  await mkdir(screenshotDir, { recursive: true })
  const screenshotPath = `${screenshotDir}/${sanitizeCaptureSegment(nameHint)}.png`
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

interface VisualPageSnapshot {
  authCheckpoint: AuthCheckpointDetection
  dialog: DialogState | null
  element: ElementInfo | null
  pageTitle: string
}

export interface CaptureVisualStateAuthOptions {
  path: string
  strategy: TaroPlaywrightAuthStrategy
}

interface CaptureVisualStateExpectations {
  landmarks?: string[]
  title?: string
  url?: string
}

interface CaptureVisualStateRecoveryOptions {
  enabled: boolean
  instructionsPath?: string
  persistedAuthPath?: string
  saveStorageStatePath?: string
  timeoutMs: number
}

interface CaptureVisualStateOptions {
  auth?: CaptureVisualStateAuthOptions | null
  authRecovery?: CaptureVisualStateRecoveryOptions
  expected?: CaptureVisualStateExpectations
  reason: string
  screenshotDir?: string
  selector?: string
  timeoutMs?: number
}

async function openCaptureContext(
  browser: Browser,
  auth?: CaptureVisualStateAuthOptions | null
): Promise<BrowserContext> {
  if (auth?.strategy === 'storageState') {
    return browser.newContext({ storageState: auth.path })
  }

  return browser.newContext()
}

export async function openCapturePage(params: {
  auth?: CaptureVisualStateAuthOptions | null
  headless: boolean
  timeoutMs: number
  url: string
}): Promise<{
  browser: Browser
  context: BrowserContext
  page: Page
}> {
  const { auth, headless, timeoutMs, url } = params
  let lastError: unknown

  for (let attempt = 1; attempt <= PLAYWRIGHT_OPEN_RETRY_LIMIT; attempt += 1) {
    let browser: Browser | null = null

    try {
      browser = await chromium.launch({ headless })
      const context = await openCaptureContext(browser, auth)
      const page = await context.newPage()

      await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })

      return { browser, context, page }
    } catch (error) {
      lastError = error
      if (browser) {
        await browser.close().catch(() => undefined)
      }

      if (
        attempt === PLAYWRIGHT_OPEN_RETRY_LIMIT ||
        !isRetryablePlaywrightOpenError(error)
      ) {
        throw error
      }

      await waitForRetryDelay(PLAYWRIGHT_OPEN_RETRY_DELAY_MS)
    }
  }

  throw lastError
}

async function inspectVisualPage(
  page: Page,
  options: {
    allowManualInterrupt?: boolean
    expected?: CaptureVisualStateExpectations
    selector?: string
  }
): Promise<VisualPageSnapshot> {
  const pageTitle = await page.title()
  const element = await readOptionalElementInfo(page, options.selector)
  const authCheckpoint = await detectAuthCheckpoint(page, {
    actualTitle: pageTitle,
    allowManualInterrupt: options.allowManualInterrupt,
    element,
    expectedLandmarks: options.expected?.landmarks,
    expectedTitle: options.expected?.title,
    expectedUrl: options.expected?.url,
    selector: options.selector,
  })
  const dialog = await extractDialogState(page)

  return {
    authCheckpoint,
    dialog,
    element,
    pageTitle,
  }
}

function buildAuthInterruptSignals(params: {
  authCheckpoint: AuthCheckpointDetection
  expected?: CaptureVisualStateExpectations
  selector?: string
}): string[] {
  const { authCheckpoint, expected, selector } = params
  const signals = [...authCheckpoint.authSignals]

  if (authCheckpoint.routeMismatch) {
    signals.push('route-mismatch')
  }
  if (authCheckpoint.pageTitleMismatch) {
    signals.push('title-mismatch')
  }
  if (authCheckpoint.missingExpectedSelector && selector) {
    signals.push('expected-selector-missing')
  }
  if (expected?.landmarks?.length && authCheckpoint.missingLandmarks.length > 0) {
    signals.push('expected-landmarks-missing')
  }

  return signals
}

function toAuthInterruptedVisualState(params: {
  auth?: CaptureVisualStateAuthOptions | null
  expected?: CaptureVisualStateExpectations
  reason: string
  screenshotPath?: string
  selector?: string
  snapshot: VisualPageSnapshot
  url: string
}): VisualState {
  const { auth, expected, reason, screenshotPath, selector, snapshot, url } = params

  return {
    capturedAt: new Date().toISOString(),
    dialog: snapshot.dialog,
    element: snapshot.element,
    finalUrl: snapshot.authCheckpoint.reachedUrl,
    interrupt: {
      kind: 'auth-required',
      actualTitle: snapshot.pageTitle,
      expectedTitle: expected?.title,
      expectedUrl: expected?.url,
      path: auth?.path,
      reachedUrl: snapshot.authCheckpoint.reachedUrl,
      signals: buildAuthInterruptSignals({
        authCheckpoint: snapshot.authCheckpoint,
        expected,
        selector,
      }),
      strategy: auth?.strategy,
    },
    matchedLandmarks: snapshot.authCheckpoint.matchedLandmarks,
    pageTitle: snapshot.pageTitle,
    reason,
    screenshotPath,
    selector,
    startingPointConfirmed: false,
    status: 'auth-interrupted',
    url,
    warnings: [
      `Authentication required before visual capture could reach ${expected?.url ?? url}.`,
    ],
  }
}

function toCapturedVisualState(params: {
  reason: string
  screenshotPath?: string
  selector?: string
  snapshot: VisualPageSnapshot
  startingPointConfirmed?: boolean
  url: string
  warnings?: string[]
}): VisualState {
  const {
    reason,
    screenshotPath,
    selector,
    snapshot,
    startingPointConfirmed,
    url,
    warnings = [],
  } = params

  return {
    capturedAt: new Date().toISOString(),
    dialog: snapshot.dialog,
    element: snapshot.element,
    finalUrl: snapshot.authCheckpoint.reachedUrl,
    matchedLandmarks: snapshot.authCheckpoint.matchedLandmarks,
    pageTitle: snapshot.pageTitle,
    reason,
    screenshotPath,
    selector,
    startingPointConfirmed,
    status: 'captured',
    url,
    warnings,
  }
}

function toCaptureFailedVisualState(params: {
  reason: string
  selector?: string
  url: string
  error: unknown
}): VisualState {
  const { reason, selector, url, error } = params
  const message = `${PLAYWRIGHT_CAPTURE_FAILURE_PREFIX} ${getErrorMessage(error)}`

  return {
    capturedAt: new Date().toISOString(),
    dialog: null,
    element: null,
    finalUrl: url,
    matchedLandmarks: [],
    pageTitle: '',
    reason,
    selector,
    status: 'capture-failed',
    url,
    warnings: [message],
  }
}

function isStartingPointConfirmed(params: {
  expected?: CaptureVisualStateExpectations
  selector?: string
  snapshot: VisualPageSnapshot
}): boolean {
  const { expected, selector, snapshot } = params
  if (snapshot.authCheckpoint.interrupt) {
    return false
  }
  if (snapshot.authCheckpoint.routeMismatch || snapshot.authCheckpoint.pageTitleMismatch) {
    return false
  }

  const landmarkSatisfied =
    (expected?.landmarks?.length ?? 0) === 0
      ? true
      : snapshot.authCheckpoint.matchedLandmarks.length > 0
  const selectorSatisfied = selector ? snapshot.element !== null : true

  return selectorSatisfied && landmarkSatisfied
}

function shouldRetryExpectedUrlDuringAuthRecovery(params: {
  expected?: CaptureVisualStateExpectations
  snapshot: VisualPageSnapshot
}): boolean {
  const { expected, snapshot } = params
  if (!expected?.url) {
    return false
  }

  if (snapshot.authCheckpoint.interrupt) {
    return false
  }

  return snapshot.authCheckpoint.routeMismatch
}

function buildStartingPointWarnings(params: {
  expected?: CaptureVisualStateExpectations
  selector?: string
  snapshot: VisualPageSnapshot
}): string[] {
  const { expected, selector, snapshot } = params
  const warnings: string[] = []

  if (snapshot.authCheckpoint.routeMismatch && expected?.url) {
    warnings.push(
      `Playwright did not reach the recorded URL before visual capture finished. Expected ${expected.url}, reached ${snapshot.authCheckpoint.reachedUrl}.`
    )
  }

  if (snapshot.authCheckpoint.pageTitleMismatch && expected?.title) {
    warnings.push(
      `Playwright did not confirm the recorded page title before visual capture finished. Expected ${expected.title}, reached ${snapshot.pageTitle || '(empty title)'}.`
    )
  }

  if (selector && snapshot.element === null) {
    warnings.push(
      `Playwright could not confirm the starting selector ${selector} before visual capture finished.`
    )
  }

  if ((expected?.landmarks?.length ?? 0) > 0 && snapshot.authCheckpoint.matchedLandmarks.length === 0) {
    warnings.push(
      'Playwright did not confirm any expected starting landmarks before visual capture finished.'
    )
  }

  return warnings
}

async function waitForStartingPoint(params: {
  allowManualInterrupt?: boolean
  expected?: CaptureVisualStateExpectations
  page: Page
  selector?: string
  timeoutMs: number
}): Promise<{
  snapshot: VisualPageSnapshot
  startingPointConfirmed: boolean
}> {
  const deadline = Date.now() + params.timeoutMs
  let snapshot = await inspectVisualPage(params.page, {
    allowManualInterrupt: params.allowManualInterrupt,
    expected: params.expected,
    selector: params.selector,
  })

  while (Date.now() <= deadline) {
    const startingPointConfirmed = isStartingPointConfirmed({
      expected: params.expected,
      selector: params.selector,
      snapshot,
    })

    if (snapshot.authCheckpoint.interrupt || startingPointConfirmed) {
      return {
        snapshot,
        startingPointConfirmed,
      }
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }

    await params.page.waitForTimeout(
      Math.min(PLAYWRIGHT_PAGE_CONFIRMATION_POLL_MS, remainingMs)
    )
    snapshot = await inspectVisualPage(params.page, {
      allowManualInterrupt: params.allowManualInterrupt,
      expected: params.expected,
      selector: params.selector,
    })
  }

  return {
    snapshot,
    startingPointConfirmed: isStartingPointConfirmed({
      expected: params.expected,
      selector: params.selector,
      snapshot,
    }),
  }
}

async function attemptAuthRecovery(params: {
  auth?: CaptureVisualStateAuthOptions | null
  context: BrowserContext
  initialInterrupt: VisualState
  page: Page
  reason: string
  recovery: CaptureVisualStateRecoveryOptions
  screenshotDir?: string
  selector?: string
  url: string
  expected?: CaptureVisualStateExpectations
}): Promise<VisualState> {
  const { context, expected, initialInterrupt, page, reason, recovery, selector, url } = params
  const startedAt = new Date().toISOString()
  const deadline = Date.now() + recovery.timeoutMs
  const AUTH_RECOVERY_HEARTBEAT_MS = 30_000
  let lastHeartbeatAt = Date.now()
  let latestSnapshot: VisualPageSnapshot | undefined
  let persistedAuthPath: string | undefined
  let retryAttemptCount = 0
  let retryToExpectedUrl:
    | {
        attemptCount?: number
        attempted: true
        completedAt?: string
        error?: string
        outcome: 'succeeded' | 'failed'
        targetUrl: string
      }
    | undefined

  try {
    while (Date.now() <= deadline) {
      const snapshot = await inspectVisualPage(page, { expected, selector })
      latestSnapshot = snapshot

      const now = Date.now()
      if (now - lastHeartbeatAt >= AUTH_RECOVERY_HEARTBEAT_MS) {
        const remainingSec = Math.max(0, Math.round((deadline - now) / 1000))
        console.log(
          pc.dim('[taro]') +
            ` Still waiting for authentication… ${remainingSec}s remaining.`
        )
        lastHeartbeatAt = now
      }

      if (!snapshot.authCheckpoint.interrupt && recovery.saveStorageStatePath && !persistedAuthPath) {
        await mkdir(dirname(recovery.saveStorageStatePath), { recursive: true })
        await context.storageState({ path: recovery.saveStorageStatePath })
        persistedAuthPath = recovery.persistedAuthPath
      }

      if (
        isStartingPointConfirmed({
          expected,
          selector,
          snapshot,
        })
      ) {
        if (recovery.saveStorageStatePath && !persistedAuthPath) {
          await mkdir(dirname(recovery.saveStorageStatePath), { recursive: true })
          await context.storageState({ path: recovery.saveStorageStatePath })
          persistedAuthPath = recovery.persistedAuthPath
        }
        const screenshotPath = await capturePageScreenshot(
          page,
          params.screenshotDir,
          'starting-point'
        )

        return {
          authRecovery: {
            completedAt: new Date().toISOString(),
            instructionsPath: recovery.instructionsPath,
            persistedAuthPath,
            retryToExpectedUrl,
            startedAt,
            status: 'succeeded',
            timeoutMs: recovery.timeoutMs,
          },
          capturedAt: new Date().toISOString(),
          dialog: snapshot.dialog,
          element: snapshot.element,
          finalUrl: snapshot.authCheckpoint.reachedUrl,
          interrupt: initialInterrupt.interrupt,
          matchedLandmarks: snapshot.authCheckpoint.matchedLandmarks,
          pageTitle: snapshot.pageTitle,
          reason,
          screenshotPath,
          selector,
          startingPointConfirmed: true,
          status: 'auth-recovered',
          url,
          warnings: [],
        }
      }

      const targetUrl = expected?.url
      if (
        targetUrl &&
        retryAttemptCount < PLAYWRIGHT_AUTH_RECOVERY_RETRY_LIMIT &&
        shouldRetryExpectedUrlDuringAuthRecovery({
          expected,
          snapshot,
        })
      ) {
        retryAttemptCount += 1
        try {
          await page.goto(targetUrl, {
            timeout: Math.max(1, deadline - Date.now()),
            waitUntil: 'domcontentloaded',
          })
          retryToExpectedUrl = {
            attemptCount: retryAttemptCount,
            attempted: true,
            completedAt: new Date().toISOString(),
            outcome: 'succeeded',
            targetUrl,
          }
        } catch (error) {
          retryToExpectedUrl = {
            attemptCount: retryAttemptCount,
            attempted: true,
            completedAt: new Date().toISOString(),
            error: getErrorMessage(error),
            outcome: 'failed',
            targetUrl,
          }
        }

        const remainingMsAfterRetry = deadline - Date.now()
        if (remainingMsAfterRetry <= 0) {
          break
        }

        await page.waitForTimeout(
          Math.min(PLAYWRIGHT_AUTH_RECOVERY_POLL_MS, remainingMsAfterRetry)
        )
        continue
      }

      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        break
      }

      await page.waitForTimeout(Math.min(PLAYWRIGHT_AUTH_RECOVERY_POLL_MS, remainingMs))
    }

    const finalSnapshot = latestSnapshot

    return {
      authRecovery: {
        completedAt: new Date().toISOString(),
        instructionsPath: recovery.instructionsPath,
        persistedAuthPath,
        retryToExpectedUrl,
        startedAt,
        status: 'timed-out',
        timeoutMs: recovery.timeoutMs,
      },
      capturedAt: new Date().toISOString(),
      dialog: finalSnapshot?.dialog ?? initialInterrupt.dialog,
      element: finalSnapshot?.element ?? initialInterrupt.element,
      finalUrl: finalSnapshot?.authCheckpoint.reachedUrl ?? initialInterrupt.finalUrl,
      interrupt: initialInterrupt.interrupt,
      matchedLandmarks:
        finalSnapshot?.authCheckpoint.matchedLandmarks ?? initialInterrupt.matchedLandmarks,
      pageTitle: finalSnapshot?.pageTitle ?? initialInterrupt.pageTitle,
      reason,
      screenshotPath: initialInterrupt.screenshotPath,
      selector,
      status: 'auth-recovery-timed-out',
      url,
      warnings: [
        `Timed out waiting ${Math.round(recovery.timeoutMs / 1000)}s for manual authentication.`,
      ],
    }
  } catch (error) {
    const message = getErrorMessage(error)
    const finalSnapshot = latestSnapshot

    return {
      authRecovery: {
        completedAt: new Date().toISOString(),
        error: message,
        instructionsPath: recovery.instructionsPath,
        persistedAuthPath,
        retryToExpectedUrl,
        startedAt,
        status: 'failed',
        timeoutMs: recovery.timeoutMs,
      },
      capturedAt: new Date().toISOString(),
      dialog: finalSnapshot?.dialog ?? initialInterrupt.dialog,
      element: finalSnapshot?.element ?? initialInterrupt.element,
      finalUrl: finalSnapshot?.authCheckpoint.reachedUrl ?? initialInterrupt.finalUrl,
      interrupt: initialInterrupt.interrupt,
      matchedLandmarks:
        finalSnapshot?.authCheckpoint.matchedLandmarks ?? initialInterrupt.matchedLandmarks,
      pageTitle: finalSnapshot?.pageTitle ?? initialInterrupt.pageTitle,
      reason,
      screenshotPath: initialInterrupt.screenshotPath,
      selector,
      status: 'auth-recovery-failed',
      url,
      warnings: [`Playwright authentication could not be completed: ${message}`],
    }
  }
}

/**
 * Captures a structured visual-state artifact for a page and optional selector.
 */
export async function captureVisualState(
  url: string,
  options: CaptureVisualStateOptions
): Promise<VisualState | null> {
  const timeoutMs = options.timeoutMs ?? 5000
  const headless = !(options.authRecovery?.enabled ?? false)
  let browser: Browser | null = null

  try {
    const captureSession = await openCapturePage({
      auth: options.auth,
      headless,
      timeoutMs,
      url,
    })
    browser = captureSession.browser

    const { snapshot, startingPointConfirmed } = await waitForStartingPoint({
      allowManualInterrupt: options.authRecovery?.enabled ?? false,
      expected: options.expected,
      page: captureSession.page,
      selector: options.selector,
      timeoutMs,
    })
    const screenshotPath = await capturePageScreenshot(
      captureSession.page,
      options.screenshotDir,
      snapshot.authCheckpoint.interrupt
        ? 'auth-checkpoint'
        : startingPointConfirmed
          ? 'starting-point'
          : options.reason
    )

    if (snapshot.authCheckpoint.interrupt) {
      const interruptedState = toAuthInterruptedVisualState({
        auth: options.auth,
        expected: options.expected,
        reason: options.reason,
        screenshotPath,
        selector: options.selector,
        snapshot,
        url,
      })

      if (options.authRecovery?.enabled) {
        const timeoutSec = Math.round((options.authRecovery.timeoutMs ?? 0) / 1000)
        console.log(
          pc.dim('[taro]') +
            ` Auth required — complete authentication in the browser window. Waiting up to ${timeoutSec}s.`
        )
        return await attemptAuthRecovery({
          auth: options.auth,
          context: captureSession.context,
          expected: options.expected,
          initialInterrupt: interruptedState,
          page: captureSession.page,
          reason: options.reason,
          recovery: options.authRecovery,
          screenshotDir: options.screenshotDir,
          selector: options.selector,
          url,
        })
      }

      return interruptedState
    }

    return toCapturedVisualState({
      reason: options.reason,
      screenshotPath,
      selector: options.selector,
      snapshot,
      startingPointConfirmed,
      url,
      warnings: startingPointConfirmed
        ? []
        : buildStartingPointWarnings({
            expected: options.expected,
            selector: options.selector,
            snapshot,
          }),
    })
  } catch (error) {
    return toCaptureFailedVisualState({
      error,
      reason: options.reason,
      selector: options.selector,
      url,
    })
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

/**
 * Builds the highest-priority RTL query for an element based on its accessibility properties.
 * Priority: getByRole > getByLabelText > getByPlaceholderText > getByText >
 * getByAltText > getByTitle > getByDisplayValue > getByTestId
 *
 * @param info - Element information from DOM inspection
 * @param selector - Original CSS selector
 * @returns QueryResult with query string, quality rating, and method name
 */
export function deriveAccessibleQuery(info: ElementInfo): QueryResult | null {
  const impliedRole = info.role ?? ROLE_MAP[info.tagName]
  const accessibleName = getAccessibleName(info)

  // Priority 1: getByRole when both role and accessible name exist
  if (impliedRole && accessibleName) {
    return {
      method: 'getByRole',
      quality: 'excellent' as QueryQuality,
      query: `screen.getByRole('${impliedRole}', { name: '${escapeSingleQuote(accessibleName)}' })`,
    }
  }

  // Priority 2: getByLabelText when explicit label evidence exists
  const labelText = info.labelText ?? info.ariaLabel
  if (labelText) {
    return {
      method: 'getByLabelText',
      quality: 'excellent' as QueryQuality,
      query: `screen.getByLabelText('${escapeSingleQuote(labelText)}')`,
    }
  }

  // Priority 3: getByPlaceholderText when placeholder exists
  if (info.placeholder) {
    return {
      method: 'getByPlaceholderText',
      quality: 'acceptable' as QueryQuality,
      query: `screen.getByPlaceholderText('${escapeSingleQuote(info.placeholder)}')`,
    }
  }

  // Priority 4: getByText when innerText exists
  if (info.innerText) {
    return {
      method: 'getByText',
      quality: 'good' as QueryQuality,
      query: `screen.getByText('${escapeSingleQuote(info.innerText)}')`,
    }
  }

  // Priority 5: getByAltText for images or image-like content
  if (info.altText) {
    return {
      method: 'getByAltText',
      quality: 'excellent' as QueryQuality,
      query: `screen.getByAltText('${escapeSingleQuote(info.altText)}')`,
    }
  }

  // Priority 6: getByTitle when title is the strongest remaining hook
  if (info.title) {
    return {
      method: 'getByTitle',
      quality: 'acceptable' as QueryQuality,
      query: `screen.getByTitle('${escapeSingleQuote(info.title)}')`,
    }
  }

  // Priority 7: getByDisplayValue for filled form controls
  if (info.value) {
    return {
      method: 'getByDisplayValue',
      quality: 'acceptable' as QueryQuality,
      query: `screen.getByDisplayValue('${escapeSingleQuote(info.value)}')`,
    }
  }

  // Priority 8: getByTestId only when the element already exposes one
  if (info.testId) {
    return {
      method: 'getByTestId',
      quality: 'fragile' as QueryQuality,
      query: `screen.getByTestId('${escapeSingleQuote(info.testId)}')`,
    }
  }

  return null
}

async function inspectSelector(
  url: string,
  cssSelector: string,
  timeoutMs = 5000
): Promise<SelectorInspectionResult> {
  let browser: Browser | null = null

  try {
    const inspectionSession = await openCapturePage({
      headless: true,
      timeoutMs,
      url,
    })
    browser = inspectionSession.browser

    const element = await readOptionalElementInfo(inspectionSession.page, cssSelector)
    if (!element) {
      return {
        status: 'selector-not-found',
      }
    }

    return {
      status: 'found',
      element,
    }
  } catch (error) {
    return {
      status: 'inspection-failed',
      error: `${PLAYWRIGHT_SELECTOR_INSPECTION_ERROR_PREFIX} ${getErrorMessage(error)}`,
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

export async function resolveSelector(
  selector: SelectorDescriptor,
  options: ResolveSelectorOptions = {}
): Promise<SelectorResolutionResult> {
  const { url, preservedQuery, timeoutMs = 5000, inspect = inspectSelector } = options
  const inspectSource =
    options.debug?.inspectSource ??
    (preservedQuery ? 'preserved-query' : inspect === inspectSelector ? 'fresh-browser' : 'persistent-page')
  const phase = options.debug?.phase

  if (preservedQuery) {
    return {
      debug: buildSelectorResolutionDebugInfo(selector, {
        inspectSource,
        pageUrl: url,
        phase,
        result: 'resolved',
        derivedQuery: preservedQuery.raw,
      }),
      status: 'resolved',
      outcome: 'preserved-query',
      source: 'baseline',
      stepId: selector.stepId,
      selector,
      url,
      query: preservedQuery,
      warnings: [],
    }
  }

  if (!url) {
    return toUnresolvedSelectorResult(
      selector,
      'no-url',
      `No recorded URL is available to inspect selector ${selector.selector}.`,
      {
        inspectSource,
        phase,
      }
    )
  }

  const unsupportedSelectorReason = getUnsupportedSelectorReason(selector.selector)
  if (unsupportedSelectorReason) {
    return toUnresolvedSelectorResult(
      selector,
      'unsupported-selector',
      unsupportedSelectorReason,
      {
        inspectSource,
        pageUrl: url,
        phase,
      }
    )
  }

  try {
    const inspection = await inspect(url, selector.selector, timeoutMs)

    if (inspection.status === 'inspection-failed') {
      return toUnresolvedSelectorResult(
        selector,
        'inspection-failed',
        `Playwright inspection failed for selector ${selector.selector}.`,
        {
          inspectSource,
          inspectionError: inspection.error,
          pageUrl: url,
          phase,
        }
      )
    }

    if (inspection.status === 'selector-not-found') {
      return toUnresolvedSelectorResult(
        selector,
        'selector-not-found',
        `Selector ${selector.selector} was not found at ${url}.`,
        {
          inspectSource,
          pageUrl: url,
          phase,
        }
      )
    }

    const accessibleQuery = deriveAccessibleQuery(inspection.element)
    if (!accessibleQuery) {
      return toUnresolvedSelectorResult(
        selector,
        'selector-inaccessible',
        `Selector ${selector.selector} did not expose trustworthy accessible query evidence.`,
        {
          inspectSource,
          pageUrl: url,
          phase,
        }
      )
    }

    return {
      debug: buildSelectorResolutionDebugInfo(selector, {
        inspectSource,
        pageUrl: url,
        phase,
        result: 'resolved',
        derivedQuery: accessibleQuery.query,
      }),
      status: 'resolved',
      outcome: 'accessible-query',
      source: 'live-dom',
      stepId: selector.stepId,
      selector,
      url,
      query: toQueryDescriptor(selector, accessibleQuery),
      inspectedElement: inspection.element,
      warnings: [],
    }
  } catch (error) {
    return toUnresolvedSelectorResult(
      selector,
      'inspection-failed',
      `Playwright inspection failed for selector ${selector.selector}.`,
      {
        inspectSource,
        inspectionError: error instanceof Error ? error.message : 'Unknown error',
        pageUrl: url,
        phase,
      }
    )
  }
}

/**
 * Selects the most appropriate RTL matcher based on element type and action.
 *
 * @param info - Element information from DOM inspection
 * @param action - The action being performed (fill, assert, etc.)
 * @returns Matcher string (e.g., '.toHaveValue()', '.toBeChecked()')
 */
export function selectMatcher(info: ElementInfo, action: string): string {
  // checkbox → toBeChecked
  if (info.type === 'checkbox') {
    return '.toBeChecked()'
  }

  // fill with value → toHaveValue
  if (info.value !== undefined && action === 'fill') {
    return `.toHaveValue('${escapeSingleQuote(info.value)}')`
  }

  // assert with innerText → toHaveTextContent
  if (action === 'assert' && info.innerText) {
    return `.toHaveTextContent('${escapeSingleQuote(info.innerText)}')`
  }

  // dialog → toBeVisible
  if (action === 'assert' && info.role === 'dialog') {
    return '.toBeVisible()'
  }

  // Default → toBeInTheDocument
  return '.toBeInTheDocument()'
}

/**
 * Inspects multiple elements on a page using a single Playwright browser instance.
 * More efficient than opening a fresh browser session per selector.
 *
 * @param url - URL to navigate to
 * @param selectors - Array of CSS selectors to locate elements
 * @param timeoutMs - Timeout for navigation (default 5000ms)
 * @returns Map of selector to ElementInfo (or null if not found)
 */
export async function inspectElements(
  url: string,
  selectors: string[],
  timeoutMs = 5000
): Promise<Map<string, ElementInfo | null>> {
  const result = new Map<string, ElementInfo | null>()
  let browser: Browser | null = null

  try {
    const inspectionSession = await openCapturePage({
      headless: true,
      timeoutMs,
      url,
    })
    browser = inspectionSession.browser

    for (const selector of selectors) {
      result.set(selector, await readOptionalElementInfo(inspectionSession.page, selector))
    }
  } catch (error) {
    const message = `${PLAYWRIGHT_SELECTOR_INSPECTION_ERROR_PREFIX} ${getErrorMessage(error)}`
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' QRY-02:') +
        ` Failed to inspect elements on ${url}: ${message}`
    )
    for (const selector of selectors) {
      result.set(selector, null)
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }

  return result
}

/**
 * Maps a QueryDescriptor (RTL query) to a Playwright Locator on the given page.
 * Returns null if the query method is unsupported.
 */
function queryToPlaywrightLocator(
  page: Page,
  query: { method: string; target?: string; role?: string; name?: string }
): import('playwright').Locator | null {
  const target = query.target ?? ''
  const method = query.method

  if (method === 'getByRole' && query.role) {
    const options = query.name ? { name: query.name } : undefined
    return page.getByRole(query.role as Parameters<Page['getByRole']>[0], options)
  }
  if (method === 'getByText') {
    return page.getByText(target)
  }
  if (method === 'getByLabelText') {
    return page.getByLabel(target)
  }
  if (method === 'getByPlaceholderText') {
    return page.getByPlaceholder(target)
  }
  if (method === 'getByTestId') {
    return page.getByTestId(target)
  }
  if (method === 'getByTitle') {
    return page.getByTitle(target)
  }
  if (method === 'getByAltText') {
    return page.getByAltText(target)
  }
  if (method === 'getByDisplayValue') {
    return page.locator(`[value="${target}"]`)
  }
  return null
}

export type ReplayLocatorSource =
  | 'metadata.selector'
  | 'metadata.query'
  | 'step.target'
  | 'fill.placeholder'
  | 'none'

export interface ReplayStepDebugTrace {
  action: NormalizedAction
  error?: string
  fallbackLocators?: string[]
  locatorSource: ReplayLocatorSource
  locatorValue?: string
  pageTitle?: string
  pageUrl?: string
  playwrightAction: string
  result: 'replayed' | 'failed' | 'skipped'
  stepId?: StepId
  target?: string
  timeoutMs: number
}

interface ReplayStepResult {
  debug?: ReplayStepDebugTrace
  replayed: boolean
  warning?: string
}

interface ResolvedStepLocator {
  locator: import('playwright').Locator | null
  source: ReplayLocatorSource
  value?: string
}

interface SkippedReplaySelector {
  reason: string
  source: ReplayLocatorSource
  value: string
}

function isPlaywrightTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /timeout/i.test(error.name) || /timeout/i.test(error.message)
}

async function waitForReplayLocator(
  locator: import('playwright').Locator,
  timeoutMs: number
): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs })
}

async function summarizeReplayLocatorState(
  locator: import('playwright').Locator
): Promise<string | null> {
  const summary = await locator
    .evaluateAll((elements) => {
      const isVisible = (element: Element): boolean => {
        const htmlElement = element as HTMLElement
        const style = window.getComputedStyle(htmlElement)
        const rect = htmlElement.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }

      const disabledCount = elements.filter((element) => {
        const htmlElement = element as HTMLElement & { disabled?: boolean }
        return (
          htmlElement.disabled === true ||
          htmlElement.getAttribute('aria-disabled') === 'true'
        )
      }).length

      const texts = elements
        .map((element) => (element.textContent ?? '').trim())
        .filter((text) => text.length > 0)
        .slice(0, 3)

      return {
        count: elements.length,
        disabledCount,
        texts,
        visibleCount: elements.filter(isVisible).length,
      }
    })
    .catch(() => null)

  if (!summary) {
    return null
  }

  const parts = [
    `matches=${summary.count}`,
    `visible=${summary.visibleCount}`,
    `disabled=${summary.disabledCount}`,
  ]

  if (summary.texts.length > 0) {
    parts.push(`texts=${summary.texts.map((text) => JSON.stringify(text)).join('|')}`)
  }

  return parts.join(', ')
}

function getSkippedReplaySelector(step: NormalizedStep): SkippedReplaySelector | null {
  const queryMeta = step.metadata?.query as
    | { method: string; target?: string; role?: string; name?: string }
    | undefined

  // If Taro has semantic query evidence, prefer replaying that over CSS heuristics.
  if (queryMeta?.method) {
    return null
  }

  const selectorMeta = step.metadata?.selector as { selector?: string } | undefined
  const selector = selectorMeta?.selector ?? step.target
  const reason = getUnsupportedSelectorReason(selector)
  if (!selector || !reason) {
    return null
  }

  return {
    reason,
    source: selectorMeta?.selector ? 'metadata.selector' : 'step.target',
    value: selector,
  }
}

/**
 * Resolves a Playwright Locator for a given step, trying metadata.selector,
 * metadata.query, and step.target as fallbacks.
 */
function resolveStepLocator(
  page: Page,
  step: NormalizedStep
): ResolvedStepLocator {
  const queryMeta = step.metadata?.query as
    | { method: string; target?: string; role?: string; name?: string }
    | undefined
  if (queryMeta?.method) {
    return {
      locator: queryToPlaywrightLocator(page, queryMeta),
      source: 'metadata.query',
      value: formatQueryDescriptorForDebug(queryMeta),
    }
  }

  const selectorMeta = step.metadata?.selector as { selector?: string } | undefined
  if (selectorMeta?.selector) {
    return {
      locator: page.locator(selectorMeta.selector).first(),
      source: 'metadata.selector',
      value: selectorMeta.selector,
    }
  }

  if (step.target) {
    try {
      return {
        locator: page.locator(step.target).first(),
        source: 'step.target',
        value: step.target,
      }
    } catch {
      return {
        locator: null,
        source: 'step.target',
        value: step.target,
      }
    }
  }

  return {
    locator: null,
    source: 'none',
  }
}

/**
 * Replays a single recording step on a live Playwright page.
 * Best-effort: on failure, returns a warning instead of throwing.
 *
 * @param page - The persistent Playwright page
 * @param step - The normalized recording step to replay
 * @param timeoutMs - Maximum time per interaction (default 3000ms)
 */
export async function replayStep(
  page: Page,
  step: NormalizedStep,
  options: {
    collectDebug?: boolean
    timeoutMs?: number
  } = {}
): Promise<ReplayStepResult> {
  const timeoutMs = options.timeoutMs ?? PLAYWRIGHT_STEP_REPLAY_TIMEOUT_MS
  const action = step.action
  const noopActions: NormalizedAction[] = ['assert', 'unknown', 'waitForSelector', 'scroll', 'doubleClick']
  const debugBase: ReplayStepDebugTrace | undefined = options.collectDebug
    ? {
        action,
        locatorSource: 'none',
        pageTitle: await page.title().catch(() => undefined),
        pageUrl: page.url(),
        playwrightAction: 'noop',
        result: 'skipped',
        stepId: step.id,
        target: step.target,
        timeoutMs,
      }
    : undefined
  if (noopActions.includes(action)) {
    return { replayed: true, debug: debugBase }
  }

  try {
    if (action === 'navigate' && step.target) {
      await page.goto(step.target, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })
      return {
        replayed: true,
        debug: debugBase
          ? {
              ...debugBase,
              locatorSource: 'step.target',
              locatorValue: step.target,
              playwrightAction: `page.goto('${escapeSingleQuote(step.target)}')`,
              result: 'replayed',
            }
          : undefined,
      }
    }

    if (action === 'keyDown' && step.key) {
      await page.keyboard.press(step.key)
      return {
        replayed: true,
        debug: debugBase
          ? {
              ...debugBase,
              locatorValue: step.key,
              playwrightAction: `page.keyboard.press('${escapeSingleQuote(step.key)}')`,
              result: 'replayed',
            }
          : undefined,
      }
    }

    const skippedSelector = getSkippedReplaySelector(step)
    if (skippedSelector) {
      return {
        replayed: false,
        debug: debugBase
          ? {
              ...debugBase,
              locatorSource: skippedSelector.source,
              locatorValue: skippedSelector.value,
              playwrightAction: `skip volatile selector ${JSON.stringify(skippedSelector.value)}`,
              result: 'skipped',
              error: skippedSelector.reason,
            }
          : undefined,
      }
    }

    const resolvedLocator = resolveStepLocator(page, step)
    if (!resolvedLocator.locator) {
      return {
        replayed: false,
        warning: `No locator for ${action} on ${step.target ?? '(unknown)'}`,
        debug: debugBase
          ? {
              ...debugBase,
              locatorSource: resolvedLocator.source,
              locatorValue: resolvedLocator.value,
              playwrightAction: `${action}()`,
              result: 'failed',
              error: `No locator for ${action} on ${step.target ?? '(unknown)'}`,
            }
          : undefined,
      }
    }

    switch (action) {
      case 'click':
        await waitForReplayLocator(resolvedLocator.locator, timeoutMs)
        await resolvedLocator.locator.click({ timeout: timeoutMs })
        break
      case 'fill':
        if (step.value != null) {
          // For fill actions, the recording target is often placeholder text.
          // Try getByPlaceholder first, then fall back to clicking + filling the original locator.
          const target = step.target ?? ''
          const placeholderLocator = page.getByPlaceholder(target)
          const placeholderCount = await placeholderLocator.count().catch(() => 0)
          if (placeholderCount === 1) {
            await waitForReplayLocator(placeholderLocator, timeoutMs)
            await placeholderLocator.click({ timeout: timeoutMs })
            await placeholderLocator.fill(step.value, { timeout: timeoutMs })
            return {
              replayed: true,
              debug: debugBase
                ? {
                    ...debugBase,
                    fallbackLocators: resolvedLocator.value ? [`${resolvedLocator.source}:${resolvedLocator.value}`] : undefined,
                    locatorSource: 'fill.placeholder',
                    locatorValue: target,
                    playwrightAction: `page.getByPlaceholder('${escapeSingleQuote(target)}').fill('${escapeSingleQuote(step.value)}')`,
                    result: 'replayed',
                  }
                : undefined,
            }
          } else {
            await waitForReplayLocator(resolvedLocator.locator, timeoutMs)
            await resolvedLocator.locator.click({ timeout: timeoutMs })
            await resolvedLocator.locator.fill(step.value, { timeout: timeoutMs })
          }
        }
        break
      case 'select':
        await waitForReplayLocator(resolvedLocator.locator, timeoutMs)
        await resolvedLocator.locator.click({ timeout: timeoutMs })
        break
    }

    const playwrightAction =
      action === 'fill' && step.value != null
        ? `locator.fill('${escapeSingleQuote(step.value)}')`
        : action === 'select'
          ? 'locator.click()'
          : action === 'click'
            ? 'locator.click()'
            : `${action}()`

    return {
      replayed: true,
      debug: debugBase
        ? {
            ...debugBase,
            locatorSource: resolvedLocator.source,
            locatorValue: resolvedLocator.value,
            playwrightAction,
            result: 'replayed',
          }
        : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const resolvedLocator: ResolvedStepLocator =
      action === 'navigate' || action === 'keyDown'
        ? {
            locator: null,
            source: action === 'navigate' ? 'step.target' : 'none',
            value: action === 'navigate' ? step.target : step.key,
          }
        : resolveStepLocator(page, step)
    const locatorSummary =
      action === 'navigate' || action === 'keyDown' || !resolvedLocator.locator
        ? null
        : await summarizeReplayLocatorState(resolvedLocator.locator)
    const enrichedMessage =
      isPlaywrightTimeoutError(error) && locatorSummary
        ? `${message} [${locatorSummary}]`
        : message
    const truncated =
      enrichedMessage.length > 240
        ? enrichedMessage.slice(0, 240) + '...'
        : enrichedMessage
    return {
      replayed: false,
      warning: `${action} on ${step.target ?? '(unknown)'} failed: ${truncated}`,
      debug: debugBase
        ? {
            ...debugBase,
            locatorSource: resolvedLocator.source,
            locatorValue: resolvedLocator.value,
            playwrightAction:
              action === 'navigate' && step.target
                ? `page.goto('${escapeSingleQuote(step.target)}')`
                : action === 'keyDown' && step.key
                  ? `page.keyboard.press('${escapeSingleQuote(step.key)}')`
                  : action === 'fill' && step.value != null
                    ? `locator.fill('${escapeSingleQuote(step.value)}')`
                    : 'locator.click()',
            result: 'failed',
            error: enrichedMessage,
          }
        : undefined,
    }
  }
}

/**
 * Creates an inspector function backed by an existing persistent Page.
 * The returned function matches the `inspect` signature from ResolveSelectorOptions,
 * allowing resolveSelector() to inspect the DOM without opening a new browser.
 *
 * @param page - A persistent Playwright page already at the correct DOM state
 */
export function createPageInspector(
  page: Page
): (url: string, cssSelector: string, timeoutMs?: number) => Promise<SelectorInspectionResult> {
  return async (_url: string, cssSelector: string, _timeoutMs?: number): Promise<SelectorInspectionResult> => {
    const element = await readOptionalElementInfo(page, cssSelector)
    if (!element) {
      return { status: 'selector-not-found' }
    }
    return { status: 'found', element }
  }
}

/**
 * Emits a warning for fragile queries (getByTestId fallback).
 * Should be called when buildQuery returns method: 'getByTestId'.
 *
 * @param selector - The CSS selector that required fallback to testId
 */
export function emitQry03Warning(selector: string): void {
  console.warn(
    pc.yellow('[taro]') +
      pc.dim(' QRY-03:') +
      ` No accessible query for ${pc.bold(selector)} — consider adding aria-label or data-testid to this element`
  )
}
