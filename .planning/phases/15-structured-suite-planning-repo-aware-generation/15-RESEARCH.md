# Phase 15 Research: Structured Suite Planning & Repo-aware Generation

## Phase Intent

Phase 14 made selector recovery truthful, but the generated JS path is still architecturally shallow. Tayo can now tell when a selector is unresolved, yet it still emits a low-fidelity suite shape: weak scenario boundaries, placeholder `render(<App />)` setup, and boundary warnings instead of repo-grounded module tests.

Phase 15 should convert that truthful baseline into maintainable RTL suites that:
- split at meaningful scenario boundaries only when state can be recreated safely,
- keep helpers focused on navigation/setup rather than hiding assertions,
- reuse repo conventions for imports, mock shape, and render style where evidence exists,
- target a real module/container boundary instead of leaving `render(<App />)` in place for supported flows.

## What Must Be True

### SUITE-01

- Tayo must stop treating `itGroups` as a lightly renamed recorder transcript.
- Scenario boundaries need to come from user-visible milestones, not just parser artifacts.
- Generated helpers must not bury meaningful assertions; the gold standard keeps assertions in test bodies and uses helpers only for setup/navigation.

### SUITE-02

- Multiple `it(...)` blocks are only valid when each block can recreate the necessary UI state independently.
- Wizard-style flows with cross-step mutation state should stay single-flow unless Tayo can emit reusable setup helpers that safely reconstruct downstream state.
- Positional control recovery like `getAllByRole(...)[0]` should be avoided; state-safe boundaries must also create query-safe scopes.

### SUITE-03

- Repo-aware generation must use discovered conventions for import style, test colocation, mock patterns, `userEvent.setup()`, and helper style.
- Current convention scanning only gives coarse file-level metadata (`importStyle`, `mockPattern`, folder pattern, helper-with-expect detection). Phase 15 needs convention usage, not just convention reporting.
- Mock intelligence already detects repeated mock targets and mutation lifecycle patterns, but generation does not yet turn that into shared mock/helper decisions.

### SUITE-04

- Tayo must replace placeholder render targets with repo-grounded module/container targets when the repo provides enough evidence.
- Boundary warnings are useful as a fallback, but supported flows should graduate from “boundary draft” to an actual render target plus matching imports.
- The gold-standard Add Sale sample shows the right boundary: render `SalesModule`, keep module-level mocks shared, and scope interactions with `within(...)` instead of testing `AddSaleForm` directly.

## Current Repo Reality

### `src/core/suite-planner.ts` is still only a warning layer

`planJsSuite()` currently does three things:
- classifies the boundary as `module`, `component`, or `unknown`,
- collapses some flows to one `it` block,
- emits warnings about module boundaries and repeated mocks.

What it does not do:
- model reusable setup phases,
- decide whether multiple tests are state-safe,
- extract helper boundaries,
- resolve the actual render target symbol/import path,
- feed repo-aware code generation beyond warnings.

This is the main Phase 15 planning seam for `SUITE-01` and `SUITE-02`.

### `src/core/generator.ts` and `src/templates/test-template.ts` still hardcode placeholder structure

JS generation currently uses `generateTestFromGroups()` with `describeBlockMultiIt()`, but every generated `it(...)` block still starts with:

```tsx
render(<App />)
```

The template layer also only knows generic imports from Testing Library and `userEvent`; it does not know:
- which module to import/render,
- whether repo conventions prefer shared `setup()` helpers,
- when helper functions should exist,
- when `within(...)` scopes are required to avoid positional queries.

This is the main Phase 15 planning seam for `SUITE-03` and `SUITE-04`.

### Boundary intelligence can grade output, but it does not generate fixes

`src/core/boundary-intelligence.ts` already detects the anti-patterns the user cares about:
- leaf render boundaries,
- inline hook mocks,
- helpers with embedded assertions,
- positional control selection.

The Add Sale sample fails these checks and the gold standard passes them. That gives Phase 15 a strong oracle for regression coverage, but the implementation gap is still open: generation does not yet consume these findings as shaping rules.

### Repo intelligence exists, but only as hints

`src/core/mock-intelligence.ts` can already find:
- repeated mock targets,
- mutation lifecycle patterns,
- unstable mock churn.

`src/core/scanner.ts` and `src/types/conventions.ts` can already find:
- `esm` vs `cjs`,
- `vi.mock` vs `jest.mock`,
- folder/file extension patterns,
- helper-with-expect smell.

What is missing is the bridge from those signals into generation decisions:
- importing the right module symbol,
- preferring shared mock fixtures over inline hook mocks,
- emitting helper functions that match the repo’s existing style,
- choosing scoped queries such as `within(dialog)` when repeated controls exist.

