import { describe, expect, it } from 'vitest'
import { calculateStructureScore, scoreGeneratedTest } from './scorer.js'

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
// tayo-boundary-warning: Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.
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

describe('scoreGeneratedTest', () => {
  it('adds deterministic low-confidence signals, reasons, and blockers for draft output', () => {
    const draft = `
// tayo-boundary-warning: Tayo could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.
describe('sale flow', () => {
  it('saves a sale', async () => {
    render(<App />)
    // tayo-query-checkpoint: click step requires manual RTL query recovery
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
})
`

    const score = scoreGeneratedTest(draft, [
      { method: 'getByText', query: "screen.getByText('Saved')", quality: 'good' },
    ])

    expect(score.requiresReview).toBe(true)
    expect(score.signals.queryCheckpointCount).toBe(1)
    expect(score.signals.placeholderRenderTarget).toBe(true)
    expect(score.signals.boundaryWarningCount).toBe(1)
    expect(score.blockers).toEqual([
      'The generated test still renders <App /> instead of a resolved repo target.',
      'Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.',
    ])
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'query-checkpoints',
          impact: 'negative',
        }),
        expect.objectContaining({
          code: 'weak-assertions-only',
          impact: 'negative',
        }),
      ])
    )
  })

  it('keeps stronger repo-aware output out of draft mode when blockers are absent', () => {
    const stable = `
describe('sale flow', () => {
  it('saves a sale', async () => {
    render(<SalesModule />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('shows review state', async () => {
    render(<SalesModule />)
    expect(screen.getByRole('heading', { name: 'Review Sale' })).toBeVisible()
  })
})
`

    const score = scoreGeneratedTest(stable, [
      { method: 'getByRole', query: "screen.getByRole('status')", quality: 'excellent' },
      {
        method: 'getByRole',
        query: "screen.getByRole('heading', { name: 'Review Sale' })",
        quality: 'excellent',
      },
    ])

    expect(score.requiresReview).toBe(false)
    expect(score.signals.queryCheckpointCount).toBe(0)
    expect(score.signals.multipleTestBlocks).toBe(true)
    expect(score.blockers).toEqual([])
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'role-queries',
          impact: 'positive',
        }),
        expect.objectContaining({
          code: 'strong-assertions',
          impact: 'positive',
        }),
      ])
    )
  })
})
