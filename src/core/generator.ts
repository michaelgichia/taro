/**
 * RTL test code generation
 * Converts NormalizedRecording into valid React Testing Library test code.
 *
 * Query priority (accessibility-first):
 *   getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId
 */

import type { NormalizedRecording, NormalizedStep } from '../types/recording.js'
import {
  importBlock,
  describeBlock,
  stepTemplate,
} from '../templates/test-template.js'

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

function generateStepCode(step: NormalizedStep): string {
  const query = selectorToQuery(step.target)
  return stepTemplate({ action: step.action, query, value: step.value })
}

export function generateTest(
  recording: NormalizedRecording,
  options: GeneratorOptions = {}
): GeneratedTest {
  const testName = recording.title || 'Generated Test'

  const actionableSteps = recording.steps.filter((s) => s.action !== 'unknown')
  const hasUserEvents = actionableSteps.some((s) =>
    ['click', 'fill', 'select', 'keyDown'].includes(s.action)
  )

  const stepLines = recording.steps.map((step) => generateStepCode(step))

  const imports = importBlock(hasUserEvents)
  const describe = describeBlock(testName, stepLines)
  const code = `${imports}\n\n${describe}\n`

  return {
    code,
    testName,
    filePath: options.outputPath,
  }
}
