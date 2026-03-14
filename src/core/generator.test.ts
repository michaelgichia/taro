import { describe, expect, it } from "vitest";
import { generateTestFromGroups, selectorToQuery } from "./generator.js";
import { verifySyntax } from "./verifier.js";
import type { PlannedMarkerAssertion } from "../types/recording.js";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function createMarkerAssertion(params: {
  markerStepId: string;
  anchorStepId: string;
  placement: PlannedMarkerAssertion["placement"];
  proofKind: PlannedMarkerAssertion["assertion"]["proofKind"];
  queryExpression: string;
  proofText: string;
}): PlannedMarkerAssertion {
  return {
    markerStepId: params.markerStepId,
    anchorStepId: params.anchorStepId,
    placement: params.placement,
    assertion: {
      markerStepId: params.markerStepId,
      anchorStepId: params.anchorStepId,
      relation: "precedes",
      proofKind: params.proofKind,
      proofSubject:
        params.proofKind === "visible-value"
          ? "concrete-value"
          : params.proofKind === "label-text" ||
              params.proofKind === "placeholder-text"
            ? "field-label"
            : "heading",
      target: params.proofText,
      proofText: params.proofText,
      query: {
        stepId: params.markerStepId,
        method:
          params.proofKind === "role-name"
            ? "findByRole"
            : params.proofKind === "label-text"
              ? "findByLabelText"
              : params.proofKind === "placeholder-text"
                ? "findByPlaceholderText"
                : "findByText",
        queryRoot: "screen",
        raw: params.queryExpression,
        target: params.proofText,
      },
      queryExpression: params.queryExpression,
      expectation: "visibility",
      matcher: "toBeVisible",
      sourceContext: { originalType: "dblClick" },
    },
  };
}

