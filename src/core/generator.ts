/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId
 */

import type {
  JsHelperPlan,
  JsScenarioPlan,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  QueryResult,
  ItGroup,
  QueryQuality,
  SelectorDescriptor,
  SelectorResolutionResult,
} from '../types/recording.js'
import type { RepoRenderTargetCandidate } from './scanner.js'
import type { ConventionsSchema } from '../types/conventions.js'
import {
  importBlock,
  describeBlock,
  markerAssertionTemplate,
  stepTemplate,
  describeBlockMultiIt,
} from '../templates/test-template.js'
import pc from 'picocolors'

export interface GeneratorOptions {
  outputPath?: string
  dryRun?: boolean
}

export interface GeneratedTest {
  code: string
  testName: string
  filePath?: string
}

/** Convert a CSS selector to an RTL screen query string. */
function selectorToQuery(selector: string | undefined): string {
  if (!selector) return 'document.body'

  // data-testid attribute
  const testIdMatch = selector.match(/\[data-testid=['"]?([^'"[\]]+)['"]?\]/)
  if (testIdMatch) return `screen.getByTestId('${testIdMatch[1]}')`

  // aria-label attribute
  const ariaLabelMatch = selector.match(/\[aria-label=['"]?([^'"[\]]+)['"]?\]/)
  if (ariaLabelMatch) return `screen.getByLabelText('${ariaLabelMatch[1]}')`

  // aria-labelledby falls back to getByLabelText with regex
  if (selector.includes('[aria-labelledby')) {
    return `screen.getByLabelText(/* aria-labelledby */ /./)`
  }

  // Element-level role inference
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
  if (/(?:^|[\s>])input(?:[^a-z]|$)|\[type=['"]?(?:text|email|password|search|tel|url)['"]?\]/.test(selector)) {
    return `screen.getByRole('textbox')`
  }
  if (/(?:^|[\s>])textarea(?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('textbox')`
  }
  if (/(?:^|[\s>])h[1-6](?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('heading')`
  }
  if (/(?:^|[\s>])img(?:[^a-z]|$)/.test(selector)) {
    return `screen.getByRole('img')`
  }

  // Last resort: escape the selector and use as getByTestId placeholder
  const escaped = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `screen.getByTestId(/* TODO: replace with RTL query — CSS: '${escaped}' */ '')`
}

function isQueryExpression(target: string): boolean {
  return /^(screen|document)\./.test(target)
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

function reconstructQuery(
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
    /^(continue|save)$/i.test(target)
  ) {
    return `within(screen.getByRole('dialog')).getByRole('button', { name: /^${target.toLowerCase()}$/i })`
  }

  const recoveredQuery = getRecoveredQuery(step)
  if (recoveredQuery) {
    return recoveredQuery
  }

  if (isQueryExpression(target)) {
    return target
  }

  if (step.source === 'js' && step.action === 'assert' && step.originalType.startsWith('getBy')) {
    const escapedTarget = target.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return step.originalType === 'getByRole'
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

function getSelectorCheckpoint(step: NormalizedStep): { reason: string; selector: string } | null {
  const resolution = getSelectorResolution(step)
  if (resolution?.status === 'unresolved') {
    return {
      reason: resolution.reason,
      selector: resolution.selector.selector,
    }
  }

  const selector = getSelectorDescriptor(step)?.selector ?? step.target
  if (step.source === 'js' && selector && looksLikeCssSelector(selector)) {
    return {
      reason: 'No trustworthy RTL query evidence was recovered for this selector.',
      selector,
    }
  }

  return null
}

function generateStepCode(step: NormalizedStep): string {
  // navigate steps use target (the URL), not the CSS-selector path
  if (step.action === 'navigate') {
    return stepTemplate({ action: 'navigate', query: '', value: step.target })
  }
  const query = selectorToQuery(step.target)
  return stepTemplate({ action: step.action, query, value: step.value })
}

export function generateTest(
  recording: NormalizedRecording,
  options: GeneratorOptions = {}
): GeneratedTest {
  const testName = recording.title || 'Generated Test'

  const hasUserEvents = recording.steps.some((s) =>
    ['click', 'fill', 'select', 'keyDown'].includes(s.action)
  )

  const stepLines = recording.steps.map((step) => generateStepCode(step))

  const imports = importBlock(hasUserEvents)
  const describe = describeBlock(testName, stepLines, hasUserEvents)
  const code = `${imports}\n\n${describe}\n`

  return {
    code,
    testName,
    filePath: options.outputPath,
  }
}

// --- Phase 3 additions: multi-it() and query quality summary ---

export interface GeneratedTestV3 extends GeneratedTest {
  queryResults?: QueryResult[]
  itGroupCount?: number
}

export function emitQuerySummary(queryResults: QueryResult[]): void {
  if (queryResults.length === 0) return

  // Group by method name
  const grouped = new Map<string, { quality: QueryQuality; lines: number[] }>()
  for (const r of queryResults) {
    const existing = grouped.get(r.method)
    if (existing) {
      grouped.set(r.method, {
        ...existing,
        lines: [...existing.lines, ...(r.line !== undefined ? [r.line] : [])],
      })
    } else {
      grouped.set(r.method, {
        quality: r.quality,
        lines: r.line !== undefined ? [r.line] : [],
      })
    }
  }

  // Emit one line per unique query method
  for (const [method, { quality, lines }] of grouped) {
    const count = queryResults.filter((r) => r.method === method).length
    const lineInfo =
      quality === 'fragile' && lines.length > 0
        ? ` — see line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}`
        : ''
    console.log(
      pc.dim('[tayo]') +
        ` ${count} ${method} (${quality}${lineInfo})`
    )
  }
}

export interface GenerateFromGroupsOptions {
  outputPath?: string
  dryRun?: boolean
  conventions?: ConventionsSchema
  queryResults?: QueryResult[]
  helpers?: JsHelperPlan[]
  scenarios?: JsScenarioPlan[]
  renderTarget?: RepoRenderTargetCandidate | null
}

function getScenarioHelperRefs(
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

function buildHelperStepLines(
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

function getMarkerAssertionProofRank(markerAssertion: PlannedMarkerAssertion): number {
  switch (markerAssertion.assertion.proofKind) {
    case 'role-name':
      return 0
    case 'visible-text':
    case 'visible-value':
      return 1
    case 'label-text':
      return 2
    case 'placeholder-text':
      return 3
  }
}

function selectStrongestMarkerAssertions(
  markerAssertions: PlannedMarkerAssertion[]
): PlannedMarkerAssertion[] {
  const strongestByAnchor = new Map<
    string,
    {
      markerAssertion: PlannedMarkerAssertion
      proofRank: number
      sourceOrder: number
    }
  >()

  for (const [sourceOrder, markerAssertion] of markerAssertions.entries()) {
    const proofRank = getMarkerAssertionProofRank(markerAssertion)
    const existing = strongestByAnchor.get(markerAssertion.anchorStepId)

    if (
      !existing ||
      proofRank < existing.proofRank ||
      (proofRank === existing.proofRank && sourceOrder < existing.sourceOrder)
    ) {
      strongestByAnchor.set(markerAssertion.anchorStepId, {
        markerAssertion,
        proofRank,
        sourceOrder,
      })
    }
  }

  return [...strongestByAnchor.values()]
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((entry) => entry.markerAssertion)
}

function renderMarkerAssertion(markerAssertion: PlannedMarkerAssertion): string {
  return markerAssertionTemplate({
    queryExpression: markerAssertion.assertion.queryExpression,
    matcher: markerAssertion.assertion.matcher,
  })
}

export function generateTestFromGroups(
  title: string,
  itGroups: ItGroup[],
  options: GenerateFromGroupsOptions = {}
): GeneratedTestV3 {
  const {
    conventions,
    queryResults = [],
    outputPath,
    dryRun,
    helpers = [],
    scenarios,
    renderTarget = null,
  } = options
  const importStyle = conventions?.importStyle ?? 'esm'

  // Build query -> matcher map for context-aware assert matchers
  const matcherMap = new Map<string, string>()
  for (const qr of queryResults) {
    if (qr.matcher) {
      matcherMap.set(qr.query, qr.matcher)
    }
  }

  const scenarioPlans: JsScenarioPlan[] =
    scenarios && scenarios.length > 0
      ? scenarios
      : itGroups.map((group) => ({
          name: group.name,
          goal: 'flow' as const,
          steps: group.steps,
          helperRefs: [],
          requiresFreshRender: true,
          markerAssertions: [],
          unresolvedMarkerAssertions: [],
        }))

  const globalHasUserEvents =
    helpers.length > 0 ||
    scenarioPlans.some(
      (scenario) =>
        scenario.helperRefs.length > 0 ||
        scenario.steps.some((step) =>
          ['click', 'fill', 'select', 'keyDown'].includes(step.action)
        )
    )

  const helperByName = new Map(helpers.map((helper) => [helper.name, helper]))
  const helperBlocks = helpers
    .map((helper) => ({
      name: helper.name,
      stepLines: buildHelperStepLines(helper, {
        matcherMap,
        scopeDialog: renderTarget?.usesWithin ?? false,
      }),
    }))
    .filter((helper) => helper.stepLines.some((line) => line.trim().length > 0))

  // Build ItBlockTemplate[] from scenario plans
  const itBlocks = scenarioPlans.map((scenario) => {
    const hasUserEvents = scenario.steps.some((s) =>
      ['click', 'fill', 'select', 'keyDown'].includes(s.action)
    )
    const helperRefs = getScenarioHelperRefs(scenario, helpers)
    const helperSteps = helperRefs.flatMap((helperName) => helperByName.get(helperName)?.steps ?? [])
    const helperStepSet = new Set(helperSteps)
    const helperNameByStepId = new Map(
      helperRefs.flatMap((helperName) =>
        (helperByName.get(helperName)?.steps ?? [])
          .filter((step): step is NormalizedStep & { id: string } => Boolean(step.id))
          .map((step) => [step.id, helperName] as const)
      )
    )
    const markerAssertions = selectStrongestMarkerAssertions(scenario.markerAssertions ?? [])
    const markerAssertionsAfterStep = new Map<string, string[]>()
    const markerAssertionsAfterHelper = new Map<string, string[]>()

    for (const markerAssertion of markerAssertions) {
      const renderedAssertion = renderMarkerAssertion(markerAssertion)
      const helperPlacementName =
        markerAssertion.placement.kind === 'after-helper'
          ? markerAssertion.placement.helperName
          : helperNameByStepId.get(markerAssertion.placement.stepId)

      if (helperPlacementName) {
        const existing = markerAssertionsAfterHelper.get(helperPlacementName) ?? []
        existing.push(renderedAssertion)
        markerAssertionsAfterHelper.set(helperPlacementName, existing)
        continue
      }

      const existing = markerAssertionsAfterStep.get(markerAssertion.placement.stepId) ?? []
      existing.push(renderedAssertion)
      markerAssertionsAfterStep.set(markerAssertion.placement.stepId, existing)
    }

    const bodyLines = scenario.steps.flatMap((step) => {
      if (step.action !== 'assert' && helperStepSet.has(step)) {
        return []
      }

      if (step.action === 'navigate') {
        return [stepTemplate({ action: 'navigate', query: '', value: step.target })]
      }

      const query = reconstructQuery(step, { scopeDialog: renderTarget?.usesWithin ?? false })
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
      }

      const matcher = step.action === 'assert' && query ? matcherMap.get(query) : undefined
      const stepLines = [
        stepTemplate({
          action: step.action,
          query: query ?? 'document.body',
          value: step.value,
          matcher,
        }),
      ]

      if (step.id) {
        stepLines.push(...(markerAssertionsAfterStep.get(step.id) ?? []))
      }

      return stepLines
    })

    const stepLines = [
      ...helperRefs.flatMap((helperName) => [
        `await ${helperName}(user)`,
        ...(markerAssertionsAfterHelper.get(helperName) ?? []),
      ]),
      ...bodyLines,
    ]

    return {
      name: scenario.name,
      stepLines,
      hasUserEvents: hasUserEvents || helperRefs.length > 0,
    }
  })

  const imports = importBlock(globalHasUserEvents, importStyle, {
    renderTarget: renderTarget
      ? {
          symbol: renderTarget.symbol,
          importPath: renderTarget.importPath,
        }
      : null,
    needsWithin: renderTarget?.usesWithin ?? false,
  })
  const describeCode = describeBlockMultiIt(title, itBlocks, {
    renderExpression: renderTarget ? `<${renderTarget.symbol} />` : '<App />',
    helpers: helperBlocks,
  })
  const code = `${imports}\n\n${describeCode}\n`

  return {
    code,
    testName: title,
    filePath: outputPath,
    queryResults,
    itGroupCount: itGroups.length,
  }
}
