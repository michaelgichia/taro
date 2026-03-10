/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId
 */

import type {
  NormalizedRecording,
  NormalizedStep,
  QueryResult,
  ItGroup,
  QueryQuality,
  SelectorDescriptor,
  SelectorResolutionResult,
} from '../types/recording.js'
import type { ConventionsSchema } from '../types/conventions.js'
import {
  importBlock,
  describeBlock,
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

function reconstructQuery(step: NormalizedStep): string | undefined {
  const target = step.target
  if (!target) {
    return 'document.body'
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
      pc.dim('[taro]') +
        ` ${count} ${method} (${quality}${lineInfo})`
    )
  }
}

export interface GenerateFromGroupsOptions {
  outputPath?: string
  dryRun?: boolean
  conventions?: ConventionsSchema
  queryResults?: QueryResult[]
}

export function generateTestFromGroups(
  title: string,
  itGroups: ItGroup[],
  options: GenerateFromGroupsOptions = {}
): GeneratedTestV3 {
  const { conventions, queryResults = [], outputPath, dryRun } = options
  const importStyle = conventions?.importStyle ?? 'esm'

  // Determine if any it block uses user events
  const globalHasUserEvents = itGroups.some((group) =>
    group.steps.some((s) => ['click', 'fill', 'select', 'keyDown'].includes(s.action))
  )

  // Build query -> matcher map for context-aware assert matchers
  const matcherMap = new Map<string, string>()
  for (const qr of queryResults) {
    if (qr.matcher) {
      matcherMap.set(qr.query, qr.matcher)
    }
  }

  // Build ItBlockTemplate[] from ItGroup[]
  const itBlocks = itGroups.map((group) => {
    const hasUserEvents = group.steps.some((s) =>
      ['click', 'fill', 'select', 'keyDown'].includes(s.action)
    )
    const stepLines = group.steps.map((step) => {
      if (step.action === 'navigate') {
        return stepTemplate({ action: 'navigate', query: '', value: step.target })
      }

      const query = reconstructQuery(step)
      if (!query) {
        const checkpoint = getSelectorCheckpoint(step)
        if (checkpoint) {
          return stepTemplate({
            action: step.action,
            query: '',
            value: step.value,
            checkpoint,
          })
        }
      }

      const matcher = step.action === 'assert' && query ? matcherMap.get(query) : undefined
      return stepTemplate({
        action: step.action,
        query: query ?? 'document.body',
        value: step.value,
        matcher,
      })
    })
    return { name: group.name, stepLines, hasUserEvents }
  })

  const imports = importBlock(globalHasUserEvents, importStyle)
  const describeCode = describeBlockMultiIt(title, itBlocks)
  const code = `${imports}\n\n${describeCode}\n`

  return {
    code,
    testName: title,
    filePath: outputPath,
    queryResults,
    itGroupCount: itGroups.length,
  }
}
