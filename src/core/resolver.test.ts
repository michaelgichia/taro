import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildQuery,
  captureVisualState,
  extractDialogState,
  selectMatcher,
} from './resolver.js'
import type { ElementInfo } from '../types/recording.js'

const {
  closeMock,
  evaluateMock,
  gotoMock,
  launchMock,
  locatorFirstMock,
  locatorMock,
  newPageMock,
  pageEvaluateMock,
  screenshotMock,
  titleMock,
} = vi.hoisted(() => {
  const evaluateMock = vi.fn().mockResolvedValue({
    tagName: 'button',
    role: 'button',
    ariaLabel: 'Save',
    ariaLabelledBy: null,
    innerText: 'Save',
    value: undefined,
    type: undefined,
    placeholder: null,
    isPresent: true,
  })
  const locatorFirstMock = vi.fn()
  const locatorMock = vi.fn(() => ({
    first: locatorFirstMock,
    evaluate: evaluateMock,
  }))
  locatorFirstMock.mockReturnValue({
    evaluate: evaluateMock,
  })

  const gotoMock = vi.fn().mockResolvedValue(undefined)
  const titleMock = vi.fn().mockResolvedValue('Checkout Dialog')
  const screenshotMock = vi.fn().mockResolvedValue(undefined)
  const pageEvaluateMock = vi.fn().mockResolvedValue({
    role: 'dialog',
    title: 'Checkout Dialog',
    description: 'Confirm the purchase',
    actions: ['Cancel', 'Confirm'],
    isOpen: true,
  })
  const newPageMock = vi.fn().mockResolvedValue({
    goto: gotoMock,
    locator: locatorMock,
    title: titleMock,
    screenshot: screenshotMock,
    evaluate: pageEvaluateMock,
  })
  const closeMock = vi.fn().mockResolvedValue(undefined)
  const launchMock = vi.fn().mockResolvedValue({
    newPage: newPageMock,
    close: closeMock,
  })

  return {
    closeMock,
    evaluateMock,
    gotoMock,
    launchMock,
    locatorFirstMock,
    locatorMock,
    newPageMock,
    pageEvaluateMock,
    screenshotMock,
    titleMock,
  }
})

vi.mock('playwright', () => ({
  chromium: {
    launch: launchMock,
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

beforeEach(() => {
  evaluateMock.mockResolvedValue({
    tagName: 'button',
    role: 'button',
    ariaLabel: 'Save',
    ariaLabelledBy: null,
    innerText: 'Save',
    value: undefined,
    type: undefined,
    placeholder: null,
    isPresent: true,
  })
  pageEvaluateMock.mockResolvedValue({
    role: 'dialog',
    title: 'Checkout Dialog',
    description: 'Confirm the purchase',
    actions: ['Cancel', 'Confirm'],
    isOpen: true,
  })
  titleMock.mockResolvedValue('Checkout Dialog')
  screenshotMock.mockResolvedValue(undefined)
  gotoMock.mockResolvedValue(undefined)
  launchMock.mockClear()
  newPageMock.mockClear()
  locatorMock.mockClear()
  locatorFirstMock.mockClear()
  evaluateMock.mockClear()
  pageEvaluateMock.mockClear()
  titleMock.mockClear()
  screenshotMock.mockClear()
  gotoMock.mockClear()
  closeMock.mockClear()
})

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

describe('captureVisualState', () => {
  it('returns structured visual state with screenshot metadata', async () => {
    const result = await captureVisualState('http://localhost:3000', {
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
    })

    expect(result).toEqual(
      expect.objectContaining({
        dialog: expect.objectContaining({
          role: 'dialog',
          title: 'Checkout Dialog',
        }),
        element: expect.objectContaining({
          role: 'button',
          innerText: 'Save',
        }),
        pageTitle: 'Checkout Dialog',
        reason: 'dialog-detected',
        screenshotPath: '/tmp/taro-visual/Checkout-Dialog.png',
        selector: '#save',
        url: 'http://localhost:3000',
      })
    )
    expect(screenshotMock).toHaveBeenCalledWith({
      path: '/tmp/taro-visual/Checkout-Dialog.png',
      fullPage: true,
    })
  })

  it('returns null when capture fails', async () => {
    gotoMock.mockRejectedValueOnce(new Error('boom'))

    const result = await captureVisualState('http://localhost:3000', {
      reason: 'dialog-detected',
      selector: '#save',
    })

    expect(result).toBeNull()
    expect(closeMock).toHaveBeenCalled()
  })
})

describe('extractDialogState', () => {
  it('returns dialog information from the page', async () => {
    const page = await newPageMock()
    const state = await extractDialogState(page as any)

    expect(state).toEqual({
      role: 'dialog',
      title: 'Checkout Dialog',
      description: 'Confirm the purchase',
      actions: ['Cancel', 'Confirm'],
      isOpen: true,
    })
  })

  it('returns null when page evaluation fails', async () => {
    pageEvaluateMock.mockRejectedValueOnce(new Error('not available'))
    const page = await newPageMock()

    const state = await extractDialogState(page as any)

    expect(state).toBeNull()
  })
})
