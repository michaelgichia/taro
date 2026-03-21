import { describe, expect, it } from "vitest";

import {
  buildHelperStepLines,
  dedupeMarkerAssertions,
  generateStepCode,
  getScenarioHelperRefs,
  getSelectorCheckpoint,
  inferAssertionMatcher,
  reconstructQuery,
  renderMarkerAssertionGroup,
  selectorToQuery,
} from "#core/utils.ts";
import type {
  NormalizedStep,
  PlannedMarkerAssertion,
} from "#types/recording.ts";

function step(overrides: Partial<NormalizedStep> = {}): NormalizedStep {
  return {
    id: "step-1",
    action: "click",
    target: "Save",
    originalType: "click",
    source: "js",
    ...overrides,
  };
}

describe("selectorToQuery", () => {
  it("maps common selectors to RTL queries and falls back for raw CSS", () => {
    expect(selectorToQuery(undefined)).toBe("document.body");
    expect(selectorToQuery("[data-testid='save']")).toBe(
      "screen.getByTestId('save')"
    );
    expect(selectorToQuery("[aria-label='Close']")).toBe(
      "screen.getByLabelText('Close')"
    );
    expect(selectorToQuery("input[type='checkbox']")).toBe(
      "screen.getByRole('checkbox')"
    );
    expect(selectorToQuery("input[type='radio']")).toBe(
      "screen.getByRole('radio')"
    );
    expect(selectorToQuery("select")).toBe("screen.getByRole('combobox')");
    expect(
      selectorToQuery("input[type='password'][placeholder='Secret']")
    ).toContain("screen.getByPlaceholderText('Secret')");
    expect(selectorToQuery("input[type='password']")).toContain(
      "password input has no implicit role"
    );
    expect(selectorToQuery("a[href='/orders']")).toBe(
      "screen.getByRole('link')"
    );
    expect(selectorToQuery("button.primary")).toBe(
      "screen.getByRole('button')"
    );
    expect(selectorToQuery("img[alt='Hero']")).toBe("screen.getByRole('img')");
    expect(selectorToQuery(".css-1234")).toContain("replace with RTL query");
  });

  it("covers aria-labelledby, search, textarea, title, and display-value selectors", () => {
    expect(selectorToQuery("[aria-labelledby='dialog-title']")).toBe(
      "screen.getByLabelText(/* aria-labelledby */ /./)"
    );
    expect(
      selectorToQuery("input[type='search'][placeholder='Search orders']")
    ).toBe("screen.getByPlaceholderText('Search orders')");
    expect(selectorToQuery("input[type='search']")).toContain(
      "screen.getByRole('searchbox')"
    );
    expect(selectorToQuery("input[type='email'][placeholder='Email']")).toBe(
      "screen.getByPlaceholderText('Email')"
    );
    expect(selectorToQuery("textarea")).toContain(
      "screen.getByRole('textbox')"
    );
    expect(selectorToQuery("[title='Preview']")).toBe(
      "screen.getByTitle('Preview')"
    );
    expect(selectorToQuery("[value='INV-001']")).toBe(
      "screen.getByDisplayValue('INV-001')"
    );
  });
});

