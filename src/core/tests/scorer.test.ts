import { describe, expect, it } from "vitest";

import { calculateStructureScore, scoreGeneratedTest } from "#core/scorer.ts";
import type { ComponentScoreContext } from "#types/score.ts";

function makeComponentContext(
  overrides: Partial<ComponentScoreContext> = {}
): ComponentScoreContext {
  return {
    componentDisplayName: "FeatureModule",
    componentConditionalCount: 0,
    componentEventHandlerCount: 0,
    componentImportReferences: [],
    dynamicImportTargets: [],
    exportedUtilityNames: [],
    highSignalBranchHints: [],
    ...overrides,
  };
}

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

  it("applies branch, fixture, fireEvent, and export penalties when component context is provided", () => {
    const hardcoded = `
describe('profile card', () => {
  it('renders business', () => {
    render(<ProfileCard variant="business" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByText('Business')).toBeVisible()
  })

  it('renders personal', () => {
    render(<ProfileCard variant="personal" />)
    expect(screen.getByText('Personal')).toBeVisible()
  })

  it('renders neutral', () => {
    render(<ProfileCard variant="neutral" />)
    expect(screen.getByText('Neutral')).toBeVisible()
  })
})
`;

    const baseline = `
describe('profile card', () => {
  const renderProfileCard = (overrides: Partial<Props> = {}) =>
    render(<ProfileCard {...BASE_PROPS} {...overrides} />)

  it('renders business', () => {
    renderProfileCard({ variant: 'business' })
    expect(screen.getByText('Business')).toHaveTextContent('Business')
  })

  it('renders personal', () => {
    renderProfileCard({ variant: 'personal' })
    expect(screen.getByText('Personal')).toHaveTextContent('Personal')
  })

  describe('formatStatus', () => {
    it('formats the state', () => {
      expect(formatStatus('open')).toBe('OPEN')
    })
  })
})
`;

    const context = makeComponentContext({
      componentDisplayName: "ProfileCard",
      componentConditionalCount: 2,
      componentEventHandlerCount: 1,
      exportedUtilityNames: ["formatStatus"],
    });

    expect(calculateStructureScore(hardcoded, context)).toBeLessThan(
      calculateStructureScore(baseline, context)
    );
  });
});

