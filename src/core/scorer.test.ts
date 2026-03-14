import { describe, expect, it } from "vitest";
import { calculateStructureScore, scoreGeneratedTest } from "./scorer.js";

describe("calculateStructureScore", () => {
  it("penalizes placeholder render targets and unresolved boundary warnings", () => {
    const baseline = `
describe('example flow', () => {
  it('completes an example flow', async () => {
    render(<FeatureModule />)
  })
})
`;

    const placeholder = `
// taro-boundary-warning: Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.
describe('example flow', () => {
  it('completes an example flow', async () => {
    render(<App />)
  })
})
`;

    expect(calculateStructureScore(placeholder)).toBeLessThan(
      calculateStructureScore(baseline)
    );
  });
});

describe("scoreGeneratedTest", () => {
  it("adds deterministic low-confidence signals, reasons, and blockers for draft output", () => {
    const draft = `
// taro-boundary-warning: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.
describe('example flow', () => {
  it('completes an example flow', async () => {
    render(<App />)
    // taro-query-checkpoint: click step requires manual RTL query recovery
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
})
`;

    const score = scoreGeneratedTest(draft, [
      {
        method: "getByText",
        query: "screen.getByText('Saved')",
        quality: "good",
      },
    ]);

    expect(score.requiresReview).toBe(true);
    expect(score.signals.queryCheckpointCount).toBe(1);
    expect(score.signals.placeholderRenderTarget).toBe(true);
    expect(score.signals.boundaryWarningCount).toBe(1);
    expect(score.blockers).toEqual([
      "The generated test still renders <App /> instead of a resolved repo target.",
      "Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.",
    ]);
    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    });
    expect(score.markerQualityGate).toEqual({
      status: "pass",
      reason: "no-markers-detected",
      failing: false,
      message: "No semantic markers were detected in this run.",
    });
    expect(score.markerDiagnostics).toEqual({
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
    });
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "query-checkpoints",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "weak-assertions-only",
          impact: "negative",
        }),
      ])
    );
  });

  it("keeps stronger repo-aware output out of draft mode when blockers are absent", () => {
    const stable = `
describe('example flow', () => {
  it('completes an example flow', async () => {
    render(<FeatureModule />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('shows review state', async () => {
    render(<FeatureModule />)
    expect(screen.getByRole('heading', { name: 'Review Example' })).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(stable, [
      {
        method: "getByRole",
        query: "screen.getByRole('status')",
        quality: "excellent",
      },
      {
        method: "getByRole",
        query: "screen.getByRole('heading', { name: 'Review Example' })",
        quality: "excellent",
      },
    ]);

    expect(score.requiresReview).toBe(false);
    expect(score.signals.queryCheckpointCount).toBe(0);
    expect(score.signals.multipleTestBlocks).toBe(true);
    expect(score.blockers).toEqual([]);
    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    });
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "role-queries", impact: "positive" }),
        expect.objectContaining({
          code: "strong-assertions",
          impact: "positive",
        }),
      ])
    );
  });

  it("returns marker coverage and non-failing marker gate defaults when marker context is absent", () => {
    const score = scoreGeneratedTest(
      "test('placeholder', () => expect(true).toBe(true))"
    );

    expect(score.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    });
    expect(score.markerQualityGate).toEqual({
      status: "pass",
      reason: "no-markers-detected",
      failing: false,
      message: "No semantic markers were detected in this run.",
    });
    expect(score.markerDiagnostics).toEqual({
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
    });
  });

  it("marks repo-contract smells as draft blockers even when the suite has multiple tests", () => {
    const draft = `
describe('stock flow', () => {
  const setup = async () => {
    render(<FeatureModule />)
    expect(await screen.findByText('Ready')).toBeDefined()
  }

  const mockState = { shouldFail: false }

  beforeEach(() => {
    resetDataLayerMock()
    save.mockReset()
    mockState.shouldFail = false
  })

  afterEach(() => {
    cleanup()
    document.body.removeAttribute('style')
  })

  it('submits values', async () => {
    await setup()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({ symbol: expect.any(String) })
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('shows review state', async () => {
    render(<FeatureModule />)
    expect(screen.getByRole('heading', { name: 'Review' })).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(draft, [
      {
        method: "findByText",
        query: "screen.findByText('Ready')",
        quality: "good",
      },
      {
        method: "getByRole",
        query: "screen.getByRole('heading', { name: 'Review' })",
        quality: "excellent",
      },
    ]);

    expect(score.requiresReview).toBe(true);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "helper-assertions",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "query-to-be-defined",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "loose-payload-matchers",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "shared-mutable-mock-state",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "mixed-reset-boundary",
          impact: "negative",
        }),
      ])
    );
  });

  it("returns normalized marker coverage and deterministic marker gate metadata when context is provided", () => {
    const withCoverage = scoreGeneratedTest(
      "test('flow', () => expect(true).toBe(true))",
      { markerCoverage: { detected: 4, emitted: 2, unresolved: 2 } }
    );

    expect(withCoverage.markerCoverage).toEqual({
      detected: 4,
      emitted: 2,
      unresolved: 2,
    });
    expect(withCoverage.markerQualityGate).toEqual({
      status: "warn",
      reason: "markers-partially-converted",
      failing: true,
      message:
        "Marker-derived assertions were emitted, but unresolved semantic markers remain.",
    });
    expect(withCoverage.requiresReview).toBe(true);

    const zeroConversion = scoreGeneratedTest(
      "test('flow', () => expect(true).toBe(true))",
      {
        markerCoverage: { detected: 3, emitted: 0, unresolved: 1 },
        markerDiagnostics: { placementCorrections: 1 },
      }
    );

    expect(zeroConversion.markerCoverage).toEqual({
      detected: 3,
      emitted: 0,
      unresolved: 1,
    });
    expect(zeroConversion.markerQualityGate).toEqual({
      status: "warn",
      reason: "zero-marker-conversion",
      failing: true,
      message:
        "Semantic markers were detected, but no marker-derived assertions were emitted.",
    });
    expect(zeroConversion.markerDiagnostics).toEqual({
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 1,
    });
    expect(zeroConversion.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "marker-quality-gate-fail",
          impact: "negative",
        }),
        expect.objectContaining({
          code: "marker-placement-corrections",
          impact: "negative",
        }),
      ])
    );
    expect(zeroConversion.blockers).toContain(
      "QUAL-02 warning: Semantic markers were detected, but no marker-derived assertions were emitted."
    );
    expect(zeroConversion.requiresReview).toBe(true);
  });
});
