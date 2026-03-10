import { describe, expect, it } from 'vitest'
import { generateTestFromGroups } from './generator.js'
import { verifySyntax } from './verifier.js'
import type { PlannedMarkerAssertion } from '../types/recording.js'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function createMarkerAssertion(params: {
  markerStepId: string
  anchorStepId: string
  placement: PlannedMarkerAssertion['placement']
  proofKind: PlannedMarkerAssertion['assertion']['proofKind']
  queryExpression: string
  proofText: string
}): PlannedMarkerAssertion {
  return {
    markerStepId: params.markerStepId,
    anchorStepId: params.anchorStepId,
    placement: params.placement,
    assertion: {
      markerStepId: params.markerStepId,
      anchorStepId: params.anchorStepId,
      relation: 'precedes',
      proofKind: params.proofKind,
      proofSubject:
        params.proofKind === 'visible-value'
          ? 'concrete-value'
          : params.proofKind === 'label-text' || params.proofKind === 'placeholder-text'
            ? 'field-label'
            : 'heading',
      target: params.proofText,
      proofText: params.proofText,
      query: {
        stepId: params.markerStepId,
        method:
          params.proofKind === 'role-name'
            ? 'findByRole'
            : params.proofKind === 'label-text'
              ? 'findByLabelText'
              : params.proofKind === 'placeholder-text'
                ? 'findByPlaceholderText'
                : 'findByText',
        queryRoot: 'screen',
        raw: params.queryExpression,
        target: params.proofText,
      },
      queryExpression: params.queryExpression,
      expectation: 'visibility',
      matcher: 'toBeVisible',
      sourceContext: {
        originalType: 'dblClick',
      },
    },
  }
}

