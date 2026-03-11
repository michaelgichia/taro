import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import pc from 'picocolors'
import type {
  DialogState,
  ElementInfo,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  QueryQuality,
  SemanticMarkerAssertion,
  SemanticMarkerAssertionProofKind,
  SemanticMarkerAssertionResolution,
  SemanticMarkerAssertionUnresolvedReason,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  SelectorDescriptor,
  SelectorResolutionResult,
  UnresolvedSemanticMarker,
  VisualState,
} from '../types/recording.js'
import type { TaroPlaywrightAuthStrategy } from '../types/state.js'
import {
  getUnsupportedSelectorReason,
  isDisplayValueQueryMethod,
  isLabelTextQueryMethod,
  isPlaceholderTextQueryMethod,
  isRoleQueryMethod,
  isTestIdQueryMethod,
  isTextQueryMethod,
  toSingularAsyncQueryMethod,
} from './query-policy.js'

/**
 * Maps HTML tag names to implied ARIA roles.
 * Used by buildQuery to determine accessible query method.
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
const AUTH_PATH_PATTERN =
  /\b(login|log-?in|sign-?in|auth|oauth|sso|verify|verification|mfa|two[- ]factor|checkpoint|challenge)\b/i
const AUTH_COPY_PATTERN =
  /\b(sign in|log in|continue with|single sign-on|sso|password|verification code|one-time code|two-factor|2fa|multi-factor|mfa|confirm it'?s you)\b/i

/**
 * Escapes single quotes in strings for use in generated query code.
 */
function escapeSingleQuote(str: string): string {
  return str.replace(/'/g, "\\'")
}

/**
 * Sanitizes a CSS selector to be used as a testId.
 * Replaces non-alphanumeric characters with hyphens and trims leading/trailing hyphens.
 */
function sanitizeSelectorForTestId(selector: string): string {
  return selector.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '')
}

export interface FoundSelectorInspectionResult {
  status: 'found'
  element: ElementInfo
}

export interface MissingSelectorInspectionResult {
  status: 'selector-not-found'
}

export interface FailedSelectorInspectionResult {
  status: 'inspection-failed'
  error: string
}

export type SelectorInspectionResult =
  | FoundSelectorInspectionResult
  | MissingSelectorInspectionResult
  | FailedSelectorInspectionResult

export interface ResolveSelectorOptions {
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
  const locator = page.locator(selector).first()
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
    url?: string
    inspectionError?: string
  } = {}
): SelectorResolutionResult {
  return {
    status: 'unresolved',
    outcome,
    stepId: selector.stepId,
    selector,
    url: options.url,
    reason,
    inspectionError: options.inspectionError,
    warnings: [reason],
  }
}

function sanitizeCaptureSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'capture'
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

function getQueryScope(query: QueryDescriptor): string | undefined {
  if (query.raw) {
    const match = query.raw.match(/^(.*)\.(?:get|find|query)(?:All)?By[A-Za-z]+\(.+\)$/)
    if (match?.[1]) {
      return match[1]
    }
  }

  if (query.queryRoot === 'screen') {
    return 'screen'
  }

  if (query.queryRoot === 'within') {
    return 'screen'
  }

  return undefined
}

function buildScopedQueryExpression(
  query: QueryDescriptor,
  method: string,
  options: {
    role?: string
    target?: string
    name?: string
  }
): string | undefined {
  const scope = getQueryScope(query)
  if (!scope) {
    return undefined
  }

  if (method === 'findByRole' && options.role && options.name) {
    return `${scope}.${method}('${escapeSingleQuote(options.role)}', { name: '${escapeSingleQuote(options.name)}' })`
  }

  if (!options.target) {
    return undefined
  }

  return `${scope}.${method}('${escapeSingleQuote(options.target)}')`
}

