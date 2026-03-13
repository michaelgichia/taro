import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureVisualState,
  deriveAccessibleQuery,
  extractDialogState,
  inspectElements,
  resolveSemanticMarkerAssertion,
  resolveSelector,
  selectMatcher,
} from './resolver.js'
import type {
  ElementInfo,
  NormalizedStep,
  QueryDescriptor,
  SelectorDescriptor,
} from '../types/recording.js'

const { chromiumLaunchMock, pageEvaluateMock } = vi.hoisted(() => {
  const pageEvaluateMock = vi.fn().mockResolvedValue({
    role: 'dialog',
    title: 'Checkout Dialog',
    description: 'Confirm the purchase',
    actions: ['Cancel', 'Confirm'],
    isOpen: true,
  })
  const chromiumLaunchMock = vi.fn()
  return { chromiumLaunchMock, pageEvaluateMock }
})

vi.mock('playwright', () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}))

const accessibleButton: ElementInfo = {
  tagName: 'button',
  role: 'button',
  ariaLabel: 'Save',
  ariaLabelledBy: null,
  labelText: null,
  innerText: 'Save',
  altText: null,
  title: null,
  testId: null,
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
  labelText: null,
  innerText: '',
  altText: null,
  title: null,
  testId: null,
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
  labelText: null,
  innerText: '',
  altText: null,
  title: null,
  testId: null,
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

const unsupportedSelectorDescriptor: SelectorDescriptor = {
  stepId: 'js-step-2',
  selector: '#radix-_r_8s_-content-items > div:nth-of-type(1) input',
  selectorKind: 'document.querySelector',
  line: 18,
  raw: "document.querySelector('#radix-_r_8s_-content-items > div:nth-of-type(1) input')",
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

function createSemanticMarkerStep(options: {
  id: string
  target: string
  proofSubject:
    | 'heading'
    | 'visible-message'
    | 'concrete-value'
    | 'field-label'
    | 'selector-target'
    | 'unknown'
  method?: string
  queryRoot?: 'screen' | 'within' | 'document'
  role?: string
  name?: string
  raw?: string
  selector?: string
  anchorStepId?: string
  relation?: 'follows' | 'same-target' | 'precedes'
  unresolvedReason?: 'missing-anchor' | 'ambiguous-field-context' | 'unsupported-proof-subject'
}): NormalizedStep {
  const {
    id,
    target,
    proofSubject,
    method = 'getByText',
    queryRoot = 'screen',
    role,
    name,
    raw,
    selector,
    anchorStepId = 'js-step-1',
    relation = 'follows',
    unresolvedReason,
  } = options

  const query =
    method === 'none'
      ? undefined
      : {
          stepId: id,
          method,
          queryRoot,
          target,
          ...(role ? { role } : {}),
          ...(name ? { name } : {}),
          raw:
            raw ??
            (method === 'getByRole' && role
              ? `screen.getByRole('${role}', { name: '${name ?? target}' })`
              : `screen.${method}('${target}')`),
        }

  const semanticMarkerCandidate = {
    stepId: id,
    status: unresolvedReason ? ('unresolved' as const) : ('qualified' as const),
    originalGesture: 'dblClick' as const,
    proofSubject,
    target,
    proofText: target,
    sourceContext: {
      line: 12,
      originalType: 'dblClick',
    },
    ...(query ? { query } : {}),
    ...(selector
      ? {
          selector: {
            stepId: id,
            selector,
            selectorKind: 'document.querySelector' as const,
            raw: `document.querySelector('${selector}')`,
          },
        }
      : {}),
    anchor: unresolvedReason
      ? {
          anchorStepId,
          relation,
        }
      : undefined,
  }

  const semanticMarkerLink =
    unresolvedReason || !anchorStepId
      ? undefined
      : {
          markerStepId: id,
          anchorStepId,
          relation,
          proofSubject,
          target,
          proofText: target,
          sourceContext: {
            line: 12,
            originalType: 'dblClick',
          },
          ...(query ? { query } : {}),
          ...(selector
            ? {
                selector: {
                  stepId: id,
                  selector,
                  selectorKind: 'document.querySelector' as const,
                  raw: `document.querySelector('${selector}')`,
                },
              }
            : {}),
        }

  const unresolvedSemanticMarker = unresolvedReason
    ? {
        stepId: id,
        reason: unresolvedReason,
        proofSubject,
        target,
        proofText: target,
        sourceContext: {
          line: 12,
          originalType: 'dblClick',
        },
        ...(query ? { query } : {}),
        ...(selector
          ? {
              selector: {
                stepId: id,
                selector,
                selectorKind: 'document.querySelector' as const,
                raw: `document.querySelector('${selector}')`,
              },
            }
          : {}),
        anchor: anchorStepId
          ? {
              anchorStepId,
              relation,
            }
          : undefined,
      }
    : undefined

  return {
    id,
    action: 'click',
    target,
    originalType: 'dblClick',
    source: 'js',
    semanticMarkerCandidate,
    ...(semanticMarkerLink ? { semanticMarkerLink } : {}),
    ...(unresolvedSemanticMarker ? { unresolvedSemanticMarker } : {}),
    metadata: {
      semanticMarkerCandidate,
      ...(semanticMarkerLink ? { semanticMarkerLink } : {}),
      ...(unresolvedSemanticMarker ? { unresolvedSemanticMarker } : {}),
    },
  }
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

interface MockVisualPageState {
  authSignals?: string[]
  dialog?: {
    actions: string[]
    description: string | null
    isOpen: boolean
    role: 'dialog' | 'alertdialog' | null
    title: string | null
  } | null
  elements?: Record<string, ElementInfo | null>
  matchedLandmarks?: string[]
  title: string
  url: string
}

function createPlaywrightSession(states: MockVisualPageState[]) {
  let currentIndex = 0
  const currentState = () => states[Math.min(currentIndex, states.length - 1)]!

  const page = {
    evaluate: vi.fn(async () => currentState().dialog ?? null),
    goto: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => ({
      first: () => ({
        evaluate: vi.fn(async () => {
          if (selector === 'body') {
            return {
              authSignals: currentState().authSignals ?? [],
              matchedLandmarks: currentState().matchedLandmarks ?? [],
            }
          }

          const element = currentState().elements?.[selector]
          if (!element) {
            throw new Error(`selector not found: ${selector}`)
          }

          return element
        }),
      }),
    })),
    screenshot: vi.fn(async () => undefined),
    title: vi.fn(async () => currentState().title),
    url: vi.fn(() => currentState().url),
    waitForTimeout: vi.fn(async () => {
      if (currentIndex < states.length - 1) {
        currentIndex += 1
      }
    }),
  }

  const context = {
    newPage: vi.fn(async () => page),
    storageState: vi.fn(async () => undefined),
  }

  const browser = {
    close: vi.fn(async () => undefined),
    newContext: vi.fn(async () => context),
  }

  chromiumLaunchMock.mockResolvedValue(browser)

  return { browser, context, page }
}

beforeEach(() => {
  chromiumLaunchMock.mockReset()
  pageEvaluateMock.mockResolvedValue({
    role: 'dialog',
    title: 'Checkout Dialog',
    description: 'Confirm the purchase',
    actions: ['Cancel', 'Confirm'],
    isOpen: true,
  })
  pageEvaluateMock.mockClear()
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

  it('supports title, alt text, and display value as fallback families', () => {
    const titledResult = deriveAccessibleQuery({
      ...inaccessibleElement,
      title: 'Open details',
    })
    const imageResult = deriveAccessibleQuery({
      ...inaccessibleElement,
      tagName: 'img',
      altText: 'Invoice preview',
    })
    const displayValueResult = deriveAccessibleQuery({
      ...inaccessibleElement,
      tagName: 'input',
      value: 'KES 4,800.00',
      type: 'text',
    })

    expect(titledResult?.method).toBe('getByTitle')
    expect(imageResult?.method).toBe('getByAltText')
    expect(displayValueResult?.method).toBe('getByDisplayValue')
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

  it('skips volatile Radix and positional selectors before Playwright inspection', async () => {
    const inspect = vi.fn().mockResolvedValue(foundInspection(accessibleButton))

    const result = await resolveSelector(unsupportedSelectorDescriptor, {
      url: 'http://localhost:3000',
      inspect,
    })
    if (result.status !== 'unresolved') {
      throw new Error('expected unresolved selector result')
    }

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        outcome: 'unsupported-selector',
        selector: unsupportedSelectorDescriptor,
      })
    )
    expect(result.reason).toContain('volatile DOM implementation detail')
    expect(result.reason).toContain('ByRole')
    expect(inspect).not.toHaveBeenCalled()
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

describe('resolveSemanticMarkerAssertion', () => {
  it('prefers role-and-name proof over weaker visible text evidence', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-2',
        target: 'Review Example',
        proofSubject: 'heading',
        method: 'getByRole',
        role: 'heading',
        name: 'Review Example',
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        anchorStepId: 'js-step-1',
        assertion: expect.objectContaining({
          proofKind: 'role-name',
          matcher: 'toBeVisible',
          expectation: 'visibility',
          query: expect.objectContaining({
            method: 'findByRole',
            role: 'heading',
            target: 'Review Example',
            raw: "screen.findByRole('heading', { name: 'Review Example' })",
          }),
          queryExpression: "screen.findByRole('heading', { name: 'Review Example' })",
        }),
      })
    )
  })

  it('resolves exact visible text when stronger accessible evidence is absent', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-3',
        target: 'Saved successfully',
        proofSubject: 'visible-message',
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        assertion: expect.objectContaining({
          proofKind: 'visible-text',
          query: expect.objectContaining({
            method: 'findByText',
            raw: "screen.findByText('Saved successfully')",
          }),
        }),
      })
    )
  })

  it('resolves concrete visible values before any form-context fallback', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-4',
        target: 'KES 4,800.00',
        proofSubject: 'concrete-value',
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        assertion: expect.objectContaining({
          proofKind: 'visible-value',
          query: expect.objectContaining({
            method: 'findByText',
            raw: "screen.findByText('KES 4,800.00')",
          }),
        }),
      })
    )
  })

  it('prefers label-based form fallback before placeholder-based fallback', () => {
    const labelResult = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-5',
        target: 'Customer Name',
        proofSubject: 'field-label',
      })
    )
    const placeholderResult = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-6',
        target: 'Enter customer name',
        proofSubject: 'field-label',
        method: 'getByPlaceholderText',
        raw: "screen.getByPlaceholderText('Enter customer name')",
      })
    )

    expect(labelResult).toEqual(
      expect.objectContaining({
        status: 'resolved',
        assertion: expect.objectContaining({
          proofKind: 'label-text',
          query: expect.objectContaining({
            method: 'findByLabelText',
            raw: "screen.findByLabelText('Customer Name')",
          }),
        }),
      })
    )
    expect(placeholderResult).toEqual(
      expect.objectContaining({
        status: 'resolved',
        assertion: expect.objectContaining({
          proofKind: 'placeholder-text',
          query: expect.objectContaining({
            method: 'findByPlaceholderText',
            raw: "screen.findByPlaceholderText('Enter customer name')",
          }),
        }),
      })
    )
  })

  it('leaves ambiguous field context unresolved instead of guessing a control', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-7',
        target: 'Customer Reference / Name',
        proofSubject: 'field-label',
        unresolvedReason: 'ambiguous-field-context',
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        reason: 'ambiguous-field-context',
        anchorStepId: 'js-step-1',
      })
    )
  })

  it('rejects CSS-only and icon-only marker evidence', () => {
    const cssOnlyResult = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-8',
        target: 'div.css-19bb58m',
        proofSubject: 'selector-target',
        method: 'none',
        selector: 'div.css-19bb58m',
      })
    )
    const iconOnlyResult = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-9',
        target: '+',
        proofSubject: 'heading',
        method: 'getByRole',
        role: 'button',
        name: '+',
      })
    )

    expect(cssOnlyResult).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        reason: 'css-only-evidence',
      })
    )
    expect(iconOnlyResult).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        reason: 'icon-only-target',
      })
    )
  })

  it('rejects hidden implementation detail evidence', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-10',
        target: 'Customer Name',
        proofSubject: 'field-label',
        method: 'getByTestId',
        raw: "screen.getByTestId('customer-name')",
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        reason: 'hidden-evidence',
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
  it('captures visual state with a runtime-owned Playwright browser', async () => {
    const session = createPlaywrightSession([
      {
        dialog: {
          role: 'dialog',
          title: 'Checkout Dialog',
          description: 'Confirm the purchase',
          actions: ['Cancel', 'Confirm'],
          isOpen: true,
        },
        elements: {
          '#save': accessibleButton,
        },
        matchedLandmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000',
      },
    ])

    const result = await captureVisualState('http://localhost:3000', {
      expected: {
        landmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000',
      },
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
    })

    expect(result).toEqual(
      expect.objectContaining({
        finalUrl: 'http://localhost:3000',
        pageTitle: 'Checkout Dialog',
        reason: 'dialog-detected',
        selector: '#save',
        startingPointConfirmed: true,
        status: 'captured',
        url: 'http://localhost:3000',
        warnings: [],
      })
    )
    expect(result?.dialog).toEqual(
      expect.objectContaining({
        title: 'Checkout Dialog',
      })
    )
    expect(result?.element).toEqual(accessibleButton)
    expect(result?.screenshotPath).toBe('/tmp/taro-visual/starting-point.png')
    expect(chromiumLaunchMock).toHaveBeenCalledWith({ headless: true })
    expect(session.context.newPage).toHaveBeenCalledTimes(1)
    expect(session.page.goto).toHaveBeenCalledWith('http://localhost:3000', {
      timeout: 5000,
      waitUntil: 'domcontentloaded',
    })
    expect(session.page.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      path: '/tmp/taro-visual/starting-point.png',
    })
    expect(session.browser.close).toHaveBeenCalledTimes(1)
  })

  it('waits for the recorded page state before capturing the starting screenshot', async () => {
    const session = createPlaywrightSession([
      {
        dialog: null,
        elements: {
          '#save': null,
        },
        matchedLandmarks: [],
        title: 'Loading',
        url: 'http://localhost:3000/loading',
      },
      {
        dialog: {
          role: 'dialog',
          title: 'Add Sale (Invoice)',
          description: 'Create a Kenya sale',
          actions: ['Continue', 'Save'],
          isOpen: true,
        },
        elements: {
          '#save': accessibleButton,
        },
        matchedLandmarks: ['Add Sale (Invoice)'],
        title: 'DigiTax',
        url: 'http://localhost:3000/dashboard?tab=sales',
      },
    ])

    const result = await captureVisualState('http://localhost:3000/dashboard?tab=sales', {
      expected: {
        landmarks: ['Add Sale (Invoice)'],
        title: 'DigiTax',
        url: 'http://localhost:3000/dashboard?tab=sales',
      },
      reason: 'page-context',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
      timeoutMs: 1000,
    })

    expect(result).toEqual(
      expect.objectContaining({
        finalUrl: 'http://localhost:3000/dashboard?tab=sales',
        pageTitle: 'DigiTax',
        screenshotPath: '/tmp/taro-visual/starting-point.png',
        startingPointConfirmed: true,
        status: 'captured',
        warnings: [],
      })
    )
    expect(session.page.waitForTimeout).toHaveBeenCalled()
  })

  it('retries transient Playwright navigation failures before giving up', async () => {
    const session = createPlaywrightSession([
      {
        dialog: {
          role: 'dialog',
          title: 'Checkout Dialog',
          description: 'Confirm the purchase',
          actions: ['Cancel', 'Confirm'],
          isOpen: true,
        },
        elements: {
          '#save': accessibleButton,
        },
        matchedLandmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
    ])

    session.page.goto
      .mockRejectedValueOnce(new Error('page.goto: Timeout 5000ms exceeded.'))
      .mockResolvedValue(undefined)

    const result = await captureVisualState('http://localhost:3000/dashboard', {
      expected: {
        landmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
    })

    expect(result?.status).toBe('captured')
    expect(session.page.goto).toHaveBeenCalledTimes(2)
    expect(session.browser.close).toHaveBeenCalledTimes(2)
  })

  it('treats an interactive redirect away from the expected page as an auth checkpoint even without login copy', async () => {
    const session = createPlaywrightSession([
      {
        dialog: null,
        elements: {
          '#save': null,
        },
        matchedLandmarks: [],
        title: 'DigiTax',
        url: 'http://localhost:3000/',
      },
    ])

    const result = await captureVisualState('http://localhost:3000/dashboard', {
      authRecovery: {
        enabled: true,
        timeoutMs: 1000,
      },
      expected: {
        landmarks: ['Checkout Dialog'],
        title: 'DigiTax',
        url: 'http://localhost:3000/dashboard',
      },
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
      timeoutMs: 1000,
    })

    expect(result).toEqual(
      expect.objectContaining({
        finalUrl: 'http://localhost:3000/',
        screenshotPath: '/tmp/taro-visual/auth-checkpoint.png',
        status: 'auth-recovery-timed-out',
      })
    )
    expect(result?.interrupt?.signals).toEqual(
      expect.arrayContaining([
        'route-mismatch',
        'expected-selector-missing',
        'expected-landmarks-missing',
      ])
    )
  })

  it('recovers auth in interactive runs and persists storage state', async () => {
    const session = createPlaywrightSession([
      {
        authSignals: ['auth-route'],
        dialog: null,
        elements: {
          '#save': null,
        },
        matchedLandmarks: [],
        title: 'Sign In',
        url: 'http://localhost:3000/login',
      },
      {
        dialog: {
          role: 'dialog',
          title: 'Checkout Dialog',
          description: 'Confirm the purchase',
          actions: ['Cancel', 'Confirm'],
          isOpen: true,
        },
        elements: {
          '#save': accessibleButton,
        },
        matchedLandmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
    ])

    const result = await captureVisualState('http://localhost:3000/dashboard', {
      auth: {
        path: '/tmp/playwright/.auth/user.json',
        strategy: 'storageState',
      },
      authRecovery: {
        enabled: true,
        persistedAuthPath: '.taro/playwright/.auth/user.json',
        saveStorageStatePath: '/tmp/playwright/.auth/user.json',
        timeoutMs: 2000,
      },
      expected: {
        landmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
    })

    expect(result?.status).toBe('auth-recovered')
    expect(result?.startingPointConfirmed).toBe(true)
    expect(result?.authRecovery).toEqual(
      expect.objectContaining({
        persistedAuthPath: '.taro/playwright/.auth/user.json',
        status: 'succeeded',
      })
    )
    expect(result?.screenshotPath).toBe('/tmp/taro-visual/starting-point.png')
    expect(chromiumLaunchMock).toHaveBeenCalledWith({ headless: false })
    expect(session.browser.newContext).toHaveBeenCalledWith({
      storageState: '/tmp/playwright/.auth/user.json',
    })
    expect(session.page.waitForTimeout).toHaveBeenCalled()
    expect(session.context.storageState).toHaveBeenCalledWith({
      path: '/tmp/playwright/.auth/user.json',
    })
  })

  it('recovers after an interactive redirect checkpoint without explicit auth cues', async () => {
    const session = createPlaywrightSession([
      {
        dialog: null,
        elements: {
          '#save': null,
        },
        matchedLandmarks: [],
        title: 'DigiTax',
        url: 'http://localhost:3000/',
      },
      {
        dialog: {
          role: 'dialog',
          title: 'Checkout Dialog',
          description: 'Confirm the purchase',
          actions: ['Cancel', 'Confirm'],
          isOpen: true,
        },
        elements: {
          '#save': accessibleButton,
        },
        matchedLandmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
    ])

    const result = await captureVisualState('http://localhost:3000/dashboard', {
      auth: {
        path: '/tmp/playwright/.auth/user.json',
        strategy: 'storageState',
      },
      authRecovery: {
        enabled: true,
        persistedAuthPath: '.taro/playwright/.auth/user.json',
        saveStorageStatePath: '/tmp/playwright/.auth/user.json',
        timeoutMs: 2000,
      },
      expected: {
        landmarks: ['Checkout Dialog'],
        title: 'Checkout Dialog',
        url: 'http://localhost:3000/dashboard',
      },
      reason: 'dialog-detected',
      screenshotDir: '/tmp/taro-visual',
      selector: '#save',
      timeoutMs: 1000,
    })

    expect(result?.status).toBe('auth-recovered')
    expect(result?.startingPointConfirmed).toBe(true)
    expect(result?.interrupt?.signals).toEqual(
      expect.arrayContaining([
        'route-mismatch',
        'expected-selector-missing',
        'expected-landmarks-missing',
      ])
    )
    expect(session.page.waitForTimeout).toHaveBeenCalled()
    expect(session.context.storageState).toHaveBeenCalledWith({
      path: '/tmp/playwright/.auth/user.json',
    })
  })
})

describe('inspectElements', () => {
  it('uses a single Playwright session to inspect multiple selectors', async () => {
    const session = createPlaywrightSession([
      {
        elements: {
          '#confirm': inputElement,
          '#save': accessibleButton,
        },
        title: 'Checkout Dialog',
        url: 'http://localhost:3000',
      },
    ])

    const result = await inspectElements('http://localhost:3000', ['#save', '#confirm'])

    expect(result.get('#save')).toEqual(accessibleButton)
    expect(result.get('#confirm')).toEqual(inputElement)
    expect(chromiumLaunchMock).toHaveBeenCalledWith({ headless: true })
    expect(session.context.newPage).toHaveBeenCalledTimes(1)
    expect(session.browser.close).toHaveBeenCalledTimes(1)
  })
})

describe('extractDialogState', () => {
  it('returns dialog information from the page', async () => {
    const page = { evaluate: pageEvaluateMock }
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
    const page = { evaluate: pageEvaluateMock }

    const state = await extractDialogState(page as any)

    expect(state).toBeNull()
  })
})
