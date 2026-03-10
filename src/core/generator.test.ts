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

    expect(generated.code).toContain('// taro-query-checkpoint: click step requires manual RTL query recovery')
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
    expect(generated.code).not.toContain('taro-query-checkpoint')
    expect(generated.code).toContain("await user.click(screen.getByText('Confirm'))")
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })
})