describe('generateTestFromGroups', () => {
  it('renders unresolved JS selectors as explicit checkpoints instead of fake test ids', () => {
    const generated = generateTestFromGroups(
      'Checkout Dialog Flow',
      [
        {
          name: 'confirm checkout dialog',
          steps: [
            {
              action: 'click',
              target: '.checkout-dialog',
              value: undefined,
              originalType: 'click',
              source: 'js',
              metadata: {
                selector: {
                  stepId: 'js-step-1',
                  selector: '.checkout-dialog',
                  selectorKind: 'document.querySelector',
                },
                selectorResolution: {
                  status: 'unresolved',
                  outcome: 'selector-inaccessible',
                  reason:
                    'Selector .checkout-dialog did not expose trustworthy accessible query evidence.',
                  selector: {
                    stepId: 'js-step-1',
                    selector: '.checkout-dialog',
                    selectorKind: 'document.querySelector',
                  },
                  stepId: 'js-step-1',
                  warnings: [
                    'Selector .checkout-dialog did not expose trustworthy accessible query evidence.',
                  ],
                },
              },
            },
            {
              action: 'assert',
              target: 'Checkout Dialog',
              value: undefined,
              originalType: 'getByText',
              source: 'js',
            },
            {
              action: 'click',
              target: 'Confirm',
              value: undefined,
              originalType: 'click',
              source: 'js',
            },
            {
              action: 'assert',
              target: 'Saved',
              value: undefined,
              originalType: 'getByText',
              source: 'js',
            },
          ],
        },
      ],
      {}
    )

    expect(generated.code).toContain('// tayo-query-checkpoint: click step requires manual RTL query recovery')
    expect(generated.code).toContain('// selector: .checkout-dialog')
    expect(generated.code).not.toContain('screen.getByTestId(')
    expect(generated.code).toContain("expect(screen.getByText('Checkout Dialog'))")
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('prefers preserved recorder query evidence for JS-derived selector steps', () => {
    const generated = generateTestFromGroups(
      'Checkout Dialog Flow',
      [
        {
          name: 'confirm checkout dialog',
          steps: [
            {
              action: 'click',
              target: '.checkout-dialog',
              value: undefined,
              originalType: 'click',
              source: 'js',
              metadata: {
                query: {
                  stepId: 'js-step-1',
                  method: 'getByRole',
                  queryRoot: 'screen',
                  raw: "screen.getByRole('dialog', { name: 'Checkout Dialog' })",
                },
                selectorResolution: {
                  status: 'resolved',
                  outcome: 'preserved-query',
                  source: 'baseline',
                  selector: {
                    stepId: 'js-step-1',
                    selector: '.checkout-dialog',
                    selectorKind: 'document.querySelector',
                  },
                  stepId: 'js-step-1',
                  query: {
                    stepId: 'js-step-1',
                    method: 'getByRole',
                    queryRoot: 'screen',
                    raw: "screen.getByRole('dialog', { name: 'Checkout Dialog' })",
                  },
                  warnings: [],
                },
              },
            },
            {
              action: 'click',
              target: 'Confirm',
              value: undefined,
              originalType: 'click',
              source: 'js',
            },
          ],
        },
      ],
      {}
    )

    expect(generated.code).toContain(
      "await user.click(screen.getByRole('dialog', { name: 'Checkout Dialog' }))"
    )
    expect(generated.code).not.toContain('tayo-query-checkpoint')
    expect(generated.code).toContain("await user.click(screen.getByText('Confirm'))")
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('renders repo-aware imports, helper functions, and scoped queries for supported flows', () => {
    const generated = generateTestFromGroups(
      'Add Sale Flow',
      [
        {
          name: 'save sale',
          steps: [
            {
              action: 'click',
              target: 'Add Sale (Invoice)',
              originalType: 'click',
              source: 'js',
            },
            {
              action: 'click',
              target: 'Continue',
              originalType: 'click',
              source: 'js',
            },
            {
              action: 'assert',
              target: 'Review Sale (Invoice)',
              originalType: 'getByText',
              source: 'js',
            },
          ],
        },
      ],
      {
        helpers: [
          {
            name: 'planOpenSaleDialog',
            sourceGroup: 'open sale dialog',
            purpose: 'Navigate to the add sale dialog.',
            assertionPolicy: 'sync-only',
            steps: [
              {
                action: 'click',
                target: 'Add Sale (Invoice)',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'click',
                target: 'Continue',
                originalType: 'click',
                source: 'js',
              },
            ],
          },
        ],
        scenarios: [
          {
            name: 'save sale',
            goal: 'flow',
            steps: [
              {
                action: 'click',
                target: 'Add Sale (Invoice)',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'click',
                target: 'Continue',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'assert',
                target: 'Review Sale (Invoice)',
                originalType: 'getByText',
                source: 'js',
              },
            ],
            helperRefs: ['planOpenSaleDialog'],
            requiresFreshRender: true,
          },
        ],
        renderTarget: {
          symbol: 'SalesModule',
          importPath: './SalesModule',
          sourceTestFile: 'sample/sample-add-sale-test.tsx',
          helperNames: ['openAddSaleDialog'],
          usesWithin: true,
        },
      }
    )

    expect(generated.code).toContain("import { render, screen, within } from '@testing-library/react'")
    expect(generated.code).toContain("import SalesModule from './SalesModule'")
    expect(generated.code).toContain('const planOpenSaleDialog = async')
    expect(generated.code).toContain("await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^continue$/i }))")
    expect(generated.code).toContain('render(<SalesModule />)')
    expect(generated.code).toContain('await planOpenSaleDialog(user)')
    expect(generated.code).not.toContain('render(<App />)')
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('moves helper-owned marker proof into the scenario body and keeps only the strongest proof per anchor', () => {
    const openDialogStep = {
      id: 'js-step-1',
      action: 'click' as const,
      target: 'screen.getByRole(\'button\', { name: \'Open Sale Dialog\' })',
      originalType: 'click',
      source: 'js' as const,
    }
    const continueStep = {
      id: 'js-step-2',
      action: 'click' as const,
      target: 'screen.getByRole(\'button\', { name: \'Continue\' })',
      originalType: 'click',
      source: 'js' as const,
    }
    const assertStep = {
      id: 'js-step-3',
      action: 'assert' as const,
      target: 'screen.getByText(\'Sale dialog\')',
      originalType: 'assert',
      source: 'js' as const,
    }

    const generated = generateTestFromGroups(
      'Review Sale Flow',
      [
        {
          name: 'review sale',
          steps: [openDialogStep, continueStep, assertStep],
        },
      ],
      {
        helpers: [
          {
            name: 'planOpenSaleDialog',
            sourceGroup: 'open sale dialog',
            purpose: 'Open the sale dialog.',
            assertionPolicy: 'sync-only',
            steps: [openDialogStep, continueStep],
          },
        ],
        scenarios: [
          {
            name: 'review sale',
            goal: 'review',
            steps: [openDialogStep, continueStep, assertStep],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: 'js-marker-1',
                anchorStepId: 'js-step-2',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-2',
                },
                proofKind: 'visible-text',
                queryExpression: "screen.findByText('Review Sale')",
                proofText: 'Review Sale',
              }),
              createMarkerAssertion({
                markerStepId: 'js-marker-2',
                anchorStepId: 'js-step-2',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-2',
                },
                proofKind: 'role-name',
                queryExpression: "screen.findByRole('heading', { name: 'Review Sale' })",
                proofText: 'Review Sale',
              }),
            ],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    )

    expect(generated.code).toContain('await planOpenSaleDialog(user)')
    expect(generated.code).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
    )
    expect(generated.code).not.toContain("expect(await screen.findByText('Review Sale')).toBeVisible()")
    expect(generated.code.indexOf('await planOpenSaleDialog(user)')).toBeLessThan(
      generated.code.indexOf(
        "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
      )
    )
    expect(
      countOccurrences(
        generated.code,
        "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
      )
    ).toBe(1)
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('renders exact text, value, label, and placeholder proof as visibility assertions only', () => {
    const saveStep = {
      id: 'js-step-1',
      action: 'click' as const,
      target: "screen.getByRole('button', { name: 'Save' })",
      originalType: 'click',
      source: 'js' as const,
    }
    const continueStep = {
      id: 'js-step-2',
      action: 'click' as const,
      target: "screen.getByRole('button', { name: 'Continue' })",
      originalType: 'click',
      source: 'js' as const,
    }
    const chooseCustomerStep = {
      id: 'js-step-3',
      action: 'click' as const,
      target: "screen.getByRole('button', { name: 'Choose customer' })",
      originalType: 'click',
      source: 'js' as const,
    }
    const openSearchStep = {
      id: 'js-step-4',
      action: 'click' as const,
      target: "screen.getByRole('button', { name: 'Open search' })",
      originalType: 'click',
      source: 'js' as const,
    }

    const generated = generateTestFromGroups(
      'Marker Proof Flow',
      [
        {
          name: 'marker proof',
          steps: [saveStep, continueStep, chooseCustomerStep, openSearchStep],
        },
      ],
      {
        scenarios: [
          {
            name: 'marker proof',
            goal: 'flow',
            steps: [saveStep, continueStep, chooseCustomerStep, openSearchStep],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: 'js-marker-3',
                anchorStepId: 'js-step-1',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-1',
                },
                proofKind: 'visible-text',
                queryExpression: "screen.findByText('Saved successfully')",
                proofText: 'Saved successfully',
              }),
              createMarkerAssertion({
                markerStepId: 'js-marker-4',
                anchorStepId: 'js-step-2',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-2',
                },
                proofKind: 'visible-value',
                queryExpression: "screen.findByText('KES 4,800.00')",
                proofText: 'KES 4,800.00',
              }),
              createMarkerAssertion({
                markerStepId: 'js-marker-5',
                anchorStepId: 'js-step-3',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-3',
                },
                proofKind: 'label-text',
                queryExpression: "screen.findByLabelText('Customer PIN')",
                proofText: 'Customer PIN',
              }),
              createMarkerAssertion({
                markerStepId: 'js-marker-6',
                anchorStepId: 'js-step-4',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-4',
                },
                proofKind: 'placeholder-text',
                queryExpression: "screen.findByPlaceholderText('Enter customer name')",
                proofText: 'Enter customer name',
              }),
            ],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    )

    expect(generated.code).toContain(
      "expect(await screen.findByText('Saved successfully')).toBeVisible()"
    )
    expect(generated.code).toContain(
      "expect(await screen.findByText('KES 4,800.00')).toBeVisible()"
    )
    expect(generated.code).toContain(
      "expect(await screen.findByLabelText('Customer PIN')).toBeVisible()"
    )
    expect(generated.code).toContain(
      "expect(await screen.findByPlaceholderText('Enter customer name')).toBeVisible()"
    )
    expect(generated.code).not.toContain('toHaveValue(')
    expect(countOccurrences(generated.code, '.toBeVisible()')).toBe(4)
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('keeps mixed marker scenarios truthful by emitting resolved proof only', () => {
    const generated = generateTestFromGroups(
      'Mixed Marker Flow',
      [
        {
          name: 'mixed marker coverage',
          steps: [
            {
              id: 'js-step-1',
              action: 'click',
              target: 'Continue',
              originalType: 'click',
              source: 'js',
            },
          ],
        },
      ],
      {
        scenarios: [
          {
            name: 'mixed marker coverage',
            goal: 'flow',
            steps: [
              {
                id: 'js-step-1',
                action: 'click',
                target: 'Continue',
                originalType: 'click',
                source: 'js',
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: 'js-marker-11',
                anchorStepId: 'js-step-1',
                placement: {
                  kind: 'after-step',
                  stepId: 'js-step-1',
                },
                proofKind: 'role-name',
                queryExpression: "screen.findByRole('heading', { name: 'Review Sale' })",
                proofText: 'Review Sale',
              }),
            ],
            unresolvedMarkerAssertions: [
              {
                status: 'unresolved',
                markerStepId: 'js-marker-12',
                anchorStepId: 'js-step-1',
                reason: 'ambiguous-field-context',
                proofSubject: 'field-label',
                target: 'Customer PIN / Name',
                proofText: 'Customer PIN / Name',
                line: 88,
                sourceContext: {
                  line: 88,
                  originalType: 'dblClick',
                },
              },
            ],
          },
        ],
      }
    )

    expect(generated.code).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
    )
    expect(generated.code).not.toContain("findByLabelText('Customer PIN / Name')")
    expect(generated.code).not.toContain('Customer PIN / Name')
    expect(countOccurrences(generated.code, '.toBeVisible()')).toBe(1)
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })

  it('keeps unresolved marker evidence out of emitted proof code', () => {
    const generated = generateTestFromGroups(
      'Unresolved Marker Flow',
      [
        {
          name: 'unresolved marker',
          steps: [
            {
              id: 'js-step-1',
              action: 'click',
              target: 'Save',
              originalType: 'click',
              source: 'js',
            },
          ],
        },
      ],
      {
        scenarios: [
          {
            name: 'unresolved marker',
            goal: 'flow',
            steps: [
              {
                id: 'js-step-1',
                action: 'click',
                target: 'Save',
                originalType: 'click',
                source: 'js',
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [],
            unresolvedMarkerAssertions: [
              {
                status: 'unresolved',
                markerStepId: 'js-marker-7',
                anchorStepId: 'js-step-1',
                reason: 'ambiguous-field-context',
                proofSubject: 'field-label',
                target: 'Customer PIN / Name',
                proofText: 'Customer PIN / Name',
                sourceContext: {
                  originalType: 'dblClick',
                },
              },
              {
                status: 'unresolved',
                markerStepId: 'js-marker-8',
                anchorStepId: 'js-step-1',
                reason: 'generic-container',
                proofSubject: 'field-label',
                target: 'Details panel',
                proofText: 'Details panel',
                sourceContext: {
                  originalType: 'dblClick',
                },
              },
              {
                status: 'unresolved',
                markerStepId: 'js-marker-9',
                anchorStepId: 'js-step-1',
                reason: 'css-only-evidence',
                proofSubject: 'selector-target',
                target: 'div.css-19bb58m',
                proofText: 'div.css-19bb58m',
                sourceContext: {
                  originalType: 'dblClick',
                },
              },
              {
                status: 'unresolved',
                markerStepId: 'js-marker-10',
                anchorStepId: 'js-step-1',
                reason: 'icon-only-target',
                proofSubject: 'heading',
                target: '+',
                proofText: '+',
                sourceContext: {
                  originalType: 'dblClick',
                },
              },
            ],
          },
        ],
      }
    )

    expect(generated.code).not.toContain("findByLabelText('Customer PIN / Name')")
    expect(generated.code).not.toContain("findByText('Details panel')")
    expect(generated.code).not.toContain("findByText('div.css-19bb58m')")
    expect(generated.code).not.toContain("findByText('+')")
    expect(generated.code).not.toContain('.toBeVisible()')
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })
})