## Gold Standard Implications From The Add Sale Samples

Comparing `sample/AddSaleForm.test.tsx` with `sample/sample-add-sale-test.tsx` shows the exact boundary Tayo must learn:

- Render the owning module (`SalesModule`), not the leaf form (`AddSaleForm`).
- Keep shared module mocks at the top level; do not re-mock every internal query hook inline.
- Keep helper functions assertion-free except for synchronization waits that behave as setup checkpoints.
- Split tests by user-facing intent:
  - full save flow,
  - review-dialog presentation,
  - validation errors,
  - mutation failure,
  - pending/save-disabled state.
- Scope repeated controls with `within(dialog)` and stable labels instead of positional arrays unless there is no accessible alternative.

This sample pair should anchor the phase: if Tayo cannot move generated output toward the gold standard, Phase 15 is not done.

## Recommended Implementation Shape

### 1. Introduce a richer suite plan artifact

Phase 15 needs more than `ItGroup[]`. A useful shape would include:
- `tests`: named scenarios with explicit prerequisites,
- `helpers`: reusable navigation/setup helpers with allowed side effects,
- `renderTarget`: resolved component/module symbol plus import source,
- `mockStrategy`: shared mock fixture targets and per-test overrides,
- `queryScopes`: where `within(...)` is required to avoid positional ambiguity,
- `stateSafety`: whether multi-test output is allowed or must collapse to one flow.

This artifact should be computed before code generation and consumed directly by the template/generator layer.

### 2. Separate “scenario slicing” from “repo-aware realization”

Keep Phase 15 implementable by separating two decisions:
- Scenario planning: how many tests/helpers should exist?
- Repo realization: what module, imports, mocks, and scopes should those tests use?

That keeps state-safety heuristics and render-target resolution testable in isolation.

### 3. Resolve render targets from repo evidence, not naming guesses alone

The current boundary planner knows a flow should prefer a module/container boundary, but it does not know which module.

Phase 15 should search repo test/module evidence to resolve:
- likely owning module names (for example `SalesModule`),
- colocated test paths,
- repeated mock fixtures tied to that module area.

If the evidence is insufficient, generation may still fall back to a boundary draft, but supported flows must prove the positive path.

### 4. Make helper emission rule-based

Helper generation should follow explicit constraints:
- helpers may navigate/setup state,
- helpers may use synchronization waits,
- helpers should not contain the test’s load-bearing assertions,
- helpers should return scopes/handles when later assertions need a stable container.

This directly addresses the anti-patterns in the current Add Sale sample.

## Main Risks

- Over-splitting tests will create brittle suites that repeat long setup or assume state leaks across `it(...)` blocks.
- Under-resolving render targets will keep Phase 15 stuck at `render(<App />)` plus warnings, which is explicitly not enough for `SUITE-04`.
- Repo convention signals are coarse today; if Phase 15 overclaims confidence without symbol-level evidence, it will generate “repo-aware” output that is still wrong.
- Helper extraction can accidentally hide assertions again if the line between synchronization and verification is not explicit.
- Query scoping fixes can regress selector truth if scoped queries are synthesized without evidence from the recording or repo UI structure.

## Validation Architecture

- Unit tests on suite planning:
  - multi-step wizard flows with mutation signals stay single-flow unless state-safe setup is available,
  - state-safe flows can split into multiple scenarios with explicit helper boundaries,
  - helper plans do not place meaningful assertions inside helper bodies.
- Unit tests on repo-aware target resolution:
  - repo evidence can resolve a real render target/import pair for the Add Sale flow,
  - weak evidence degrades explicitly instead of silently picking the wrong component,
  - repeated mock targets map to shared mock recommendations instead of inline hook mocks.
- Generator/template tests:
  - generated JS output can import and render a real module symbol,
  - generated multi-test suites emit helpers and `within(...)` scopes where needed,
  - placeholder `render(<App />)` output disappears for supported repo-aware flows.
- CLI/sample regression tests:
  - the Add Sale sample moves toward the `SalesModule` gold standard,
  - boundary warnings shrink when repo evidence is sufficient,
  - sample output no longer depends on leaf-form rendering or positional button selection for the supported path.

## Likely Plan Slices

1. Build a richer suite-plan contract that models scenarios, helper boundaries, and state-safety rules.
2. Add repo-aware realization for render targets, imports, shared mocks, and scoped queries so generated code can target real modules.
3. Lock the behavior with Add Sale sample regressions and generator/CLI coverage that prove movement toward the gold standard.
