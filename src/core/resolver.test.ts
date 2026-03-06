import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildQuery, selectMatcher } from './resolver.js'
import type { ElementInfo } from '../types/recording.js'

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnThis(),
          evaluate: vi.fn().mockResolvedValue({
            tagName: 'button',
            role: 'button',
            ariaLabel: 'Save',
            ariaLabelledBy: null,
            innerText: 'Save',
            value: undefined,
            type: undefined,
            placeholder: null,
            isPresent: true,
          }),
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

const accessibleButton: ElementInfo = {
  tagName: 'button',
  role: 'button',
  ariaLabel: 'Save',
  ariaLabelledBy: null,
  innerText: 'Save',
  value: undefined,
  type: undefined,
  placeholder: null,
  isPresent: true,
}

const inaccessibleElement: ElementInfo = {
  tagName: 'div',
  role: null,
  ariaLabel: null,
  ariaLabelledBy: null,
  innerText: '',
  value: undefined,
  type: undefined,
  placeholder: null,
  isPresent: true,
}

const inputElement: ElementInfo = {
  tagName: 'input',
  role: 'textbox',
  ariaLabel: 'Customer Name',
  ariaLabelledBy: null,
  innerText: '',
  value: 'Acme Corp',
  type: 'text',
  placeholder: null,
  isPresent: true,
}

describe('buildQuery', () => {
  it('returns getByRole with name when role and accessible name present', () => {
    const result = buildQuery(accessibleButton, '#some-btn')
    expect(result.method).toBe('getByRole')
    expect(result.quality).toBe('excellent')
    expect(result.query).toContain("getByRole('button'")
    expect(result.query).toContain("Save")
  })

  it('falls back to getByTestId and quality=fragile when element is inaccessible', () => {
    const result = buildQuery(inaccessibleElement, '#radix-_r_8s_-content')
    expect(result.method).toBe('getByTestId')
    expect(result.quality).toBe('fragile')
  })

  it('uses getByLabelText when ariaLabel present but no implied role', () => {
    const labeledDiv: ElementInfo = { ...inaccessibleElement, ariaLabel: 'Menu panel' }
    const result = buildQuery(labeledDiv, '#panel')
    expect(result.method).toBe('getByLabelText')
    expect(result.quality).toBe('excellent')
  })
})

describe('selectMatcher', () => {
  it('returns toHaveValue for fill action on input with value', () => {
    const matcher = selectMatcher(inputElement, 'fill')
    expect(matcher).toContain('toHaveValue')
  })

  it('returns toBeChecked for checkbox', () => {
    const checkbox: ElementInfo = { ...inputElement, type: 'checkbox', value: undefined }
    const matcher = selectMatcher(checkbox, 'assert')
    expect(matcher).toBe('.toBeChecked()')
  })

  it('returns toHaveTextContent for assert on element with innerText', () => {
    const textEl: ElementInfo = { ...inaccessibleElement, innerText: 'Hello World' }
    const matcher = selectMatcher(textEl, 'assert')
    expect(matcher).toContain('toHaveTextContent')
  })

  it('returns toBeInTheDocument as fallback', () => {
    const matcher = selectMatcher(inaccessibleElement, 'assert')
    expect(matcher).toBe('.toBeInTheDocument()')
  })
})