describe("generateTestFromGroups", () => {
  it("renders unresolved JS selectors as explicit checkpoints instead of fake test ids", () => {
    const generated = generateTestFromGroups(
      "Checkout Dialog Flow",
      [
        {
          name: "confirm checkout dialog",
          steps: [
            {
              action: "click",
              target: ".checkout-dialog",
              value: undefined,
              originalType: "click",
              source: "js",
              metadata: {
                selector: {
                  stepId: "js-step-1",
                  selector: ".checkout-dialog",
                  selectorKind: "document.querySelector",
                },
                selectorResolution: {
                  status: "unresolved",
                  outcome: "selector-inaccessible",
                  reason:
                    "Selector .checkout-dialog did not expose trustworthy accessible query evidence.",
                  selector: {
                    stepId: "js-step-1",
                    selector: ".checkout-dialog",
                    selectorKind: "document.querySelector",
                  },
                  stepId: "js-step-1",
                  warnings: [
                    "Selector .checkout-dialog did not expose trustworthy accessible query evidence.",
                  ],
                },
              },
            },
            {
              action: "assert",
              target: "Checkout Dialog",
              value: undefined,
              originalType: "getByText",
              source: "js",
            },
            {
              action: "click",
              target: "Confirm",
              value: undefined,
              originalType: "click",
              source: "js",
            },
            {
              action: "assert",
              target: "Saved",
              value: undefined,
              originalType: "getByText",
              source: "js",
            },
          ],
        },
      ],
      {}
    );

    expect(generated.code).toContain(
      "// taro-query-checkpoint: click step requires manual RTL query recovery"
    );
    expect(generated.code).toContain("// selector: .checkout-dialog");
    expect(generated.code).not.toContain("screen.getByTestId(");
    expect(generated.code).toContain(
      "expect(screen.getByText('Checkout Dialog'))"
    );
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("prefers preserved recorder query evidence for JS-derived selector steps", () => {
    const generated = generateTestFromGroups(
      "Checkout Dialog Flow",
      [
        {
          name: "confirm checkout dialog",
          steps: [
            {
              action: "click",
              target: ".checkout-dialog",
              value: undefined,
              originalType: "click",
              source: "js",
              metadata: {
                query: {
                  stepId: "js-step-1",
                  method: "getByRole",
                  queryRoot: "screen",
                  raw: "screen.getByRole('dialog', { name: 'Checkout Dialog' })",
                },
                selectorResolution: {
                  status: "resolved",
                  outcome: "preserved-query",
                  source: "baseline",
                  selector: {
                    stepId: "js-step-1",
                    selector: ".checkout-dialog",
                    selectorKind: "document.querySelector",
                  },
                  stepId: "js-step-1",
                  query: {
                    stepId: "js-step-1",
                    method: "getByRole",
                    queryRoot: "screen",
                    raw: "screen.getByRole('dialog', { name: 'Checkout Dialog' })",
                  },
                  warnings: [],
                },
              },
            },
            {
              action: "click",
              target: "Confirm",
              value: undefined,
              originalType: "click",
              source: "js",
            },
          ],
        },
      ],
      {}
    );

    expect(generated.code).toContain(
      "await user.click(screen.getByRole('dialog', { name: 'Checkout Dialog' }))"
    );
    expect(generated.code).not.toContain("taro-query-checkpoint");
    expect(generated.code).toContain(
      "await user.click(screen.getByText('Confirm'))"
    );
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("renders repo-aware imports, helper functions, and scoped queries for supported flows", () => {
    const generated = generateTestFromGroups(
      "Example Flow",
      [
        {
          name: "complete example flow",
          steps: [
            {
              action: "click",
              target: "Open Example Flow",
              originalType: "click",
              source: "js",
            },
            {
              action: "click",
              target: "Continue",
              originalType: "click",
              source: "js",
            },
            {
              action: "assert",
              target: "Review Example Flow",
              originalType: "getByText",
              source: "js",
            },
          ],
        },
      ],
      {
        helpers: [
          {
            name: "planOpenExampleDialog",
            sourceGroup: "open example dialog",
            purpose: "Navigate to the example dialog.",
            assertionPolicy: "sync-only",
            steps: [
              {
                action: "click",
                target: "Open Example Flow",
                originalType: "click",
                source: "js",
              },
              {
                action: "click",
                target: "Continue",
                originalType: "click",
                source: "js",
              },
            ],
          },
        ],
        scenarios: [
          {
            name: "complete example flow",
            goal: "flow",
            steps: [
              {
                action: "click",
                target: "Open Example Flow",
                originalType: "click",
                source: "js",
              },
              {
                action: "click",
                target: "Continue",
                originalType: "click",
                source: "js",
              },
              {
                action: "assert",
                target: "Review Example Flow",
                originalType: "getByText",
                source: "js",
              },
            ],
            helperRefs: ["planOpenExampleDialog"],
            requiresFreshRender: true,
          },
        ],
        renderTarget: {
          symbol: "FeatureModule",
          importPath: "./FeatureModule",
          sourceTestFile: "sample/feature-flow.test.tsx",
          helperNames: ["openExampleDialog"],
          usesWithin: true,
        },
      }
    );

    expect(generated.code).toContain(
      "import { render, screen, within } from '@testing-library/react'"
    );
    expect(generated.code).toContain(
      "import FeatureModule from './FeatureModule'"
    );
    expect(generated.code).toContain("const planOpenExampleDialog = async");
    expect(generated.code).toContain(
      "await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^continue$/i }))"
    );
    expect(generated.code).toContain("render(<FeatureModule />)");
    expect(generated.code).toContain("await planOpenExampleDialog(user)");
    expect(generated.code).not.toContain("render(<App />)");
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("uses setup helpers that return user plus render result for multi-test suites", () => {
    const generated = generateTestFromGroups(
      "Example Flow",
      [
        {
          name: "shows review state",
          steps: [
            {
              action: "assert",
              target: "Review Example Flow",
              originalType: "getByText",
              source: "js",
            },
          ],
        },
      ],
      {
        renderTarget: {
          symbol: "FeatureModule",
          importPath: "./FeatureModule",
          sourceTestFile: "src/FeatureModule.test.tsx",
          helperNames: [],
          usesWithin: false,
        },
        scenarios: [
          {
            name: "shows review state",
            goal: "review",
            steps: [
              {
                action: "assert",
                target: "Review Example Flow",
                originalType: "getByText",
                source: "js",
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    );

    expect(generated.code).toContain("const setup = () => {");
    expect(generated.code).toContain(
      "const renderResult = render(<FeatureModule />)"
    );
    expect(generated.code).toContain("return { ...renderResult }");
    expect(generated.code).toContain("setup()");
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("prefers exact assertion queries and awaits findBy assertions", () => {
    const generated = generateTestFromGroups(
      "Stock Flow",
      [
        {
          name: "shows updated quantity",
          steps: [
            {
              action: "assert",
              target: "Quantity after adjustment 1000",
              originalType: "findByText",
              source: "js",
              metadata: {
                query: {
                  stepId: "js-step-1",
                  method: "findByText",
                  queryRoot: "screen",
                  target: "Quantity after adjustment 1000",
                  raw: "screen.findByText(/Quantity after adjustment\\s*1000/i)",
                },
              },
            },
          ],
        },
      ],
      {}
    );

    expect(generated.code).toContain(
      "expect(await screen.findByText('Quantity after adjustment 1000')).toBeVisible()"
    );
    expect(generated.code).not.toContain(
      "/Quantity after adjustment\\s*1000/i"
    );
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("moves helper-owned marker proof into the scenario body, keeps distinct checkpoints, and dedupes exact repeats", () => {
    const openDialogStep = {
      id: "js-step-1",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Open Example Dialog' })",
      originalType: "click",
      source: "js" as const,
    };
    const continueStep = {
      id: "js-step-2",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Continue' })",
      originalType: "click",
      source: "js" as const,
    };
    const assertStep = {
      id: "js-step-3",
      action: "assert" as const,
      target: "screen.getByText('Example dialog')",
      originalType: "assert",
      source: "js" as const,
    };

    const generated = generateTestFromGroups(
      "Review Example Flow",
      [
        {
          name: "review example",
          steps: [openDialogStep, continueStep, assertStep],
        },
      ],
      {
        helpers: [
          {
            name: "planOpenExampleDialog",
            sourceGroup: "open example dialog",
            purpose: "Open the example dialog.",
            assertionPolicy: "sync-only",
            steps: [openDialogStep, continueStep],
          },
        ],
        scenarios: [
          {
            name: "review example",
            goal: "review",
            steps: [openDialogStep, continueStep, assertStep],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: "js-marker-1",
                anchorStepId: "js-step-2",
                placement: { kind: "after-step", stepId: "js-step-2" },
                proofKind: "visible-text",
                queryExpression: "screen.findByText('Review Example')",
                proofText: "Review Example",
              }),
              createMarkerAssertion({
                markerStepId: "js-marker-2",
                anchorStepId: "js-step-2",
                placement: { kind: "after-step", stepId: "js-step-2" },
                proofKind: "role-name",
                queryExpression:
                  "screen.findByRole('heading', { name: 'Review Example' })",
                proofText: "Review Example",
              }),
              createMarkerAssertion({
                markerStepId: "js-marker-3",
                anchorStepId: "js-step-2",
                placement: { kind: "after-step", stepId: "js-step-2" },
                proofKind: "role-name",
                queryExpression:
                  "screen.findByRole('heading', { name: 'Review Example' })",
                proofText: "Review Example",
              }),
            ],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    );

    expect(generated.code).toContain("await planOpenExampleDialog(user)");
    // 2+ marker assertions after the same step are grouped in a waitFor block with sync queries
    expect(generated.code).toContain("await waitFor(() => {");
    expect(generated.code).toContain(
      "expect(screen.getByRole('heading', { name: 'Review Example' })).toBeVisible()"
    );
    expect(generated.code).toContain(
      "expect(screen.getByText('Review Example')).toBeVisible()"
    );
    expect(
      generated.code.indexOf("await planOpenExampleDialog(user)")
    ).toBeLessThan(generated.code.indexOf("await waitFor(() => {"));
    expect(
      countOccurrences(
        generated.code,
        "expect(screen.getByRole('heading', { name: 'Review Example' })).toBeVisible()"
      )
    ).toBe(1);
    expect(
      countOccurrences(
        generated.code,
        "expect(screen.getByText('Review Example')).toBeVisible()"
      )
    ).toBe(1);
    // waitFor import is included
    expect(generated.code).toContain("waitFor");
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("renders exact text, value, label, and placeholder proof as visibility assertions only", () => {
    const saveStep = {
      id: "js-step-1",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Save' })",
      originalType: "click",
      source: "js" as const,
    };
    const continueStep = {
      id: "js-step-2",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Continue' })",
      originalType: "click",
      source: "js" as const,
    };
    const chooseCustomerStep = {
      id: "js-step-3",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Choose customer' })",
      originalType: "click",
      source: "js" as const,
    };
    const openSearchStep = {
      id: "js-step-4",
      action: "click" as const,
      target: "screen.getByRole('button', { name: 'Open search' })",
      originalType: "click",
      source: "js" as const,
    };

    const generated = generateTestFromGroups(
      "Marker Proof Flow",
      [
        {
          name: "marker proof",
          steps: [saveStep, continueStep, chooseCustomerStep, openSearchStep],
        },
      ],
      {
        scenarios: [
          {
            name: "marker proof",
            goal: "flow",
            steps: [saveStep, continueStep, chooseCustomerStep, openSearchStep],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: "js-marker-3",
                anchorStepId: "js-step-1",
                placement: { kind: "after-step", stepId: "js-step-1" },
                proofKind: "visible-text",
                queryExpression: "screen.findByText('Saved successfully')",
                proofText: "Saved successfully",
              }),
              createMarkerAssertion({
                markerStepId: "js-marker-4",
                anchorStepId: "js-step-2",
                placement: { kind: "after-step", stepId: "js-step-2" },
                proofKind: "visible-value",
                queryExpression: "screen.findByText('USD 4,800.00')",
                proofText: "USD 4,800.00",
              }),
              createMarkerAssertion({
                markerStepId: "js-marker-5",
                anchorStepId: "js-step-3",
                placement: { kind: "after-step", stepId: "js-step-3" },
                proofKind: "label-text",
                queryExpression: "screen.findByLabelText('Customer Reference')",
                proofText: "Customer Reference",
              }),
              createMarkerAssertion({
                markerStepId: "js-marker-6",
                anchorStepId: "js-step-4",
                placement: { kind: "after-step", stepId: "js-step-4" },
                proofKind: "placeholder-text",
                queryExpression:
                  "screen.findByPlaceholderText('Enter customer reference')",
                proofText: "Enter customer reference",
              }),
            ],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    );

    expect(generated.code).toContain(
      "expect(await screen.findByText('Saved successfully')).toBeVisible()"
    );
    expect(generated.code).toContain(
      "expect(await screen.findByText('USD 4,800.00')).toBeVisible()"
    );
    expect(generated.code).toContain(
      "expect(await screen.findByLabelText('Customer Reference')).toBeVisible()"
    );
    expect(generated.code).toContain(
      "expect(await screen.findByPlaceholderText('Enter customer reference')).toBeVisible()"
    );
    expect(generated.code).not.toContain("toHaveValue(");
    expect(countOccurrences(generated.code, ".toBeVisible()")).toBe(4);
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("keeps mixed marker scenarios truthful by emitting resolved proof only", () => {
    const generated = generateTestFromGroups(
      "Mixed Marker Flow",
      [
        {
          name: "mixed marker coverage",
          steps: [
            {
              id: "js-step-1",
              action: "click",
              target: "Continue",
              originalType: "click",
              source: "js",
            },
          ],
        },
      ],
      {
        scenarios: [
          {
            name: "mixed marker coverage",
            goal: "flow",
            steps: [
              {
                id: "js-step-1",
                action: "click",
                target: "Continue",
                originalType: "click",
                source: "js",
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [
              createMarkerAssertion({
                markerStepId: "js-marker-11",
                anchorStepId: "js-step-1",
                placement: { kind: "after-step", stepId: "js-step-1" },
                proofKind: "role-name",
                queryExpression:
                  "screen.findByRole('heading', { name: 'Review Example' })",
                proofText: "Review Example",
              }),
            ],
            unresolvedMarkerAssertions: [
              {
                status: "unresolved",
                markerStepId: "js-marker-12",
                anchorStepId: "js-step-1",
                reason: "ambiguous-field-context",
                proofSubject: "field-label",
                target: "Customer Reference / Name",
                proofText: "Customer Reference / Name",
                line: 88,
                sourceContext: { line: 88, originalType: "dblClick" },
              },
            ],
          },
        ],
      }
    );

    expect(generated.code).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Example' })).toBeVisible()"
    );
    expect(generated.code).not.toContain(
      "findByLabelText('Customer Reference / Name')"
    );
    expect(generated.code).not.toContain("Customer Reference / Name");
    expect(countOccurrences(generated.code, ".toBeVisible()")).toBe(1);
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });

  it("keeps unresolved marker evidence out of emitted proof code", () => {
    const generated = generateTestFromGroups(
      "Unresolved Marker Flow",
      [
        {
          name: "unresolved marker",
          steps: [
            {
              id: "js-step-1",
              action: "click",
              target: "Save",
              originalType: "click",
              source: "js",
            },
          ],
        },
      ],
      {
        scenarios: [
          {
            name: "unresolved marker",
            goal: "flow",
            steps: [
              {
                id: "js-step-1",
                action: "click",
                target: "Save",
                originalType: "click",
                source: "js",
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            markerAssertions: [],
            unresolvedMarkerAssertions: [
              {
                status: "unresolved",
                markerStepId: "js-marker-7",
                anchorStepId: "js-step-1",
                reason: "ambiguous-field-context",
                proofSubject: "field-label",
                target: "Customer Reference / Name",
                proofText: "Customer Reference / Name",
                sourceContext: { originalType: "dblClick" },
              },
              {
                status: "unresolved",
                markerStepId: "js-marker-8",
                anchorStepId: "js-step-1",
                reason: "generic-container",
                proofSubject: "field-label",
                target: "Details panel",
                proofText: "Details panel",
                sourceContext: { originalType: "dblClick" },
              },
              {
                status: "unresolved",
                markerStepId: "js-marker-9",
                anchorStepId: "js-step-1",
                reason: "css-only-evidence",
                proofSubject: "selector-target",
                target: "div.css-19bb58m",
                proofText: "div.css-19bb58m",
                sourceContext: { originalType: "dblClick" },
              },
              {
                status: "unresolved",
                markerStepId: "js-marker-10",
                anchorStepId: "js-step-1",
                reason: "icon-only-target",
                proofSubject: "heading",
                target: "+",
                proofText: "+",
                sourceContext: { originalType: "dblClick" },
              },
            ],
          },
        ],
      }
    );

    expect(generated.code).not.toContain(
      "findByLabelText('Customer Reference / Name')"
    );
    expect(generated.code).not.toContain("findByText('Details panel')");
    expect(generated.code).not.toContain("findByText('div.css-19bb58m')");
    expect(generated.code).not.toContain("findByText('+')");
    expect(generated.code).not.toContain(".toBeVisible()");
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });
});

describe("selectorToQuery", () => {
  it("returns document.body for undefined selector", () => {
    expect(selectorToQuery(undefined)).toBe("document.body");
  });

  it('maps input[type="search"] to searchbox role, not textbox', () => {
    expect(selectorToQuery('input[type="search"]')).toContain(
      "getByRole('searchbox')"
    );
  });

  it('maps input[type="search"] with placeholder to getByPlaceholderText', () => {
    expect(
      selectorToQuery('input[type="search"][placeholder="Find items"]')
    ).toBe("screen.getByPlaceholderText('Find items')");
  });

  it('maps input[type="text"] to textbox role', () => {
    expect(selectorToQuery('input[type="text"]')).toContain(
      "getByRole('textbox')"
    );
  });

  it('maps input[type="email"] to textbox role', () => {
    expect(selectorToQuery('input[type="email"]')).toContain(
      "getByRole('textbox')"
    );
  });

  it("maps textarea to textbox role", () => {
    expect(selectorToQuery("textarea")).toContain("getByRole('textbox')");
  });

  it('maps input[type="text"] with placeholder to getByPlaceholderText', () => {
    expect(selectorToQuery('input[type="text"][placeholder="Email"]')).toBe(
      "screen.getByPlaceholderText('Email')"
    );
  });

  it('does not map input[type="checkbox"] to textbox', () => {
    expect(selectorToQuery('input[type="checkbox"]')).toBe(
      "screen.getByRole('checkbox')"
    );
  });

  it('does not map input[type="radio"] to textbox', () => {
    expect(selectorToQuery('input[type="radio"]')).toBe(
      "screen.getByRole('radio')"
    );
  });

  it('maps input[type="password"] to getByLabelText (no implicit role)', () => {
    const result = selectorToQuery('input[type="password"]');
    expect(result).not.toContain("getByRole('textbox')");
    expect(result).toContain("getByLabelText(");
    expect(result).toContain("TODO");
  });

  it('maps input[type="password"] with placeholder to getByPlaceholderText', () => {
    expect(
      selectorToQuery('input[type="password"][placeholder="Enter password"]')
    ).toBe("screen.getByPlaceholderText('Enter password')");
  });

  it("maps button to button role", () => {
    expect(selectorToQuery("button")).toBe("screen.getByRole('button')");
  });

  it("maps select to combobox role", () => {
    expect(selectorToQuery("select")).toBe("screen.getByRole('combobox')");
  });

  it("annotates bare textbox and searchbox queries with TODO for missing name", () => {
    expect(selectorToQuery('input[type="text"]')).toContain("TODO");
    expect(selectorToQuery('input[type="search"]')).toContain("TODO");
  });

  it("renders synthesized companion annotations as inline guidance comments", () => {
    const generated = generateTestFromGroups(
      "Mutation Contract Flow",
      [
        {
          name: "create profile",
          steps: [
            {
              action: "fill",
              target: "Profile name",
              value: "Acme",
              originalType: "fill",
              source: "js",
            },
            {
              action: "click",
              target: "Save profile",
              originalType: "click",
              source: "js",
            },
          ],
        },
      ],
      {
        scenarios: [
          {
            name: "create profile shows in-flight UI",
            goal: "mutation-state",
            steps: [
              {
                action: "fill",
                target: "Profile name",
                value: "Acme",
                originalType: "fill",
                source: "js",
              },
              {
                action: "click",
                target: "Save profile",
                originalType: "click",
                source: "js",
              },
            ],
            helperRefs: [],
            requiresFreshRender: true,
            provenance: "synthesized-companion",
            contractKind: "mutation-form",
            companionState: "in-flight",
            annotations: [
              "Override the shared mutation boundary so the submit action stays unresolved before asserting the in-flight UI.",
            ],
            markerAssertions: [],
            unresolvedMarkerAssertions: [],
          },
        ],
      }
    );

    expect(generated.code).toContain(
      "// Override the shared mutation boundary so the submit action stays unresolved before asserting the in-flight UI."
    );
    expect(verifySyntax(generated.code, "/tmp/generated.test.tsx")).toEqual({
      valid: true,
    });
  });
});
