/**
 * Code templates for RTL test structure.
 * Functions return string fragments for composing test files.
 */

import type { NormalizedAction } from '../types/recording.js'

export function importBlock(hasUserEvents: boolean, importStyle: 'esm' | 'cjs' = 'esm'): string {
  if (importStyle === 'cjs') {
    const lines = [
      "const { render, screen } = require('@testing-library/react')",
      "require('@testing-library/jest-dom')",
    ]
    if (hasUserEvents) {
      lines.push("const userEvent = require('@testing-library/user-event')")
    }
    return lines.join('\n')
  }
  // ESM (default)
  const lines = [
    "import { render, screen } from '@testing-library/react'",
    "import '@testing-library/jest-dom'",
  ]
  if (hasUserEvents) {
    lines.push("import userEvent from '@testing-library/user-event'")
  }
  return lines.join('\n')
}

function escapeSingleQuote(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function indentLines(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : ''))
    .join('\n')
}

export interface StepTemplateOptions {
  action: NormalizedAction
  query: string
  value?: string
  matcher?: string // context-aware matcher, e.g. '.toHaveValue()', '.toBeChecked()'
  checkpoint?: {
    reason: string
    selector: string
  }
}

function sanitizeCommentText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function stepTemplate(opts: StepTemplateOptions): string {
  const { action, query, value = '' } = opts
  const escapedValue = escapeSingleQuote(value)

  if (opts.checkpoint) {
    return [
      `// taro-query-checkpoint: ${action} step requires manual RTL query recovery`,
      `// selector: ${sanitizeCommentText(opts.checkpoint.selector)}`,
      `// reason: ${sanitizeCommentText(opts.checkpoint.reason)}`,
      '// TODO: replace this checkpoint with a trustworthy RTL query before keeping the generated test',
    ].join('\n')
  }

  switch (action) {
    case 'click':
      return `await user.click(${query})`

    case 'fill':
      return [
        `await user.clear(${query})`,
        `await user.type(${query}, '${escapedValue}')`,
      ].join('\n')

    case 'select':
      return `await user.selectOptions(${query}, '${escapedValue}')`

    case 'scroll':
      return `${query}.scrollIntoView()`

    case 'assert':
      return `expect(${query})${opts.matcher ?? '.toBeInTheDocument()'}`

    case 'navigate':
      return `// navigate: ${value || query}`

    case 'keyDown':
      return `await user.keyboard('${escapedValue}')`

    case 'unknown':
    default:
      return `// TODO: unsupported step — original selector: ${query}`
  }
}

export function describeBlock(
  name: string,
  bodyLines: string[],
  hasUserEvents: boolean
): string {
  const body = bodyLines.join('\n')
  const indented = indentLines(body, 4)
  const setupLine = hasUserEvents ? `    const user = userEvent.setup()\n` : ''
  return [
    `describe('${escapeSingleQuote(name)}', () => {`,
    `  it('should complete the recorded flow', async () => {`,
    `${setupLine}`,
    indented,
    `  })`,
    `})`,
  ].join('\n')
}

export interface ItBlockTemplate {
  name: string
  stepLines: string[]
  hasUserEvents: boolean
}

export function describeBlockMultiIt(
  name: string,
  itBlocks: ItBlockTemplate[]
): string {
  const escapedName = escapeSingleQuote(name)
  const blocks = itBlocks.map((block) => {
    const setup = block.hasUserEvents
      ? `    const user = userEvent.setup()\n`
      : ''
    const indented = indentLines(block.stepLines.join('\n'), 4)
    return [
      `  it('${escapeSingleQuote(block.name)}', async () => {`,
      `    render(<App />)`,
      setup,
      indented,
      `  })`,
    ].join('\n')
  })

  return [`describe('${escapedName}', () => {`, ...blocks, `})`].join('\n')
}
