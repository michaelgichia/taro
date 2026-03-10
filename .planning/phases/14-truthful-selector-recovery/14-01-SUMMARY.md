---
phase: 14-truthful-selector-recovery
plan: "01"
subsystem: core
tags: [selector-recovery, resolver, recording-types, playwright]

requires:
  - phase: 13-js-input-contract-ast-recovery
    provides: preserved selector and query evidence attached to stable JS step ids

provides:
  - explicit resolved and unresolved selector outcome states
  - preserved-query precedence over weaker live-DOM guessing
  - resolver coverage for truthful selector recovery failures

affects: [14-truthful-selector-recovery, core, cli]

key-files:
  modified:
    - src/types/recording.ts
    - src/core/resolver.ts
    - src/core/resolver.test.ts

requirements-completed: [QUERY-02, QUERY-03]

completed: 2026-03-10
---

# Phase 14 Plan 01: Selector Resolution Summary

**Selector-derived JS steps now resolve through explicit success and failure states instead of collapsing into invented fallback queries.**

## Accomplishments

- Added structured selector-resolution result types in [recording.ts](/Users/michaelgichia/workspace/tayo/src/types/recording.ts) so JS selector recovery can distinguish preserved baseline queries, live-DOM upgrades, missing URL state, inspection failures, and inaccessible selectors.
- Refactored [resolver.ts](/Users/michaelgichia/workspace/tayo/src/core/resolver.ts) so accessible-query derivation is separate from selector-resolution policy, with `resolveSelector()` returning truthful unresolved outcomes rather than fake `getByTestId(...)` fallbacks.
- Expanded [resolver.test.ts](/Users/michaelgichia/workspace/tayo/src/core/resolver.test.ts) to cover preserved-query precedence, accessible live-DOM upgrades, no-URL degradation, selector-not-found behavior, and inspection failures.

## Verification

- `npm run build`
- `npm run test:run -- src/core/resolver.test.ts`

## Task Commits

1. **Task 1: Add selector-resolution outcome types and resolver entrypoints** — `136edc5` (`feat(14-01): add selector resolution contract`)
2. **Task 2: Prove resolver truthfulness with focused unit coverage** — `e6b8a48` (`test(14-01): cover truthful selector resolution`)

## Decisions Made

- Model selector recovery as an explicit resolved/unresolved contract rather than forcing every selector to become a query.
- Preserve recorder-derived accessible query evidence before attempting live-DOM inspection so weaker selector evidence cannot overwrite stronger baseline truth.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The original executor stalled after producing the task commits, so the orchestrator finished verification and summary generation from the completed git state instead of rerunning the plan.

## Next Phase Readiness

- Phase 14-02 can now consume `resolveSelector()` outcomes in the shipped JS generation flow and emit truthful unresolved-selector checkpoints.
- Phase 14-03 can build sample-backed coverage on top of the new unresolved states without reopening the resolver contract.

## Self-Check: PASSED
