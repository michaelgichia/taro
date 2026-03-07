import { describe, expect, it } from 'vitest'
import { generateTestFromGroups } from './generator.js'
import { verifySyntax } from './verifier.js'

describe('generateTestFromGroups', () => {
  it('reconstructs valid RTL queries for JS-derived steps', () => {
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

    expect(generated.code).toContain("await user.click(screen.getByTestId(")
    expect(generated.code).toContain("expect(screen.getByText('Checkout Dialog'))")
    expect(generated.code).toContain("await user.click(screen.getByText('Confirm'))")
    expect(generated.code).toContain("expect(screen.getByText('Saved'))")
    expect(verifySyntax(generated.code, '/tmp/generated.test.tsx')).toEqual({ valid: true })
  })
})
