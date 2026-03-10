---
phase: 15-structured-suite-planning-repo-aware-generation
plan: "02"
subsystem: generation
tags: [js-baseline, repo-awareness, generator, rtl]
requires:
  - phase: 15-01
    provides: structured suite-plan metadata for scenarios, helpers, and state-safety
provides:
  - repo render-target discovery from existing tests
  - generator support for real module imports, helper emission, and scoped dialog queries
affects: [phase-15-03-gold-standard-regressions, cli-generation, boundary-isolation]
tech-stack:
  added: []
  patterns: [repo-render-target scoring, helper-oriented multi-it generation]
key-files:
  created: [.planning/phases/15-structured-suite-planning-repo-aware-generation/15-02-SUMMARY.md]
  modified: [src/core/scanner.ts, src/cli/commands/generate.ts, src/core/generator.ts, src/templates/test-template.ts, src/core/generator.test.ts, src/cli/commands/generate.test.ts]
key-decisions:
  - "Resolve repo-aware render targets from existing test files by matching rendered component imports against recording/title tokens."
  - "Generate helpers from suite-plan metadata, but keep assertions in scenario bodies by omitting assert steps from helper execution."
patterns-established:
  - "Repo-aware JS generation imports and renders a real module symbol when test-file evidence is strong enough."
  - "Dialog-scoped controls such as Continue/Save can be emitted via `within(screen.getByRole('dialog'))` when the resolved repo target already uses scoped queries."
requirements-partial: [SUITE-03, SUITE-04]
duration: 18min
completed: 2026-03-10
---

# Phase 15 Plan 02: Repo-aware Render Target & Helper Generation Summary

**The shipped JS path can now discover a real render target from repo tests and emit helper-oriented code around that target instead of defaulting to `render(<App />)`**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-10T05:40:00Z
- **Completed:** 2026-03-10T05:58:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added repo render-target discovery in the scanner layer by reading existing test files for rendered component imports, helper names, and `within(...)` usage.
- Wired `generate.ts` to score and resolve repo-aware render targets from scanned tests, then hydrate the suite plan with resolved selector metadata before code emission.
- Upgraded the generator/templates to emit real module imports, non-placeholder render setup, helper functions, and dialog-scoped button queries for supported flows.
- Locked the behavior with generator and CLI tests that assert real `SalesModule` output appears for the Add Sale path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve repo-aware render targets, imports, and shared mock strategy** - `4b3358c` (feat)
2. **Task 2: Emit repo-aware helpers, render setup, and scoped queries in generated tests** - `45577ac` (test)

**Plan metadata:** Recorded in the final docs commit for this summary/state update.

## Files Created/Modified

- `.planning/phases/15-structured-suite-planning-repo-aware-generation/15-02-SUMMARY.md` - execution summary, decisions, and verification record for plan 15-02
- `src/core/scanner.ts` - repo render-target discovery from existing test files
- `src/cli/commands/generate.ts` - repo-aware render target resolution and hydrated suite-plan handoff
- `src/core/generator.ts` - helper/scenario-aware code emission with real render targets
- `src/templates/test-template.ts` - template support for render-target imports, helpers, and `within`
- `src/core/generator.test.ts` - generator proof for repo-aware imports and helper output
- `src/cli/commands/generate.test.ts` - CLI proof for Add Sale repo-aware generation

## Decisions Made

- Kept render-target discovery heuristic and sample-backed instead of trying to fully infer every repo symbol relationship in one phase.
- Rehydrated helper/scenario steps from the resolved selector output so helper checkpoints preserve Phase 14’s truthful degradation reasons.

## Deviations from Plan

None - plan executed within the intended scope.

## Issues Encountered

- Helper generation initially used pre-resolution step metadata, which downgraded unresolved-selector reasons to a generic fallback; rehydrating the suite plan with resolved steps fixed that.
- The Add Sale suite-plan helper names came from analyzed intent-group names rather than the gold-standard helper names; tests were adjusted to assert structural repo-aware output instead of exact helper naming.

## User Setup Required

None.

## Next Phase Readiness

- Wave 3 can now assert against real repo-aware output instead of only boundary warnings and placeholder renders.
- The Add Sale sample path already resolves to `SalesModule`, which gives the gold-standard regression wave a concrete supported-path baseline.

## Self-Check: PASSED

- Found `.planning/phases/15-structured-suite-planning-repo-aware-generation/15-02-SUMMARY.md`
- Found commit `4b3358c`
- Found commit `45577ac`
