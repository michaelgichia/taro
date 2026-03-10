import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureVisualState,
  deriveAccessibleQuery,
  extractDialogState,
  inspectElements,
  resolveSelector,
  selectMatcher,
} from './resolver.js'
import type {
  ElementInfo,
  QueryDescriptor,
  SelectorDescriptor,
} from '../types/recording.js'

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

const selectorDescriptor: SelectorDescriptor = {
  stepId: 'js-step-1',
  selector: '#save',
  selectorKind: 'document.querySelector',
  line: 12,
  raw: "document.querySelector('#save')",
}

const preservedQuery: QueryDescriptor = {
  stepId: 'js-step-1',
  method: 'getByRole',
  queryRoot: 'screen',
  line: 12,
  target: '#save',
  quality: 'excellent',
  raw: "screen.getByRole('button', { name: 'Save' })",
}

function foundInspection(element: ElementInfo) {
  return { status: 'found' as const, element }
}

function missingInspection() {
  return { status: 'selector-not-found' as const }
}

function failedInspection(error: string) {
  return { status: 'inspection-failed' as const, error }
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

describe('deriveAccessibleQuery', () => {
  it('returns getByRole with name when role and accessible name present', () => {
    const result = deriveAccessibleQuery(accessibleButton)
    expect(result?.method).toBe('getByRole')
    expect(result?.quality).toBe('excellent')
    expect(result?.query).toContain("getByRole('button'")
    expect(result?.query).toContain('Save')
  })

  it('returns null when element has no trustworthy accessible query evidence', () => {
    const result = deriveAccessibleQuery(inaccessibleElement)
    expect(result).toBeNull()
  })

  it('uses getByLabelText when ariaLabel present but no implied role', () => {
    const labeledDiv: ElementInfo = { ...inaccessibleElement, ariaLabel: 'Menu panel' }
    const result = deriveAccessibleQuery(labeledDiv)
    expect(result?.method).toBe('getByLabelText')
    expect(result?.quality).toBe('excellent')
  })
})

describe('resolveSelector', () => {
  it('preserves recorder query evidence before attempting selector inspection', async () => {
    const inspect = vi.fn().mockResolvedValue(foundInspection(accessibleButton))

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      preservedQuery,
      inspect,
    })

    expect(result).toEqual({
      status: 'resolved',
      outcome: 'preserved-query',
      source: 'baseline',
      stepId: 'js-step-1',
      selector: selectorDescriptor,
      url: 'http://localhost:3000',
      query: preservedQuery,
      warnings: [],
    })
    expect(inspect).not.toHaveBeenCalled()
  })

  it('returns an accessible live-dom query when inspection provides trustworthy evidence', async () => {
    const inspect = vi.fn().mockResolvedValue(foundInspection(accessibleButton))

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        outcome: 'accessible-query',
        source: 'live-dom',
        stepId: 'js-step-1',
        selector: selectorDescriptor,
        url: 'http://localhost:3000',
        query: expect.objectContaining({
          method: 'getByRole',
          quality: 'excellent',
          raw: "screen.getByRole('button', { name: 'Save' })",
        }),
        inspectedElement: expect.objectContaining({
          role: 'button',
          innerText: 'Save',
        }),
        warnings: [],
      })
    )
  })

  it('returns no-url unresolved state when no URL is available', async () => {
    const result = await resolveSelector(selectorDescriptor)
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'no-url',
        stepId: 'js-step-1',
        selector: selectorDescriptor,
      })
    )
    expect(result.reason).toContain('No recorded URL')
    expect('query' in result).toBe(false)
  })

  it('returns selector-inaccessible instead of inventing a getByTestId query', async () => {
    const inspect = vi.fn().mockResolvedValue(foundInspection(inaccessibleElement))

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'selector-inaccessible',
        stepId: 'js-step-1',
        selector: selectorDescriptor,
      })
    )
    expect(result.reason).toContain('trustworthy accessible query evidence')
    expect('query' in result).toBe(false)
  })

  it('returns selector-not-found when the inspected page does not contain the selector', async () => {
    const inspect = vi.fn().mockResolvedValue(missingInspection())

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'selector-not-found',
        stepId: 'js-step-1',
        selector: selectorDescriptor,
      })
    )
  })

  it('returns inspection-failed when Playwright inspection fails', async () => {
    const inspect = vi.fn().mockResolvedValue(failedInspection('browser blocked'))

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'inspection-failed',
        inspectionError: 'browser blocked',
      })
    )
  })

  it('captures thrown inspection errors as unresolved results', async () => {
    const inspect = vi.fn().mockRejectedValue(new Error('navigation timeout'))

    const result = await resolveSelector(selectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'inspection-failed',
        inspectionError: 'navigation timeout',
      })
    )
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

describe('inspectElements', () => {
  it('returns null for individual selectors that cannot be inspected and continues', async () => {
    locatorMock.mockImplementation((selector: string) => ({
      first: () => ({
        evaluate:
          selector === '#missing'
            ? vi.fn().mockRejectedValue(new Error('missing selector'))
            : evaluateMock,
      }),
    }))

    const result = await inspectElements('http://localhost:3000', ['#save', '#missing'])

    expect(result.get('#save')).toEqual(accessibleButton)
    expect(result.get('#missing')).toBeNull()
    expect(gotoMock).toHaveBeenCalledWith('http://localhost:3000', {
      timeout: 5000,
      waitUntil: 'domcontentloaded',
    })
    expect(closeMock).toHaveBeenCalled()
  })

  it('returns null for all selectors when page inspection fails', async () => {
    gotoMock.mockRejectedValueOnce(new Error('browser blocked'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await inspectElements('http://localhost:3000', ['#save', '#confirm'])

    expect(result.get('#save')).toBeNull()
    expect(result.get('#confirm')).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      '[taro] QRY-02: Failed to inspect elements on http://localhost:3000: browser blocked'
    )
    expect(closeMock).toHaveBeenCalled()

    warnSpy.mockRestore()
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
