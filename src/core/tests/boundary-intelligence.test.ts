import { describe, expect, it } from 'vitest'

import {
  analyzeBoundaryIsolation,
  calculateBoundaryIsolationScore,
} from '#core/boundary-intelligence.ts'
import { generateTestFromGroups } from '#core/generator.ts'
import {
  boundarySafeSample,
  boundaryUnsafeSample,
} from '#tests/fixtures/sample-fixtures.ts'

describe('analyzeBoundaryIsolation', () => {
  it('flags boundary anti-patterns in the generated AddSaleForm sample', async () => {
    const code = boundaryUnsafeSample

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'leaf-render-boundary' }),
        expect.objectContaining({ kind: 'inline-hook-mock' }),
        expect.objectContaining({ kind: 'helper-embedded-assertion' }),
        expect.objectContaining({ kind: 'positional-control-selection' }),
      ])
    )
    expect(calculateBoundaryIsolationScore(code)).toBeLessThan(40)
  })

  it('treats the gold-standard repo-aware module sample as boundary-safe', async () => {
    const code = boundarySafeSample

    expect(analyzeBoundaryIsolation(code)).toEqual([])
    expect(calculateBoundaryIsolationScore(code)).toBe(100)
  })

  it('treats repo-aware generated module output as boundary-safe', () => {
    const generated = generateTestFromGroups(
      'Example Flow',
      [
        {
          name: 'complete example flow',
          steps: [
            {
              action: 'click',
              target: 'Open Example Flow',
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
              target: 'Review Example Flow',
              originalType: 'getByText',
              source: 'js',
            },
          ],
        },
      ],
      {
        helpers: [
          {
            name: 'planOpenExampleDialog',
            sourceGroup: 'open example dialog',
            purpose: 'Navigate to the example dialog.',
            assertionPolicy: 'sync-only',
            steps: [
              {
                action: 'click',
                target: 'Open Example Flow',
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
            name: 'complete example flow',
            goal: 'flow',
            steps: [
              {
                action: 'click',
                target: 'Open Example Flow',
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
                target: 'Review Example Flow',
                originalType: 'getByText',
                source: 'js',
              },
            ],
            helperRefs: ['planOpenExampleDialog'],
            requiresFreshRender: true,
          },
        ],
        renderTarget: {
          symbol: 'FeatureModule',
          importPath: './FeatureModule',
          sourceTestFile: 'sample/sample-add-sale-test.tsx',
          helperNames: ['openExampleDialog'],
          usesWithin: true,
        },
      }
    )

    expect(analyzeBoundaryIsolation(generated.code)).toEqual([])
    expect(calculateBoundaryIsolationScore(generated.code)).toBe(100)
  })

  it('flags mocked repo-owned UI wrapper boundaries', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'
      import type { ReactNode } from 'react'

      vi.mock('@/components/library/Modal', () => ({
        Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        DialogContent: ({ children }: { children: ReactNode }) => (
          <div role="dialog">{children}</div>
        ),
      }))

      describe('example', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'protected-ui-boundary-mock' }),
      ])
    )
    expect(calculateBoundaryIsolationScore(code)).toBeLessThan(100)
  })
})
