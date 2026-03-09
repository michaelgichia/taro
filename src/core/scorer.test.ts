import { describe, expect, it } from 'vitest'
import { calculateStructureScore } from './scorer.js'

describe('calculateStructureScore', () => {
  it('penalizes placeholder render targets and unresolved boundary warnings', () => {
    const baseline = `
describe('sale flow', () => {
  it('saves a sale', async () => {
    render(<SalesModule />)
  })
})
`

    const placeholder = `
// taro-boundary-warning: Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.
describe('sale flow', () => {
  it('saves a sale', async () => {
    render(<App />)
  })
})
`

    expect(calculateStructureScore(placeholder)).toBeLessThan(
      calculateStructureScore(baseline)
    )
  })
})
