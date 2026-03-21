---
name: "@taro-test/rtl-target"
description: "Generate repository-aware React Testing Library tests from a specific component file, with an optional Testing Library Recorder `.js` export to supply concrete interaction flow."
---

# Taro Target

Invoke this skill with `$@taro-test/rtl-target`.

---

## Purpose

Generate a colocated RTL test for an explicit component path.

- The component file path is required.
- A Recorder `.js` file is optional.
- When a Recorder file is present, Taro must keep that behavioral evidence but force the supplied component as the render target.
- When no Recorder file is present, Taro must infer a production-oriented render contract from the component's accessible surface and nearby repo conventions.

---

## Workflow

1. Confirm the component file path.
2. If the user also has a Recorder `.js` file, capture that path too.
3. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file>` when no recording is provided.
4. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file> --recording <recording-file>` when both inputs are provided.
5. Report the written test path, score and grade, manual review status, and any blockers or follow-up findings.

---

## Reference Map

Read only the files that apply to the current problem:

- `references/intent-model.md` for parsed-step normalization and interaction-intent recovery
- `references/assertion-markers.md` for converting semantic `dblClick` checkpoints into explicit assertions
- `references/entry-path-fidelity.md` when deciding parent trigger flow versus direct dialog/form harnesses
- `references/conventions-schema.md` when interpreting `.taro/state.json`, `.taro/overrides.json`, or convention drift
- `references/mock-store.md` when deciding fixture reuse or persistent mock storage
- `references/quality-scoring.md` when explaining score changes, grade drops, or blocker priorities
- `references/verification-gate.md` when deciding whether generated output is acceptable to hand off
- `references/auth.md` only when live URL inspection or screenshots hit an authentication wall
- `references/boundary-patterns.md` when deciding whether a collaborator should stay real, reuse support, or allow an inline mock
- `references/state-schema.md` and `references/test-index.md` only when state/history questions matter

---

## Boundary Pattern Few-Shots

Infer the principle first, then choose the concrete repo artifact. Use the strongest local exemplar instead of generic mocking.

- Partial support import: A shared boundary stays mostly real and a support import overrides only the unstable slice. Reuse that support import; do not recreate the package inline.
- Keep-real wrapper: A local wrapper is part of the render surface. Keep it real and solve boundary issues at the render layer instead of mocking through it.
- Factory support: A collaborator exposes stable factory/reset handles. Import those handles and configure behavior per test.
- Inline-safe boundary: A simple router, env, or platform seam can use a lightweight inline mock when no stronger local pattern exists.

Never invent a fake shared UI implementation when a partial-support or keep-real pattern exists.

## Guardrails

- Never replace the supplied component with a repo-inferred render target.
- Learn test placement from the state.json file. Fallback by collocating next to the supplied component basename.
- Treat component-only inference conservatively; if the component surface is too opaque, report the blocking finding instead of fabricating a weak smoke test.
- Do not run a second hand-written parser for Recorder input. Let Taro own the parsing pipeline.

---

## Generation quality standard

Taro owns the parsing and generation pipeline. The following standard governs the quality bar that generated output must meet. Use it to evaluate scores, identify advisories, and determine whether manual review is required. These principles are codebase-agnostic and apply regardless of domain, prop shape, or import topology.

### Philosophy

A generated test suite is a specification, not a crash detector. Reading the `it(...)` descriptions alone should give a reader a complete picture of what the component does. The question driving generation is never "does this component render?" — it is "what decisions does this component make, and what is the correct output of each one?"

### Pre-generation audit

Before generating any test code, Taro must extract and account for:

1. **All non-TS/JS imports** — every asset, CSS module, framework utility, third-party library, internal hook, and internal helper that will need a `vi.mock(...)`
2. **All conditional expressions** — every `&&`, `||`, `??`, ternary, and type-narrowing branch represents at minimum two test cases
3. **All exported symbols** — any function or constant exported alongside the default component must be tested in its own `describe` block
4. **All event handlers** — every `onClick`, `onChange`, `onSubmit`, and similar handler needs a primary action test, a side-effect test, and a fallback/absent-data test
5. **All async operations** — promises and notification side-effects need assertions on both the success and the fallback/error path

### Mock requirements

**Framework router links** must be stubbed as a plain anchor so `href` is queryable and children render:

```ts
vi.mock("<router-link-module>", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
```

**Dynamically imported components** must resolve synchronously. The mock must expose a `data-testid` and surface any props that tests will assert as `data-*` attributes:

```ts
vi.mock("<dynamic-import-path>", () => ({
  default: () => {
    const Mock = (props: Record<string, unknown>) => (
      <div data-testid="<descriptive-testid>" data-id={String(props.id)} />
    );
    Mock.displayName = "Mock";
    return Mock;
  },
}));
```

**SVG and image assets** must each carry a unique `data-testid` derived from what the asset represents, and must forward `...props` so className, aria, and style values are not silently dropped. When the component conditionally renders one of several assets, every asset in that set must be mocked — not just the one used by the default fixture.

