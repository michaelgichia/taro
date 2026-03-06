/**
 * Code templates for RTL test structure.
 * Functions return string fragments for composing test files.
 */

import type { NormalizedAction } from '../types/recording.js'

export function importBlock(hasUserEvents: boolean): string {
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
}

export function stepTemplate(opts: StepTemplateOptions): string {
  const { action, query, value = '' } = opts
  const escapedValue = escapeSingleQuote(value)

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
      return `expect(${query}).toBeInTheDocument()`

    case 'navigate':
      return `// navigate: ${value || query}`

    case 'keyDown':
      return `await user.keyboard('${escapedValue}')`

    case 'unknown':
    default:
      return `// TODO: unsupported step — original selector: ${query}`
  }
}

export function describeBlock(name: string, bodyLines: string[]): string {
  const body = bodyLines.join('\n')
  const indented = indentLines(body, 4)
  return [
    `describe('${escapeSingleQuote(name)}', () => {`,
    `  it('should complete the recorded flow', async () => {`,
    `    const user = userEvent.setup()`,
    ``,
    indented,
    `  })`,
    `})`,
  ].join('\n')
}
