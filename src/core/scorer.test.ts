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

describe('scoreGeneratedTest', () => {
  it('adds deterministic low-confidence signals, reasons, and blockers for draft output', () => {
    const draft = `
// taro-boundary-warning: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.
describe('sale flow', () => {
  it('saves a sale', async () => {
    render(<App />)
    // taro-query-checkpoint: click step requires manual RTL query recovery
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
    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    })
    expect(score.markerQualityGate).toEqual({
      status: 'pass',
      reason: 'no-markers-detected',
      failing: false,
      message: 'No semantic markers were detected in this run.',
    })
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
    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    })
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

  it('returns marker coverage and non-failing marker gate defaults when marker context is absent', () => {
    const score = scoreGeneratedTest("test('placeholder', () => expect(true).toBe(true))")

    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    })
    expect(score.markerQualityGate).toEqual({
      status: 'pass',
      reason: 'no-markers-detected',
      failing: false,
      message: 'No semantic markers were detected in this run.',
    })
  })

  it('returns normalized marker coverage and deterministic marker gate metadata when context is provided', () => {
    const withCoverage = scoreGeneratedTest("test('flow', () => expect(true).toBe(true))", {
      markerCoverage: {
        detected: 4,
        emitted: 2,
        unresolved: 2,
      },
    })

    expect(withCoverage.markerCoverage).toEqual({
      detected: 4,
      emitted: 2,
      unresolved: 2,
    })
    expect(withCoverage.markerQualityGate).toEqual({
      status: 'pass',
      reason: 'markers-converted',
      failing: false,
      message: 'Marker-derived assertions were emitted for this run.',
    })

    const zeroConversion = scoreGeneratedTest("test('flow', () => expect(true).toBe(true))", {
      markerCoverage: {
        detected: 3,
        emitted: 0,
        unresolved: 1,
      },
    })

    expect(zeroConversion.markerCoverage).toEqual({
      detected: 3,
      emitted: 0,
      unresolved: 1,
    })
    expect(zeroConversion.markerQualityGate).toEqual({
      status: 'fail',
      reason: 'zero-marker-conversion',
      failing: true,
      message: 'Semantic markers were detected, but no marker-derived assertions were emitted.',
    })
    expect(zeroConversion.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'marker-quality-gate-fail',
          impact: 'negative',
        }),
      ])
    )
    expect(zeroConversion.blockers).toContain(
      'QUAL-02 failed: Semantic markers were detected, but no marker-derived assertions were emitted.'
    )
    expect(zeroConversion.requiresReview).toBe(true)
  })
})
