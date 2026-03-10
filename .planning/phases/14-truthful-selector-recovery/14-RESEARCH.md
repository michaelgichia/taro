# Phase 14 Research: Truthful Selector Recovery

## Phase Intent

Phase 13 already gives Tayo a truthful JS baseline: stable `stepId`s, preserved `screen.getBy...` evidence, preserved `document.querySelector(...)` evidence, and recorded URL metadata. Phase 14 should not re-parse recorder JS. It should decide, per selector-backed step, whether Tayo can upgrade that selector into a stronger query, must keep it as unresolved evidence, or must stop and ask for review.

## What Must Be True

### QUERY-02

- Every `document.querySelector(...)` step stays anchored to its original `stepId`.
- Tayo only upgrades that step when it has trustworthy evidence for a stronger query.
- Trustworthy evidence means either:
  - the baseline already contains accessible query evidence for that same step, or
  - optional live DOM inspection can recover a stable accessible query from the recorded URL.
- If Tayo cannot justify an upgrade, the generated output must stay explicit with a warning/checkpoint instead of silently inventing a stronger query.

### QUERY-03

- Raw CSS selectors must never become fake `getByTestId(...)` queries just because Tayo can sanitize a selector string.
- The current fallback behavior in `src/core/resolver.ts` (`buildQuery`) and `src/core/generator.ts` (`selectorToQuery`) is now the main correctness risk.
- Unresolved selectors need a truthful representation such as:
  - preserved selector evidence on the step,
  - a generated TODO/checkpoint comment, and
  - a CLI warning that explains why recovery was not possible.

### QUERY-04

- Recorded URL extraction from Phase 13 remains the entry point for enrichment, but no URL must still produce useful baseline output.
- Live DOM enrichment must be optional, best-effort, and safe to skip when:
  - no URL exists,
  - the app is not running,
  - auth/state cannot be recreated,
  - host policy blocks browser launch.
- Browser-backed recovery should improve selector truth when available, not become a hard dependency for generation.

## Key Architectural Seams From Phase 13

- `src/core/input-loader.ts`: shared `.json`/`.js` loader; Phase 14 should keep all selector work behind this parsed-input boundary.
- `src/types/recording.ts`: `JsBaselineMetadata`, `QueryDescriptor`, `SelectorDescriptor`, `AssertionDescriptor`, and stable `StepId` already exist. Phase 14 should extend this area with a selector-resolution result keyed by `stepId`.
- `src/core/js-parser.ts`: selector/query/assertion evidence is already recovered truthfully and attached to `stepId`s. This is the authoritative source for Phase 14 input.
- `src/core/baseline-normalizer.ts`: selector and query evidence is already merged onto shared `NormalizedStep.metadata`, but it currently collapses to the first query/assertion per step. This is the clean place to attach resolved selector truth back onto steps, and it may need to preserve ranked candidates per step.
- `src/cli/commands/generate.ts`: `resolveJsQueryResults()` currently produces a side `QueryResult[]` for summaries/scoring only, and it runs after `analyzeRecording()`. That is insufficient because the generator does not consume those results as step truth and earlier planning/grouping stages cannot see the upgraded selector.
- `src/core/generator.ts`: JS generation reconstructs queries from step metadata or raw targets, then falls back through `selectorToQuery()`. Phase 14 needs generation to consume step-aware selector resolutions instead of re-deriving from raw selector strings.
- `src/core/recording-intelligence.ts`: sync assertions are already filtered from grouping. Selector recovery should preserve this behavior and avoid introducing new grouping noise before Phase 15.

## Recommended Implementation Shape

Add a selector-truth layer between normalization and generation. The core artifact should be step-aware, not selector-summary-only.

Recommended shape:

```ts
type SelectorResolution =
  | { stepId: StepId; status: 'strengthened'; query: QueryDescriptor; source: 'baseline' | 'live-dom'; warnings: string[] }
  | { stepId: StepId; status: 'unresolved'; selector: SelectorDescriptor; warnings: string[] }
  | { stepId: StepId; status: 'checkpoint'; selector: SelectorDescriptor; warnings: string[]; checkpointReason: string }
```

Implementation consequence:

- Replace the current `buildQuery(info, selector)` happy-path/fake-`getByTestId` policy with a resolver that can return `strengthened`, `unresolved`, or `checkpoint`.
- Merge those results back onto `NormalizedStep.metadata` by `stepId`.
- Make `generateTestFromGroups()` prefer resolved step metadata first, and emit explicit unresolved comments when no trustworthy query exists.
- Keep `QueryResult[]` as a reporting/scoring derivative, not the source of generation truth.

## Main Risks

- Selector strengthening can overfit to a transient DOM snapshot. `innerText` alone is not enough if the element is hidden, duplicated, or only meaningful inside `within(...)` scope.
- The current resolver/reporting path is selector-string keyed and `QueryResult` is not `stepId`-aware. Phase 14 decisions need step granularity so duplicate selectors across multiple steps remain traceable and generation can update the right step.
- Live DOM enrichment may inspect the wrong state if the recorded URL requires auth, seeded data, or interactions before the selector becomes meaningful.
- Sandbox/browser-launch failures are already known in this repo. Phase 14 should treat those as expected degraded-mode cases, not exceptional correctness failures.
- Phase 15 depends on selector truth. If Phase 14 leaves unresolved selectors disguised as strong queries, later suite planning and repo-aware shaping will inherit false confidence.

## Validation Architecture

- Unit tests on selector policy:
  - strengthening from live DOM yields `strengthened` only when role/name/text/label evidence is actually present,
  - unresolved selectors never become synthetic `getByTestId(...)`,
  - duplicate selector strings across different `stepId`s remain distinct results.
- Unit tests on generation:
  - strengthened steps render the recovered query,
  - unresolved/checkpoint steps render explicit comments or warnings instead of fake semantic queries.
- CLI integration tests:
  - JS input with URL + mocked DOM inspection upgrades supported selectors,
  - JS input with no URL still generates baseline output plus truthful warnings,
  - browser-launch failure degrades to unresolved/checkpoint behavior without aborting generation.
- Non-regression coverage:
  - JSON input path remains untouched,
  - existing Phase 13 guarantees stay true: selector-only evidence is still preserved when no justified strengthening exists.

## Likely Plan Slices

1. Define selector-resolution types and a step-aware resolution pipeline keyed by `stepId`.
2. Rewrite resolver policy so live DOM enrichment returns truthful outcomes instead of fake `getByTestId` fallbacks.
3. Thread selector resolutions back into normalized steps and update generation to consume them directly.
4. Add CLI, resolver, and generator regression coverage for URL-present, URL-missing, and browser-blocked paths.