describe("reconstructQuery and selector checkpoints", () => {
  it("rebuilds dialog-scoped, recovered, assert, selector, and text queries", () => {
    expect(
      reconstructQuery(step({ action: "click", target: "Save" }), {
        scopeDialog: true,
      })
    ).toContain("within(screen.getByRole('dialog'))");

    expect(
      reconstructQuery(
        step({
          metadata: {
            query: {
              method: "getByRole",
              queryRoot: "screen",
              role: "button",
              target: "Save",
              raw: "screen.getByRole('button', { name: 'Save' })",
            },
          },
        })
      )
    ).toBe("screen.getByRole('button', { name: 'Save' })");

    expect(
      reconstructQuery(
        step({
          action: "assert",
          target: "Save",
          metadata: {
            query: {
              method: "getByRole",
              queryRoot: "screen",
              role: "button",
              target: "Save",
            },
          },
        })
      )
    ).toBe("screen.getByRole('button', { name: 'Save' })");

    expect(
      reconstructQuery(
        step({
          action: "assert",
          originalType: "getByRole",
          target: "button",
          metadata: {
            query: {
              method: "getByRole",
              queryRoot: "screen",
              role: "button",
              target: "button",
            },
          },
        })
      )
    ).toBe("screen.getByRole('button')");

    expect(
      reconstructQuery(step({ source: "json", target: "[data-testid='save']" }))
    ).toBe("screen.getByTestId('save')");
    expect(
      reconstructQuery(step({ source: "js", target: ".css-123" }))
    ).toBeUndefined();
    expect(reconstructQuery(step({ target: "$42.00" }))).toBe(
      "screen.getByText('$42.00')"
    );
  });

  it("returns selector checkpoints for unresolved selectors and unsupported JS selectors", () => {
    expect(
      getSelectorCheckpoint(
        step({
          metadata: {
            selectorResolution: {
              status: "unresolved",
              reason: "selector-not-found",
              selector: { selector: "#missing" },
            },
          } as never,
        })
      )
    ).toEqual({ reason: "selector-not-found", selector: "#missing" });

    expect(
      getSelectorCheckpoint(
        step({ source: "js", target: "#radix-foo .css-123:nth-of-type(2)" })
      )
    ).toEqual(
      expect.objectContaining({
        selector: "#radix-foo .css-123:nth-of-type(2)",
      })
    );
  });

  it("covers default query reconstruction and selector checkpoint fallbacks", () => {
    expect(reconstructQuery(step({ target: undefined }))).toBe("document.body");
    expect(
      reconstructQuery(
        step({
          action: "assert",
          originalType: "getByText",
          target: "Ada's order",
          metadata: {
            query: {
              method: "getByText",
              queryRoot: "document",
              target: "Ada's order",
            },
          },
        })
      )
    ).toBe("screen.getByText('Ada\\'s order')");
    expect(
      getSelectorCheckpoint(step({ source: "json", target: "Save" }))
    ).toBeNull();
  });

  it("drops empty recovered queries, skips helper steps with no fallback, and dedupes after-helper markers", () => {
    expect(
      reconstructQuery(step({ metadata: { query: { raw: "" } } as never }))
    ).toBe("screen.getByText('Save')");

    expect(
      buildHelperStepLines(
        {
          name: "openDialog",
          purpose: "Open dialog",
          assertionPolicy: "sync-only",
          steps: [
            step({
              action: "click",
              source: "js",
              target: ".css-only-selector",
            }),
          ],
        },
        { matcherMap: new Map(), scopeDialog: false }
      )[0]
    ).toContain("taro-query-checkpoint");

    expect(
      dedupeMarkerAssertions([
        {
          stepId: "a",
          placement: {
            kind: "after-helper",
            helperName: "setupDialog",
            stepId: "step-1",
          },
          assertion: {
            queryExpression: "screen.getByText('Saved')",
            matcher: ".toBeVisible()",
          },
        },
        {
          stepId: "b",
          placement: {
            kind: "after-helper",
            helperName: "setupDialog",
            stepId: "step-1",
          },
          assertion: {
            queryExpression: "screen.getByText('Saved')",
            matcher: ".toBeVisible()",
          },
        },
      ])
    ).toHaveLength(1);
  });

  it("covers role descriptor fallbacks and heading selectors", () => {
    expect(selectorToQuery("h2.page-title")).toBe(
      "screen.getByRole('heading')"
    );
    expect(
      reconstructQuery(
        step({
          action: "assert",
          originalType: "getByRole",
          target: "Save",
          metadata: {
            query: { method: "getByRole", queryRoot: "screen", target: "Save" },
          },
        })
      )
    ).toBe("screen.getByRole('Save')");
    expect(
      reconstructQuery(
        step({
          action: "assert",
          target: "button",
          metadata: {
            query: {
              method: "getByRole",
              queryRoot: "screen",
              target: "button",
              role: "button",
            },
          },
        })
      )
    ).toBe("screen.getByRole('button')");
  });

  it("returns raw screen query targets without rebuilding them", () => {
    expect(
      reconstructQuery(
        step({ target: "screen.getByRole('button', { name: 'Save' })" })
      )
    ).toBe("screen.getByRole('button', { name: 'Save' })");
  });

  it("falls back when exact query descriptors are unsupported and reads selector descriptors from metadata", () => {
    expect(
      reconstructQuery(
        step({
          action: "assert",
          target: "Preview",
          metadata: {
            query: {
              method: "getByTitle",
              queryRoot: "screen",
              target: "Preview",
            },
          },
        })
      )
    ).toBe("screen.getByTitle('Preview')");

    expect(
      reconstructQuery(
        step({
          action: "assert",
          target: "Save",
          metadata: {
            query: {
              method: "getByTestId",
              queryRoot: "screen",
              target: "save-button",
            },
          },
        })
      )
    ).toBe("screen.getByText('Save')");

    expect(
      getSelectorCheckpoint(
        step({
          source: "js",
          target: "Save",
          metadata: { selector: { selector: "#save-button" } } as never,
        })
      )
    ).toEqual({
      reason:
        "No trustworthy RTL query evidence was recovered for this selector.",
      selector: "#save-button",
    });
  });
});

