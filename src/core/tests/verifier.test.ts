import { describe, expect, it } from 'vitest'

import { verifySyntax } from '#core/verifier.ts'

describe('verifySyntax', () => {
  it('accepts valid TypeScript, TSX, and JSX inputs with extension-aware parser plugins', () => {
    expect(
      verifySyntax(
        `
          export const total: number = 4
          const label = total + 1
        `,
        '/tmp/example.test.ts'
      )
    ).toEqual({ valid: true })

    expect(
      verifySyntax(
        `
          export function Example(): JSX.Element {
            return <button type="button">Save</button>
          }
        `,
        '/tmp/example.test.tsx'
      )
    ).toEqual({ valid: true })

    expect(
      verifySyntax(
        `
          export default function Example() {
            return <div>Ready</div>
          }
        `,
        '/tmp/example.test.js'
      )
    ).toEqual({ valid: true })
  })

  it('returns parser errors for invalid code', () => {
    const brokenTsx = verifySyntax(
      `
        export function Example() {
          return <div>
        }
      `,
      '/tmp/example.test.tsx'
    )

    expect(brokenTsx.valid).toBe(false)
    expect(brokenTsx.error).toBeTypeOf('string')
  })
})
