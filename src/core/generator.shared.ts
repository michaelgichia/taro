import type {
  JsHelperPlan,
  JsScenarioPlan,
  NormalizedStep,
  PlannedMarkerAssertion,
  SelectorDescriptor,
  SelectorResolutionResult,
} from '../types/recording.js'
import {
  markerAssertionTemplate,
  markerAssertionTemplateSync,
  stepTemplate,
  waitForAssertionBlock,
} from '../templates/test-template.js'
import {
  getUnsupportedSelectorReason,
  isRoleQueryMethod,
  isSupportedTestingLibraryQueryMethod,
} from './query-policy.js'
import { DIALOG_SCOPED_ACTION_PATTERN } from './generator.constants.js'

/** Convert a CSS selector to an RTL screen query string. */
export function selectorToQuery(selector: string | undefined): string {
  if (!selector) return 'document.body'

  const testIdMatch = selector.match(/\[data-testid=['"]?([^'"[\]]+)['"]?\]/)
  if (testIdMatch) return `screen.getByTestId('${testIdMatch[1]}')`

  const ariaLabelMatch = selector.match(/\[aria-label=['"]?([^'"[\]]+)['"]?\]/)
  if (ariaLabelMatch) return `screen.getByLabelText('${ariaLabelMatch[1]}')`

  if (selector.includes('[aria-labelledby')) {
    return `screen.getByLabelText(/* aria-labelledby */ /./)`
  }

  const placeholderMatch = selector.match(/\[placeholder=['"]?([^'"[\]]+)['"]?\]/)
  const hasInputTag = /(?:^|[\s>])input(?:[^a-z]|$)/.test(selector)
  const hasTextareaTag = /(?:^|[\s>])textarea(?:[^a-z]|$)/.test(selector)

  if (/(?:^|[\s>])button(?:[^a-z]|$)|\[type=['"]?(?:button|submit)['"]?\]/.test(selector)) {
    return `screen.getByRole('button')`
  }
  if (/(?:^|[\s>])a(?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('link')`
  }
  if (/\[type=['"]?checkbox['"]?\]/.test(selector)) {
    return `screen.getByRole('checkbox')`
  }
  if (/\[type=['"]?radio['"]?\]/.test(selector)) {
    return `screen.getByRole('radio')`
  }
  if (/(?:^|[\s>])select(?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('combobox')`
  }

  if (hasInputTag && /\[type=['"]?password['"]?\]/.test(selector)) {
    if (placeholderMatch) {
      return `screen.getByPlaceholderText('${placeholderMatch[1]}')`
    }
    return `screen.getByLabelText(/* TODO: password input has no implicit role — use the associated <label> text */ '')`
  }

  if (hasInputTag && /\[type=['"]?search['"]?\]/.test(selector)) {
    if (placeholderMatch) {
      return `screen.getByPlaceholderText('${placeholderMatch[1]}')`
    }
    return `screen.getByRole('searchbox') /* TODO: add { name } — ambiguous without accessible name */`
  }

  const isTextLikeInput =
    hasInputTag && /\[type=['"]?(?:text|email|tel|url)['"]?\]/.test(selector)

  if (hasTextareaTag || isTextLikeInput) {
    if (placeholderMatch) {
      return `screen.getByPlaceholderText('${placeholderMatch[1]}')`
    }
    return `screen.getByRole('textbox') /* TODO: add { name } — ambiguous without accessible name */`
  }

  if (/(?:^|[\s>])h[1-6](?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('heading')`
  }
  if (/(?:^|[\s>])img(?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('img')`
  }

  if (placeholderMatch) return `screen.getByPlaceholderText('${placeholderMatch[1]}')`

  const altMatch = selector.match(/\[alt=['"]?([^'"[\]]+)['"]?\]/)
  if (altMatch) return `screen.getByAltText('${altMatch[1]}')`

  const titleMatch = selector.match(/\[title=['"]?([^'"[\]]+)['"]?\]/)
  if (titleMatch) return `screen.getByTitle('${titleMatch[1]}')`

  const valueMatch = selector.match(/\[value=['"]?([^'"[\]]+)['"]?\]/)
  if (valueMatch) return `screen.getByDisplayValue('${valueMatch[1]}')`

  const escaped = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `screen.getByTestId(/* TODO: replace with RTL query — CSS: '${escaped}' */ '')`
}

function isQueryExpression(target: string): boolean {
  return /^(screen|document)\./.test(target)
}

function escapeSingleQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function looksLikeCssSelector(target: string): boolean {
  return (
    /^[#.[]/.test(target) ||
    /^[a-z][a-z0-9-]*(?:[.#[:\s>])/i.test(target) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(target)
  )
}

function getRecoveredQuery(step: NormalizedStep): string | undefined {
  const query = step.metadata?.query
  if (
    query &&
    typeof query === 'object' &&
    'raw' in query &&
    typeof query.raw === 'string' &&
    query.raw.length > 0
  ) {
    return query.raw
  }

  return undefined
}

function buildExactQueryFromDescriptor(step: NormalizedStep): string | undefined {
  const descriptor = step.metadata?.query
  if (
    !descriptor ||
    typeof descriptor !== 'object' ||
    !('method' in descriptor) ||
    typeof descriptor.method !== 'string' ||
    !('queryRoot' in descriptor) ||
    descriptor.queryRoot !== 'screen' ||
    !('target' in descriptor) ||
    typeof descriptor.target !== 'string'
  ) {
    return undefined
  }

  const target = escapeSingleQuote(descriptor.target)
  if (/ByRole$/u.test(descriptor.method)) {
    const role = 'role' in descriptor && typeof descriptor.role === 'string' ? descriptor.role : undefined
    if (!role) {
      return undefined
    }

    if (descriptor.target === role) {
      return `screen.${descriptor.method}('${escapeSingleQuote(role)}')`
    }

    return `screen.${descriptor.method}('${escapeSingleQuote(role)}', { name: '${target}' })`
  }

  if (
    /By(?:Text|LabelText|PlaceholderText|DisplayValue|AltText|Title)$/u.test(descriptor.method)
  ) {
    return `screen.${descriptor.method}('${target}')`
  }

  return undefined
}

function isSelectorDescriptor(value: unknown): value is SelectorDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'selector' in value &&
    typeof value.selector === 'string'
  )
}

function isSelectorResolutionResult(value: unknown): value is SelectorResolutionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    (value.status === 'resolved' || value.status === 'unresolved')
  )
}

function getSelectorDescriptor(step: NormalizedStep): SelectorDescriptor | undefined {
  const selector = step.metadata?.selector
  return isSelectorDescriptor(selector) ? selector : undefined
}

function getSelectorResolution(step: NormalizedStep): SelectorResolutionResult | undefined {
  const resolution = step.metadata?.selectorResolution
  return isSelectorResolutionResult(resolution) ? resolution : undefined
}

export function reconstructQuery(
  step: NormalizedStep,
  options: { scopeDialog?: boolean } = {}
): string | undefined {
  const target = step.target
  if (!target) {
    return 'document.body'
  }

  if (
    options.scopeDialog &&
    step.action === 'click' &&
    DIALOG_SCOPED_ACTION_PATTERN.test(target)
  ) {
    return `within(screen.getByRole('dialog')).getByRole('button', { name: /^${target.toLowerCase()}$/i })`
  }

  const recoveredQuery =
    step.action === 'assert' ? buildExactQueryFromDescriptor(step) ?? getRecoveredQuery(step) : getRecoveredQuery(step)
  if (recoveredQuery) {
    return recoveredQuery
  }

  if (isQueryExpression(target)) {
    return target
  }

  if (
    step.source === 'js' &&
    step.action === 'assert' &&
    isSupportedTestingLibraryQueryMethod(step.originalType)
  ) {
    const escapedTarget = target.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return isRoleQueryMethod(step.originalType)
      ? `screen.getByRole('${escapedTarget}')`
      : `screen.${step.originalType}('${escapedTarget}')`
  }

  if (looksLikeCssSelector(target)) {
    if (step.source === 'js') {
      return undefined
    }
    return selectorToQuery(target)
  }

  const escapedTarget = target.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `screen.getByText('${escapedTarget}')`
}

export function getSelectorCheckpoint(step: NormalizedStep): { reason: string; selector: string } | null {
  const resolution = getSelectorResolution(step)
  if (resolution?.status === 'unresolved') {
    return {
      reason: resolution.reason,
      selector: resolution.selector.selector,
    }
  }

  const selector = getSelectorDescriptor(step)?.selector ?? step.target
  if (step.source === 'js' && selector && looksLikeCssSelector(selector)) {
    const unsupportedSelectorReason = getUnsupportedSelectorReason(selector)
    return {
      reason:
        unsupportedSelectorReason ??
        'No trustworthy RTL query evidence was recovered for this selector.',
      selector,
    }
  }

  return null
}

export function generateStepCode(step: NormalizedStep): string {
  if (step.action === 'navigate') {
    return stepTemplate({ action: 'navigate', query: '', value: step.target })
  }
  const query = selectorToQuery(step.target)
  return stepTemplate({ action: step.action, query, value: step.value })
}

export function getScenarioHelperRefs(
  scenario: JsScenarioPlan,
  helpers: JsHelperPlan[]
): string[] {
  if (scenario.helperRefs.length > 0) {
    return scenario.helperRefs
  }

  return helpers
    .filter((helper) => helper.steps.some((step) => scenario.steps.includes(step)))
    .map((helper) => helper.name)
}

export function buildHelperStepLines(
  helper: JsHelperPlan,
  options: {
    matcherMap: Map<string, string>
    scopeDialog: boolean
  }
): string[] {
  return helper.steps.flatMap((step) => {
    if (step.action === 'assert') {
      return [`// synchronization left to the scenario body: ${step.target ?? 'assertion step'}`]
    }

    if (step.action === 'navigate') {
      return [stepTemplate({ action: 'navigate', query: '', value: step.target })]
    }

    const query = reconstructQuery(step, { scopeDialog: options.scopeDialog })
    if (!query) {
      const checkpoint = getSelectorCheckpoint(step)
      if (checkpoint) {
        return [
          stepTemplate({
            action: step.action,
            query: '',
            value: step.value,
            checkpoint,
          }),
        ]
      }

      return []
    }

    return [
      stepTemplate({
        action: step.action,
        query,
        value: step.value,
      }),
    ]
  })
}

export function dedupeMarkerAssertions(
  markerAssertions: PlannedMarkerAssertion[]
): PlannedMarkerAssertion[] {
  const seen = new Set<string>()
  const deduped: PlannedMarkerAssertion[] = []

  for (const markerAssertion of markerAssertions) {
    const placementKey =
      markerAssertion.placement.kind === 'after-helper'
        ? `after-helper:${markerAssertion.placement.helperName}:${markerAssertion.placement.stepId}`
        : `after-step:${markerAssertion.placement.stepId}`
    const key = [
      placementKey,
      markerAssertion.assertion.queryExpression.replace(/\s+/g, ' ').trim(),
      markerAssertion.assertion.matcher,
    ].join('|')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(markerAssertion)
  }

  return deduped
}

function renderMarkerAssertion(markerAssertion: PlannedMarkerAssertion): string {
  return markerAssertionTemplate({
    queryExpression: markerAssertion.assertion.queryExpression,
    matcher: markerAssertion.assertion.matcher,
  })
}

function renderMarkerAssertionSync(markerAssertion: PlannedMarkerAssertion): string {
  return markerAssertionTemplateSync({
    queryExpression: markerAssertion.assertion.queryExpression,
    matcher: markerAssertion.assertion.matcher,
  })
}

export function renderMarkerAssertionGroup(
  markerAssertions: PlannedMarkerAssertion[]
): { lines: string[]; usedWaitFor: boolean } {
  if (markerAssertions.length === 0) {
    return { lines: [], usedWaitFor: false }
  }

  if (markerAssertions.length === 1) {
    return {
      lines: [renderMarkerAssertion(markerAssertions[0]!)],
      usedWaitFor: false,
    }
  }

  const syncAssertions = markerAssertions.map((ma) => renderMarkerAssertionSync(ma))
  return {
    lines: [waitForAssertionBlock(syncAssertions)],
    usedWaitFor: true,
  }
}

export function inferAssertionMatcher(
  step: NormalizedStep,
  query: string,
  matcher?: string
): string | undefined {
  if (matcher) {
    return matcher
  }

  if (step.action !== 'assert') {
    return undefined
  }

  if (/\.(?:get|find|query)(?:All)?By(?:Role|Text|LabelText|PlaceholderText|DisplayValue|AltText|Title)\s*\(/u.test(query)) {
    return '.toBeVisible()'
  }

  return '.toBeInTheDocument()'
}
