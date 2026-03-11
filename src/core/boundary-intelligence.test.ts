import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeBoundaryIsolation,
  calculateBoundaryIsolationScore,
} from './boundary-intelligence.js'
import { generateTestFromGroups } from './generator.js'

async function readSample(relativePath: string): Promise<string> {
  return readFile(resolve(process.cwd(), relativePath), 'utf-8')
}

describe('analyzeBoundaryIsolation', () => {
  it('flags boundary anti-patterns in the generated AddSaleForm sample', async () => {
    const code = await readSample('sample/AddSaleForm.test.tsx')

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
    const code = await readSample('sample/sample-add-sale-test.tsx')

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
})
