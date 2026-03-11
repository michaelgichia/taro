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

describe('resolveSemanticMarkerAssertion', () => {
  it('prefers role-and-name proof over weaker visible text evidence', () => {
    const result = resolveSemanticMarkerAssertion(
      createSemanticMarkerStep({
        id: 'js-step-2',
        target: 'Review Sale',
        proofSubject: 'heading',
        method: 'getByRole',
        role: 'heading',
        name: 'Review Sale',
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
            target: 'Review Sale',
            raw: "screen.findByRole('heading', { name: 'Review Sale' })",
          }),
          queryExpression: "screen.findByRole('heading', { name: 'Review Sale' })",
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
        target: 'Customer PIN / Name',
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
  it('returns structured visual state with screenshot metadata', async () => {
    const result = await captureVisualState('http://localhost:3000', {
      reason: 'dialog-detected',
      screenshotDir: '/tmp/tayo-visual',
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
        screenshotPath: '/tmp/tayo-visual/Checkout-Dialog.png',
        selector: '#save',
        url: 'http://localhost:3000',
      })
    )
    expect(screenshotMock).toHaveBeenCalledWith({
      path: '/tmp/tayo-visual/Checkout-Dialog.png',
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