describe("scoreGeneratedTest", () => {
  it("adds deterministic draft blockers for placeholder output", () => {
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
    expect(score.signals.presenceAssertionCount).toBe(1);
    expect(score.blockers).toEqual([
      "The generated test still renders <App /> instead of a resolved repo target.",
      "Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.",
    ]);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "query-checkpoints",
          severity: "blocker",
        }),
        expect.objectContaining({
          code: "weak-assertions-only",
          impact: "negative",
        }),
      ])
    );
  });

  it("treats toBeVisible-only suites as neutral presence checks", () => {
    const visibleOnly = `
describe('example flow', () => {
  it('renders the heading', () => {
    render(<FeatureModule />)
    expect(screen.getByRole('heading', { name: 'Review Example' })).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(visibleOnly, [
      {
        method: "getByRole",
        query: "screen.getByRole('heading', { name: 'Review Example' })",
        quality: "excellent",
      },
    ]);

    expect(score.dimensions.assertionSpecificity).toBe(30);
    expect(score.signals.visibilityAssertionCount).toBe(1);
    expect(score.signals.visibilityOnlyTestCount).toBe(1);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "visibility-assertions-only" }),
        expect.objectContaining({ code: "weak-assertions-only" }),
      ])
    );
  });

  it("does not penalize presence assertions when strong assertions are also present", () => {
    const mixed = `
describe('payment form', () => {
  it('shows the amount and success state', () => {
    render(<PaymentForm />)
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })
})
`;

    const score = scoreGeneratedTest(mixed, [
      {
        method: "getByRole",
        query: "screen.getByRole('textbox', { name: 'Amount' })",
        quality: "excellent",
      },
      {
        method: "getByRole",
        query: "screen.getByRole('status')",
        quality: "excellent",
      },
    ]);

    expect(score.dimensions.assertionSpecificity).toBe(80);
    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "weak-assertions-only" }),
      ])
    );
  });

  it("does not flag setup helpers when assertions stay in the test body", () => {
    const stable = `
describe('profile card', () => {
  const setup = () => {
    const renderResult = render(<ProfileCard />)
    return { ...renderResult }
  }

  it('renders the profile name', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Profile' })).toHaveTextContent('Profile')
  })
})
`;

    const score = scoreGeneratedTest(stable, [
      {
        method: "getByRole",
        query: "screen.getByRole('heading', { name: 'Profile' })",
        quality: "excellent",
      },
    ]);

    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "helper-assertions" }),
      ])
    );
  });

  it("renames anonymous asset mocks to incomplete asset mocks", () => {
    const generated = `
vi.mock('public/images/kenya-flag.svg', () => ({
  default: () => <svg aria-hidden="true" />,
}))

describe('OrgCard', () => {
  it('renders the primary UI contract', () => {
    expect(screen.getByText('Business')).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(generated, [
      {
        method: "getByText",
        query: "screen.getByText('Business')",
        quality: "good",
      },
    ]);

    expect(score.requiresReview).toBe(true);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "generic-component-contract" }),
        expect.objectContaining({ code: "incomplete-asset-mock" }),
      ])
    );
    expect(score.dimensions.boundaryIsolation).toBeLessThan(100);
  });

  it("penalizes mocked child components that reimplement prop-driven rendering logic", () => {
    const generated = `
vi.mock('../TaxBreakdownTable', () => ({
  default: vi.fn(({ currencyCode, rows, subtotal, taxAmount, total }) => (
    <section aria-label="Tax breakdown table">
      <p>{rows.map((row) => row.taxCategoryLabel).join(' ; ')}</p>
      <p>{\`\${subtotal} | \${taxAmount} | \${total} | \${currencyCode}\`}</p>
    </section>
  )),
}))

describe('InvoiceTaxBreakdownSection', () => {
  it('passes the mapped tax rows and totals into the breakdown table', () => {
    render(<InvoiceTaxBreakdownSection />)
    expect(screen.getByRole('region', { name: 'Tax breakdown table' })).toBeInTheDocument()
  })
})
`;

    const score = scoreGeneratedTest(generated, [
      {
        method: "getByRole",
        query: "screen.getByRole('region', { name: 'Tax breakdown table' })",
        quality: "good",
      },
    ]);

    expect(score.requiresReview).toBe(true);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "component-mock-reimplementation",
          severity: "blocker",
        }),
      ])
    );
    expect(score.dimensions.boundaryIsolation).toBeLessThanOrEqual(75);
  });

  it("keeps branch coverage expectations as advisory telemetry when component context implies more cases", () => {
    const code = `
describe('feature module', () => {
  it('renders the default state', () => {
    render(<FeatureModule />)
    expect(screen.getByText('Ready')).toHaveTextContent('Ready')
  })
})
`;

    const withoutContext = scoreGeneratedTest(code, [
      {
        method: "getByText",
        query: "screen.getByText('Ready')",
        quality: "good",
      },
    ]);
    const withContext = scoreGeneratedTest(code, {
      ...makeComponentContext({
        componentConditionalCount: 3,
        componentEventHandlerCount: 1,
      }),
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('Ready')",
          quality: "good",
        },
      ],
    });

    expect(withContext.signals.minimumExpectedTestCount).toBe(7);
    expect(withContext.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch-coverage-signal",
          severity: "advisory",
        }),
      ])
    );
    expect(withContext.dimensions.testStructure).toBe(
      withoutContext.dimensions.testStructure
    );
    expect(withContext.blockers).not.toContain(
      expect.stringContaining("component that implies at least 7 test cases")
    );
  });

  it("flags hardcoded fixtures when multiple inline render prop sets are duplicated", () => {
    const code = `
describe('profile card', () => {
  it('renders business', () => {
    render(<ProfileCard variant="business" />)
    expect(screen.getByText('Business')).toBeVisible()
  })

  it('renders personal', () => {
    render(<ProfileCard variant="personal" />)
    expect(screen.getByText('Personal')).toBeVisible()
  })

  it('renders neutral', () => {
    render(<ProfileCard variant="neutral" />)
    expect(screen.getByText('Neutral')).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(code, {
      ...makeComponentContext({ componentDisplayName: "ProfileCard" }),
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('Business')",
          quality: "good",
        },
      ],
    });

    expect(score.signals.duplicatedInlineRenderCount).toBeGreaterThan(1);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "hardcoded-fixture" }),
      ])
    );
  });

  it("treats per-module dynamic placeholders as valid coverage for next/dynamic", () => {
    const generated = `
vi.mock('./ProfileBody', () => ({
  default: () => <div data-testid="taro-dynamic-profile-body" />,
}))

describe('ProfileCard', () => {
  it('renders the admin body placeholder', () => {
    render(<ProfileCard />)
    expect(screen.getByTestId('taro-dynamic-profile-body')).toBeInTheDocument()
  })
})
`;

    const score = scoreGeneratedTest(generated, {
      ...makeComponentContext({
        componentDisplayName: "ProfileCard",
        componentImportReferences: [
          {
            target: "next/dynamic",
            importedNames: ["default"],
            kind: "unknown",
            guardrailReason: null,
          },
        ],
        dynamicImportTargets: ["./ProfileBody"],
      }),
      queryResults: [
        {
          method: "getByTestId",
          query: "screen.getByTestId('taro-dynamic-profile-body')",
          quality: "acceptable",
        },
      ],
    });

    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-dynamic-mock" }),
      ])
    );
  });

  it("flags missing high-signal branch families as review blockers", () => {
    const generated = `
describe('ProfileCard', () => {
  it('renders the main card', () => {
    render(<ProfileCard displayName="Ada" />)
    expect(screen.getByText('Ada')).toBeVisible()
  })
})
`;

    const score = scoreGeneratedTest(generated, {
      componentDisplayName: "ProfileCard",
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('Ada')",
          quality: "good",
        },
      ],
      highSignalBranchHints: [
        {
          family: "display-name-fallback",
          coverageTokens: ["displayName", "legalName"],
        },
        { family: "role-gated-prop-propagation", coverageTokens: ["role"] },
      ],
    });

    expect(score.requiresReview).toBe(true);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source-branch-family-gap",
          severity: "blocker",
          message: expect.stringContaining("role-gated-prop-propagation"),
        }),
      ])
    );
  });

  it("flags brittle prop-shape dynamic dispatchers and duplicate const sources", () => {
    const generated = `
const ORG_ID = 'org-1'
const ORG_ID = 'org-1'

vi.mock('next/dynamic', () => ({
  default: () => (props) => {
    if ('members' in props) return <div />
    if (props.country) return <div />
    return null
  },
}))

describe('OrgPage', () => {
  it('renders the page', () => {
    render(<OrgPage />)
  })
})
`;

    const score = scoreGeneratedTest(generated, []);

    expect(score.requiresReview).toBe(true);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "dynamic-prop-shape-dispatcher" }),
        expect.objectContaining({ code: "duplicate-const-source" }),
      ])
    );
  });

  it("flags overloaded vi.hoisted state bags", () => {
    const generated = `
const {
  ORG_ID,
  ADMIN_ROLE,
  queryState,
  useOrgQueryMock,
  useMembersQueryMock,
  shouldFail,
  resetQueryState,
} = vi.hoisted(() => ({
  ORG_ID: 'org-1',
  ADMIN_ROLE: 'admin',
  queryState: {},
  useOrgQueryMock: vi.fn(),
  useMembersQueryMock: vi.fn(),
  shouldFail: false,
  resetQueryState: () => {},
}))

describe('OrgPage', () => {
  it('renders the page', () => {
    render(<OrgPage />)
  })
})
`;

    const score = scoreGeneratedTest(generated, []);

    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "overloaded-hoisted-state" }),
      ])
    );
  });

  it("adds fireEvent penalties and escalates them when the component has handlers", () => {
    const code = `
describe('profile card', () => {
  it('opens the menu', () => {
    render(<ProfileCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
`;

    const withoutHandlers = scoreGeneratedTest(code, {
      ...makeComponentContext({ componentEventHandlerCount: 0 }),
      queryResults: [
        {
          method: "getByRole",
          query: "screen.getByRole('button', { name: 'Open menu' })",
          quality: "excellent",
        },
      ],
    });
    const withHandlers = scoreGeneratedTest(code, {
      ...makeComponentContext({ componentEventHandlerCount: 2 }),
      queryResults: [
        {
          method: "getByRole",
          query: "screen.getByRole('button', { name: 'Open menu' })",
          quality: "excellent",
        },
      ],
    });

    expect(withHandlers.signals.fireEventCount).toBe(1);
    expect(withHandlers.dimensions.testStructure).toBeLessThan(
      withoutHandlers.dimensions.testStructure
    );
    expect(withHandlers.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "fire-event-usage", weight: 14 }),
      ])
    );
  });

  it("detects missing mocks for runtime boundaries and skips protected UI boundaries", () => {
    const code = `
describe('profile card', () => {
  it('renders the UI', () => {
    render(<ProfileCard />)
    expect(screen.getByText('Business')).toBeInTheDocument()
  })
})
`;

    const score = scoreGeneratedTest(code, {
      ...makeComponentContext({
        componentImportReferences: [
          {
            target: "next/link",
            importedNames: ["default"],
            kind: "unknown",
            guardrailReason: null,
          },
          {
            target: "next/dynamic",
            importedNames: ["default"],
            kind: "unknown",
            guardrailReason: null,
          },
          {
            target: "public/images/kenya-flag.svg",
            importedNames: ["default"],
            kind: "asset",
            guardrailReason: null,
          },
          {
            target: "@/ui/PortalShell",
            importedNames: ["PortalShell"],
            kind: "local-child",
            guardrailReason: "repo-owned-ui-wrapper",
          },
        ],
      }),
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('Business')",
          quality: "good",
        },
      ],
    });

    expect(score.signals.missingMockCount).toBe(3);
    expect(score.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-framework-mock",
          severity: "blocker",
        }),
        expect.objectContaining({
          code: "missing-dynamic-mock",
          severity: "blocker",
        }),
        expect.objectContaining({
          code: "missing-asset-mock",
          severity: "blocker",
        }),
      ])
    );
    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("@/ui/PortalShell"),
        }),
      ])
    );
  });

  it("treats equivalent relative mock targets as satisfying local helper coverage", () => {
    const code = `
vi.mock('../TaxBreakdownTable', () => ({
  default: vi.fn(() => <section aria-label="Tax breakdown table">Tax breakdown table</section>),
}))

describe('InvoiceTaxBreakdownSection', () => {
  it('renders the breakdown table placeholder', () => {
    render(<InvoiceTaxBreakdownSection />)
    expect(screen.getByRole('region', { name: 'Tax breakdown table' })).toHaveTextContent('Tax breakdown table')
  })
})
`;

    const score = scoreGeneratedTest(code, {
      ...makeComponentContext({
        componentImportReferences: [
          {
            target: "./TaxBreakdownTable.tsx",
            importedNames: ["default"],
            kind: "helper",
            guardrailReason: null,
          },
        ],
      }),
      queryResults: [
        {
          method: "getByRole",
          query: "screen.getByRole('region', { name: 'Tax breakdown table' })",
          quality: "good",
        },
      ],
    });

    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-helper-mock" }),
      ])
    );
  });

  it("does not require separate mocks for relative sibling helpers that stay real", () => {
    const code = `
describe('InvoiceAllowancesChargesSection', () => {
  it('renders the editor headings', () => {
    render(<InvoiceAllowancesChargesSection />)
    expect(screen.getByRole('heading', { name: 'Invoice allowances & charges' })).toHaveTextContent('Invoice allowances & charges')
  })
})
`;

    const score = scoreGeneratedTest(code, {
      ...makeComponentContext({
        componentImportReferences: [
          {
            target: "./itemHelpers",
            importedNames: ["createAllowanceChargeWithClientID"],
            kind: "helper",
            guardrailReason: null,
          },
        ],
      }),
      queryResults: [
        {
          method: "getByRole",
          query:
            "screen.getByRole('heading', { name: 'Invoice allowances & charges' })",
          quality: "good",
        },
      ],
    });

    expect(score.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-helper-mock" }),
      ])
    );
  });

  it("flags untested exported utilities unless a standalone describe covers them", () => {
    const missingCoverage = `
describe('PriceCard', () => {
  it('renders the price', () => {
    render(<PriceCard />)
    expect(screen.getByText('$10.00')).toHaveTextContent('$10.00')
  })
})
`;

    const covered = `
describe('PriceCard', () => {
  it('renders the price', () => {
    render(<PriceCard />)
    expect(screen.getByText('$10.00')).toHaveTextContent('$10.00')
  })
})

describe('formatCurrency', () => {
  it('formats cents into a display string', () => {
    expect(formatCurrency(1000)).toBe('$10.00')
  })
})
`;

    const context = makeComponentContext({
      componentDisplayName: "PriceCard",
      exportedUtilityNames: ["formatCurrency"],
    });

    const missingScore = scoreGeneratedTest(missingCoverage, {
      ...context,
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('$10.00')",
          quality: "good",
        },
      ],
    });
    const coveredScore = scoreGeneratedTest(covered, {
      ...context,
      queryResults: [
        {
          method: "getByText",
          query: "screen.getByText('$10.00')",
          quality: "good",
        },
      ],
    });

    expect(missingScore.signals.hasStandaloneUtilityDescribe).toBe(false);
    expect(missingScore.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "untested-exports" }),
      ])
    );
    expect(coveredScore.signals.hasStandaloneUtilityDescribe).toBe(true);
    expect(coveredScore.reasons).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "untested-exports" }),
      ])
    );
  });

  it("returns normalized marker coverage and blocker metadata when context is provided", () => {
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
    expect(zeroConversion.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "marker-quality-gate-fail",
          severity: "blocker",
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

  it("treats fully converted markers as pass and defaults omitted options safely", () => {
    const fullyConverted = scoreGeneratedTest(
      "test('flow', () => expect(true).toBe(true))",
      { markerCoverage: { detected: 2, emitted: 2, unresolved: 0 } }
    );

    expect(fullyConverted.markerQualityGate).toEqual({
      status: "pass",
      reason: "markers-fully-converted",
      failing: false,
      message:
        "All detected semantic markers were converted into marker-derived assertions.",
    });

    const defaulted = scoreGeneratedTest(
      "test('flow', () => expect(true).toBe(true))",
      undefined as unknown as never
    );

    expect(defaulted.markerCoverage).toEqual({
      detected: 0,
      emitted: 0,
      unresolved: 0,
    });
    expect(defaulted.markerDiagnostics).toEqual({
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
    });
  });

  it("flags remaining test-id queries", () => {
    const withTestId = scoreGeneratedTest(
      "test('flow', () => expect(screen.getByTestId('save')).toBeVisible())",
      [
        {
          method: "getByTestId",
          query: "screen.getByTestId('save')",
          quality: "fragile",
        },
      ]
    );

    expect(withTestId.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "testid-queries", impact: "negative" }),
      ])
    );
  });
});