describe("step rendering helpers", () => {
  it("renders action and assertion steps across the supported branches", () => {
    expect(
      generateStepCode(
        step({ action: "navigate", target: "http://localhost:3000" })
      )
    ).toContain("// navigate: http://localhost:3000");
    expect(
      generateStepCode(
        step({ action: "fill", target: "Email", value: "user@example.com" })
      )
    ).toContain("await user.type");
    expect(
      generateStepCode(
        step({ action: "select", target: "Role", value: "admin" })
      )
    ).toContain("await user.selectOptions");
    expect(
      generateStepCode(step({ action: "assert", target: "Saved" }))
    ).toContain("expect(");
    expect(
      generateStepCode(step({ action: "unknown", target: "noop" }))
    ).toContain("TODO");
  });

  it("deduplicates and groups marker assertions and infers appropriate matchers", () => {
    const assertions: PlannedMarkerAssertion[] = [
      {
        stepId: "a",
        placement: { kind: "after-step", stepId: "step-1" },
        assertion: {
          queryExpression: "screen.getByText('Saved')",
          matcher: ".toBeVisible()",
        },
      },
      {
        stepId: "b",
        placement: { kind: "after-step", stepId: "step-1" },
        assertion: {
          queryExpression: "screen.getByText('Saved')",
          matcher: ".toBeVisible()",
        },
      },
    ];

    expect(dedupeMarkerAssertions(assertions)).toHaveLength(1);
    expect(
      inferAssertionMatcher(
        step({ action: "assert" }),
        "screen.getByText('Dialog opened')"
      )
    ).toBe(".toBeVisible()");
    expect(
      inferAssertionMatcher(step({ action: "assert" }), "document.body")
    ).toBe(".toBeInTheDocument()");

    expect(
      buildHelperStepLines(
        {
          name: "openDialog",
          code: ["const openDialog = async () => {}"],
          steps: [
            step({ action: "navigate", target: "http://localhost:3000" }),
          ],
        } as never,
        { matcherMap: new Map(), scopeDialog: false }
      )
    ).toEqual(["// navigate: http://localhost:3000"]);

    expect(
      renderMarkerAssertionGroup([
        {
          stepId: "a",
          placement: { kind: "after-step", stepId: "step-1" },
          assertion: {
            queryExpression: "screen.getByText('Saved')",
            matcher: ".toBeVisible()",
          },
        },
      ]).lines[0]
    ).toContain("screen.getByText('Saved')");
  });

  it("covers helper fallback refs, assertion-only helper steps, and multi-assertion marker groups", () => {
    const sharedStep = step({
      id: "step-shared",
      action: "click",
      target: "Open Dialog",
    });
    const helper = {
      name: "openDialog",
      code: ["const openDialog = async () => {}"],
      steps: [
        step({ action: "assert", target: "Dialog opened" }),
        step({ source: "js", action: "click", target: "#missing-selector" }),
        sharedStep,
      ],
    } as never;

    expect(
      getScenarioHelperRefs(
        {
          name: "scenario",
          goal: "flow",
          steps: [sharedStep],
          helperRefs: [],
          requiresFreshRender: true,
        } as never,
        [helper]
      )
    ).toEqual(["openDialog"]);

    expect(
      buildHelperStepLines(helper, {
        matcherMap: new Map(),
        scopeDialog: false,
      })
    ).toEqual(
      expect.arrayContaining([
        "// synchronization left to the scenario body: Dialog opened",
        expect.stringContaining("taro-query-checkpoint"),
      ])
    );

    expect(renderMarkerAssertionGroup([])).toEqual({
      lines: [],
      usedWaitFor: false,
    });
    expect(
      renderMarkerAssertionGroup([
        {
          stepId: "a",
          placement: { kind: "after-step", stepId: "step-1" },
          assertion: {
            queryExpression: "screen.getByText('Saved')",
            matcher: ".toBeVisible()",
          },
        },
        {
          stepId: "b",
          placement: { kind: "after-step", stepId: "step-2" },
          assertion: {
            queryExpression: "screen.getByText('Done')",
            matcher: ".toBeVisible()",
          },
        },
      ] as PlannedMarkerAssertion[])
    ).toEqual(
      expect.objectContaining({
        usedWaitFor: true,
        lines: [expect.stringContaining("waitFor")],
      })
    );

    expect(
      inferAssertionMatcher(step({ action: "click" }), "document.body")
    ).toBeUndefined();
    expect(
      inferAssertionMatcher(
        step({ action: "assert" }),
        "document.body",
        ".toHaveTextContent()"
      )
    ).toBe(".toHaveTextContent()");
  });
});