function buildAsyncQueryDescriptor(
  query: QueryDescriptor,
  options: {
    method: string
    role?: string
    target?: string
    name?: string
  }
): QueryDescriptor | undefined {
  const raw = buildScopedQueryExpression(query, options.method, options)
  if (!raw) {
    return undefined
  }

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

  if (!asyncQuery) {
    return undefined
  }

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

  if (!asyncQuery) {
    return undefined
  }

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

  if (!asyncQuery) {
    return undefined
  }

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

  if (isIconOnlyText(proofText)) {
    return toUnresolvedAssertion(step, 'icon-only-target', candidate)
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

function urlsMateriallyDiffer(expectedUrl?: string, actualUrl?: string): boolean {
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
  if (AUTH_PATH_PATTERN.test(reachedUrl)) {
    authSignals.add('auth-route')
  }
  if (AUTH_COPY_PATTERN.test(options.actualTitle)) {
    authSignals.add('auth-title')
  }

  const routeMismatch = urlsMateriallyDiffer(options.expectedUrl, reachedUrl)
  const pageTitleMismatch = titlesMateriallyDiffer(options.expectedTitle, options.actualTitle)
  const missingExpectedSelector = Boolean(options.selector) && options.element === null
  const missingLandmarks = expectedLandmarks.filter(
    (landmark) => !bodyAnalysis.matchedLandmarks.includes(landmark)
  )
  const interrupt =
    authSignals.size > 0 &&
    (routeMismatch ||
      pageTitleMismatch ||
      missingExpectedSelector ||
      (expectedLandmarks.length > 0 && bodyAnalysis.matchedLandmarks.length === 0))

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

  const screenshotPath = `${screenshotDir}/${sanitizeCaptureSegment(nameHint)}.png`
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

export interface CaptureVisualStateAuthOptions {
  path: string
  strategy: TaroPlaywrightAuthStrategy
}

export interface CaptureVisualStateExpectations {
  landmarks?: string[]
  title?: string
  url?: string
}

export interface CaptureVisualStateOptions {
  auth?: CaptureVisualStateAuthOptions | null
  expected?: CaptureVisualStateExpectations
  reason: string
  screenshotDir?: string
  selector?: string
  timeoutMs?: number
}

/**
 * Captures a structured visual-state artifact for a page and optional selector.
 */
export async function captureVisualState(
  url: string,
  options: CaptureVisualStateOptions
): Promise<VisualState | null> {
  const { auth, expected, reason, screenshotDir, selector, timeoutMs = 5000 } = options
  let browser: Browser | null = null
  let context: BrowserContext | null = null

  try {
    browser = await chromium.launch({ headless: true })
    if (auth?.strategy === 'storageState') {
      context = await browser.newContext({ storageState: auth.path })
    }
    const page = context ? await context.newPage() : await browser.newPage()

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })

    const pageTitle = await page.title()
    const element = await readOptionalElementInfo(page, selector)
    const authCheckpoint = await detectAuthCheckpoint(page, {
      actualTitle: pageTitle,
      element,
      expectedLandmarks: expected?.landmarks,
      expectedTitle: expected?.title,
      expectedUrl: expected?.url,
      selector,
    })
    const dialog = await extractDialogState(page)

    const screenshotPath = await capturePageScreenshot(
      page,
      screenshotDir,
      pageTitle || (authCheckpoint.interrupt ? 'auth-interrupt' : reason)
    )

    if (authCheckpoint.interrupt) {
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

      return {
        capturedAt: new Date().toISOString(),
        dialog,
        element,
        finalUrl: authCheckpoint.reachedUrl,
        interrupt: {
          kind: 'auth-required',
          actualTitle: pageTitle,
          expectedTitle: expected?.title,
          expectedUrl: expected?.url,
          path: auth?.path,
          reachedUrl: authCheckpoint.reachedUrl,
          signals,
          strategy: auth?.strategy,
        },
        pageTitle,
        reason,
        screenshotPath,
        selector,
        status: 'auth-interrupted',
        url,
        warnings: [
          `Authentication required before visual capture could reach ${expected?.url ?? url}.`,
        ],
      }
    }

    return {
      capturedAt: new Date().toISOString(),
      dialog,
      element,
      finalUrl: authCheckpoint.reachedUrl,
      pageTitle,
      reason,
      screenshotPath,
      selector,
      status: 'captured',
      url,
      warnings: [],
    }
  } catch (error) {
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' VIS-01:') +
        ` Failed to capture visual state for ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return null
  } finally {
    if (context) {
      await context.close().catch(() => undefined)
    }
    if (browser) {
      await browser.close()
    }
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

/**
 * Legacy helper retained for scoring/reporting until generation consumes
 * SelectorResolutionResult directly in Phase 14-02.
 */
export function buildQuery(info: ElementInfo, selector: string): QueryResult {
  const accessibleQuery = deriveAccessibleQuery(info)
  if (accessibleQuery) {
    return accessibleQuery
  }

  // Priority 5: Fallback to getByTestId (fragile)
  const sanitized = sanitizeSelectorForTestId(selector)
  return {
    method: 'getByTestId',
    quality: 'fragile' as QueryQuality,
    query: `screen.getByTestId('${sanitized}')`,
  }
}

export async function inspectSelector(
  url: string,
  cssSelector: string,
  timeoutMs = 5000
): Promise<SelectorInspectionResult> {
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })

    const count = await page.locator(cssSelector).count()
    if (count === 0) {
      return { status: 'selector-not-found' }
    }

    return {
      status: 'found',
      element: await readElementInfo(page, cssSelector),
    }
  } catch (error) {
    return {
      status: 'inspection-failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

export async function resolveSelector(
  selector: SelectorDescriptor,
  options: ResolveSelectorOptions = {}
): Promise<SelectorResolutionResult> {
  const { url, preservedQuery, timeoutMs = 5000, inspect = inspectSelector } = options

  if (preservedQuery) {
    return {
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
      `No recorded URL is available to inspect selector ${selector.selector}.`
    )
  }

  const unsupportedSelectorReason = getUnsupportedSelectorReason(selector.selector)
  if (unsupportedSelectorReason) {
    return toUnresolvedSelectorResult(
      selector,
      'unsupported-selector',
      unsupportedSelectorReason,
      { url }
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
          url,
          inspectionError: inspection.error,
        }
      )
    }

    if (inspection.status === 'selector-not-found') {
      return toUnresolvedSelectorResult(
        selector,
        'selector-not-found',
        `Selector ${selector.selector} was not found at ${url}.`,
        { url }
      )
    }

    const accessibleQuery = deriveAccessibleQuery(inspection.element)
    if (!accessibleQuery) {
      return toUnresolvedSelectorResult(
        selector,
        'selector-inaccessible',
        `Selector ${selector.selector} did not expose trustworthy accessible query evidence.`,
        { url }
      )
    }

    return {
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
        url,
        inspectionError: error instanceof Error ? error.message : 'Unknown error',
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
 * Inspects a single element on a page using Playwright.
 * Launches headless Chromium, navigates to URL, evaluates element.
 *
 * @param url - URL to navigate to
 * @param cssSelector - CSS selector to locate element
 * @param timeoutMs - Timeout for navigation (default 5000ms)
 * @returns ElementInfo or null if element not found/error occurs
 */
export async function inspectElement(
  url: string,
  cssSelector: string,
  timeoutMs = 5000
): Promise<ElementInfo | null> {
  const inspection = await inspectSelector(url, cssSelector, timeoutMs)
  if (inspection.status === 'found') {
    return inspection.element
  }

  if (inspection.status === 'inspection-failed') {
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' QRY-02:') +
        ` Failed to inspect element ${cssSelector} on ${url}: ${inspection.error}`
    )
  }

  return null
}

/**
 * Inspects multiple elements on a page using a single Playwright browser instance.
 * More efficient than calling inspectElement multiple times.
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
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: 'domcontentloaded',
    })

    for (const selector of selectors) {
      try {
        result.set(selector, await readElementInfo(page, selector))
      } catch {
        // On individual selector failure, set to null and continue
        result.set(selector, null)
      }
    }
  } catch (error) {
    // On browser/page error, set all selectors to null
    console.warn(
      pc.yellow('[taro]') +
        pc.dim(' QRY-02:') +
        ` Failed to inspect elements on ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    for (const selector of selectors) {
      result.set(selector, null)
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  return result
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
