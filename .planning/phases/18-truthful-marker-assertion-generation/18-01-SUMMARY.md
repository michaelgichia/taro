---
phase: 18-truthful-marker-assertion-generation
plan: "01"
subsystem: testing
tags: [rtl, semantic-markers, resolver, recording-analysis]
requirements-completed: [ASSERT-01, ASSERT-02, ASSERT-03, SAFE-02]
key-files:
  created:
    - .planning/phases/18-truthful-marker-assertion-generation/18-01-SUMMARY.md
  modified:
    - src/types/recording.ts
    - src/core/resolver.ts
    - src/core/resolver.test.ts
    - src/core/recording-intelligence.ts
    - src/core/recording-intelligence.test.ts
completed: 2026-03-10
---

# Phase 18-01 Summary

## What changed

- Added a shared Phase 18 marker-assertion contract in `src/types/recording.ts`:
  - `SemanticMarkerAssertion` now captures the winning proof kind, async query expression, visibility matcher, anchor linkage, and source metadata.
  - `SemanticMarkerAssertionResolution` now distinguishes resolved assertion intents from explicit unresolved marker evidence.
  - `QueryDescriptor` now carries `name` and `options` so role-and-name resolution can reuse recovered recorder evidence directly.
- Updated `src/core/recording-intelligence.ts` so field-label recorder markers are preserved as Phase 18 evidence instead of being flattened into click noise:
  - resolvable field-label candidates now keep anchor linkage as semantic marker links
  - ambiguous field-adjacent markers now stay explicit with `ambiguous-field-context` unresolved state
  - unresolved markers now retain anchor metadata when available
- Added `resolveSemanticMarkerAssertion()` in `src/core/resolver.ts`:
  - enforces the locked proof order: role plus name, then exact visible text/value, then bounded form-context fallback
  - emits async-safe `findBy*` query intent with visibility expectations only
  - rejects CSS-only, icon-only, hidden-implementation, generic-container, and ambiguous field-context evidence instead of fabricating assertions
- Expanded focused regressions in `src/core/resolver.test.ts` and `src/core/recording-intelligence.test.ts` to lock the proof order, label-before-placeholder behavior, async-safe query intent, and ambiguous field-context handling.

## Task commits

1. Task 1: structured semantic-marker assertion contract and analysis preservation
   - `e9ae988` `feat(18-01): add truthful marker assertion contract`
2. Task 2: strongest-proof resolver logic and focused guardrail tests
   - `15fd87e` `feat(18-01): resolve truthful marker assertions`

## Tests run

- `npm run build`
- `npm run test:run -- src/core/recording-intelligence.test.ts src/core/resolver.test.ts`

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing analysis regression during Task 1 verification**
- **Found during:** Task 1
- **Issue:** `src/core/recording-intelligence.test.ts` still asserted the pre-Phase-18 behavior that dropped field-label markers as noise, which blocked the task’s required verification command.
- **Fix:** Replaced that regression with Phase 18 field-label preservation coverage, then added the complementary ambiguity regression in Task 2.
- **Files modified:** `src/core/recording-intelligence.test.ts`
- **Verification:** `npm run build` and `npm run test:run -- src/core/recording-intelligence.test.ts src/core/resolver.test.ts`
- **Committed in:** `e9ae988` and `15fd87e`

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)

## Issues encountered

- A stale `.git/index.lock` appeared during the first task commit attempt because staging and commit were triggered together. Re-running the commit sequentially resolved it without code changes.

## Next phase readiness

- Phase 18 now has a reusable truthful marker-assertion contract plus a resolver seam that returns explicit resolved or unresolved outcomes.
- Analysis preserves qualifying form-context markers for downstream generation while keeping ambiguous evidence unresolved.
- Generator and suite-planner integration for placing these assertions in scenario bodies remains for later Phase 18 plans.
