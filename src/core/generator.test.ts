import { describe, expect, it } from 'vitest'
import { generateTestFromGroups } from './generator.js'
import { verifySyntax } from './verifier.js'

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
})
