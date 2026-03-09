import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeBoundaryIsolation,
  calculateBoundaryIsolationScore,
} from './boundary-intelligence.js'

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
})
