---
phase: 15-structured-suite-planning-repo-aware-generation
plan: "01"
subsystem: suite-planning
tags: [js-baseline, suite-planning, state-safety, rtl]
requires:
  - phase: 14-03
    provides: truthful selector checkpoints and Add Sale regression baseline
provides:
  - structured suite-plan metadata for scenarios, helpers, and state-safety
  - planner tests that distinguish safe multi-test flows from single-flow-required wizards
affects: [phase-15-02-repo-aware-generation, js-generation, boundary-isolation]
tech-stack:
  added: []
  patterns: [state-safe multi-it gating, helper-plan assertion policy]
key-files:
  created: [.planning/phases/15-structured-suite-planning-repo-aware-generation/15-01-SUMMARY.md]
  modified: [src/types/recording.ts, src/core/suite-planner.ts, src/core/suite-planner.test.ts]
key-decisions:
  - "Model suite planning as explicit scenarios, helpers, and state-safety instead of only `itGroups` plus warnings."
  - "Allow helper plans to contain synchronization/setup intent only; load-bearing assertions remain in scenario test bodies."
patterns-established:
  - "Wizard flows with mutation evidence collapse to a single coordinated scenario unless state recreation is proven safe."
  - "Non-wizard intent groups can be planned as multiple scenarios with helper references when no mutation-heavy state is detected."
requirements-partial: [SUITE-01, SUITE-02]
duration: 16min
completed: 2026-03-10
---

# Phase 15 Plan 01: Structured Suite-Plan Contract & State Safety Summary

**Suite planning now produces explicit scenario, helper, and state-safety metadata so later generation can tell the difference between safe multi-test output and flows that must remain single-flow**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-10T05:23:00Z
- **Completed:** 2026-03-10T05:39:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended the shared recording types with helper, scenario, and state-safety metadata that later phases can consume without breaking the current generator contract.
- Reworked the suite planner so it returns explicit helper candidates, scenario plans, and state-safety decisions alongside the existing `itGroups` compatibility path.
- Added focused suite-planner coverage for three critical cases: mutation-heavy wizard flows, safe multi-scenario non-wizard flows, and unresolved module-boundary drafts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace warning-only suite planning with structured scenario/state-safety decisions** - `14308fd` (feat)
2. **Task 2: Lock helper and scenario-boundary rules with focused unit coverage** - `8aeaf41` (test)

**Plan metadata:** Recorded in the final docs commit for this summary/state update.

## Files Created/Modified

- `.planning/phases/15-structured-suite-planning-repo-aware-generation/15-01-SUMMARY.md` - execution summary, decisions, and verification record for plan 15-01
- `src/types/recording.ts` - shared helper/scenario/state-safety types for JS suite planning
- `src/core/suite-planner.ts` - richer suite-plan output with helper metadata and state-safety assessment
- `src/core/suite-planner.test.ts` - unit coverage for safe multi-it planning and unresolved wizard drafts

## Decisions Made

- Kept `itGroups` in the suite-plan output for backward compatibility so Wave 2 can adopt the richer metadata incrementally instead of forcing a big-bang generator rewrite.
- Marked helper plans as `sync-only` to make the assertion boundary explicit before helper code emission exists.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The execution-role agent stalled, so the plan was executed locally to keep the wave moving without changing scope.
- Existing planner tests only covered the warning-only surface, so new fixtures were needed to prove safe multi-scenario behavior explicitly.

## User Setup Required

None.

## Next Phase Readiness

- Wave 2 can now consume structured scenario/helper/state-safety metadata instead of inferring everything from `itGroups`.
- Repo-aware render target/import generation can build on explicit `stateSafety` and `helperRefs` decisions rather than duplicating boundary heuristics.

## Self-Check: PASSED

- Found `.planning/phases/15-structured-suite-planning-repo-aware-generation/15-01-SUMMARY.md`
- Found commit `14308fd`
- Found commit `8aeaf41`