**Component library named exports**: display components expose asserted props as `data-*` attributes; service-style method objects (e.g. toast/notification utilities) use `vi.fn()` per method.

**Internal hooks and helpers** must be mocked as `vi.fn()` instances configured in `beforeEach`, not inside the `vi.mock(...)` factory. The factory runs once per file; `beforeEach` runs per test.

### Fixture design

A `BASE_PROPS` constant must represent the component's most common, real-world render state. An override-accepting render helper must be defined:

```ts
function renderComponent(overrides: Partial<typeof BASE_PROPS> = {}) {
  return render(<Component {...BASE_PROPS} {...overrides} />);
}
```

When the component receives a nested object prop (e.g. a GraphQL fragment), define a separate base for that object and provide a two-axis render helper so outer and inner props can be overridden independently without prop shape conflicts.

Base fixture values must not suppress conditional branches. If the component renders a conditional subtree based on a prop, the base value of that prop must reflect the default real-world state — not a value chosen only because it avoids a rendering path.

### Branch coverage

Every conditional expression maps to at least two test cases. For boolean guards (`&&`): one test confirms presence, one confirms absence using `queryBy` + `not.toBeInTheDocument()`. For ternaries: one test per text or element outcome. For nullish fallbacks (`??`): test the defined case, `null`, and `undefined` separately. For three or more symmetric outcomes: use `it.each` and add a mutual exclusion assertion confirming only one element appears at a time.

### Event handler coverage

For every handler: assert the primary action with the correct arguments, assert side effects (notifications, clipboard writes, state), assert the fallback path when required data is absent, and assert that `e.stopPropagation()` / `e.preventDefault()` calls prevent the parent from receiving the event.

Always use `userEvent.setup()`, not `fireEvent`. `userEvent` simulates realistic browser input sequences; `fireEvent` dispatches synthetic events that skip pointer and focus sequences.

### Query priority

1. Role — `getByRole(...)` for interactive elements
2. Label — `getByLabelText(...)` for form controls and icon buttons with `aria-label`
3. Text — `getByText(...)` for visible copy
4. TestId — `getByTestId(...)` for mocked components and assets only

Use `getBy` for positive assertions. Use `queryBy` only for absence assertions (`not.toBeInTheDocument()`). Use `toBeInTheDocument()` for presence checks; `toBeVisible()` only when the test specifically targets CSS visibility toggling.

### Exported utility functions

Any function exported alongside the default component must be tested directly, without rendering the component. Place these in a top-level `describe` block separate from component rendering tests. Apply one test per branch regardless of the function's domain or name.

### Spy lifecycle

All `vi.fn()` call history must be cleared and return values reconfigured in `beforeEach`. Call history must not leak between tests.

### Test naming

Every `it(...)` description must be a plain-English behavioural statement that includes the triggering condition. The full list of descriptions must serve as a readable specification. Each `it(...)` block must contain one logical behaviour; assertions about the same indivisible behaviour (e.g. a label and its formatted value) may coexist in one block.

| ❌ Avoid | ✅ Prefer |
| --- | --- |
| `"renders correctly"` | `"renders the entity display name"` |
| `"admin check"` | `"renders the popover when isAdmin is true"` |
| `"fallback value"` | `"falls back to 0 when count is null"` |
| `"notification"` | `"shows a warning notification when the required field is absent"` |

---

## Scoring and grading

Taro's score reflects mechanical coverage and pattern compliance. Augment that score with the following advisory checks when reporting results. Flag each item as a blocker (prevents shipping), advisory (should fix), or informational (low risk):

| Check | Severity if missing |
| --- | --- |
| All non-TS/JS imports mocked | Blocker — unmocked imports throw at render time |
| All assets in a conditional set mocked | Blocker — any untested country/status/variant throws |
| Dynamic imports resolve synchronously | Blocker — async dynamic imports fail in jsdom |
| Every `&&` / ternary / `??` branch covered | Blocker — untested branches are untested contracts |
| Event handler fallback path covered | Blocker — missing fallback leaves error state unverified |
| `stopPropagation` / `preventDefault` verified | Advisory |
| `userEvent` used instead of `fireEvent` | Advisory |
| Exported utilities tested in isolation | Advisory |
| `vi.fn()` spies cleared in `beforeEach` | Advisory — leaking state causes order-dependent failures |
| `queryBy` used only for absence assertions | Advisory |
| `it(...)` names include triggering condition | Informational |
| One behaviour per `it(...)` block | Informational |

---

## Response contract

Return for every invocation:

- **Command run** — the exact CLI command executed
- **Component path** — resolved path of the target component
- **Recording path** — resolved path if a Recorder file was supplied, otherwise `none`
- **Generated file path** — colocated test file written by Taro
- **Score and grade** — Taro's mechanical score plus any augmented advisory findings
- **Manual review required** — yes / no, with the specific reason if yes
- **Top blockers and advisories** — the highest-priority items from the scoring table that remain unresolved in the generated output
