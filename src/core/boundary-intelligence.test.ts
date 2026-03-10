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

  it('treats the gold-standard sales module sample as boundary-safe', async () => {
    const code = await readSample('sample/sample-add-sale-test.tsx')

    expect(analyzeBoundaryIsolation(code)).toEqual([])
    expect(calculateBoundaryIsolationScore(code)).toBe(100)
  })

  it('treats repo-aware generated module output as boundary-safe', () => {
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

    expect(analyzeBoundaryIsolation(generated.code)).toEqual([])
    expect(calculateBoundaryIsolationScore(generated.code)).toBe(100)
  })
})
