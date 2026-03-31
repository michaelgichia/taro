---
phase: 03-resume-retry-and-failure-semantics
plan: 02
subsystem: testing
tags: [cli, regrade, failure-handling, resume, vitest]
requires:
  - phase: 03-01
    provides: explicit regrade resume-selection rules and rerun coverage
provides:
  - explicit stop-on-failure handling for regrade directory loops
  - distinct execution-failure exit semantics for mid-loop runner errors
  - retry-after-failure integration coverage aligned to target-loop behavior
affects: [phase-04-runtime-guidance]
tech-stack:
  added: []
  patterns:
    [
      preserve in-progress row on failure,
      distinguish usage errors from execution failures,
    ]
key-files:
  created: []
  modified:
    - src/cli/commands/regrade.ts
    - src/cli/commands/tests/regrade.test.ts
key-decisions:
  - "Handled runner failures inside the loop so execution failures stop with exit code 1 instead of falling through the usage-error path."
  - "Kept the active tracker row in-progress on failure and relied on rerun selection to retry it first."
patterns-established:
  - "Execution failures preserve the active row as in-progress and later rows as pending."
  - "A rerun after failure retries the same row first and can continue through the queue once it succeeds."
requirements-completed: [RGEX-02]
duration: 3min
completed: 2026-03-31
---

# Phase 3: Resume, Retry, and Failure Semantics Summary

**Regrade directory loops now stop safely on runner failure, keep the active test in-progress, and resume from that test on rerun**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T06:53:30Z
- **Completed:** 2026-03-31T06:54:36Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added an explicit failure boundary around per-test regrade execution inside the directory loop.
- Split mid-loop execution failure from invalid-command usage handling so failures exit with code `1` and contextual loop logging.
- Added integration tests proving failure leaves the active row `in-progress` and reruns retry that row before continuing.

## Task Commits

This plan landed together with Plan `03-01` in one implementation commit:

1. **Tasks 1-3: Lock down regrade resume semantics and failure handling** - `07bcf63` (feat)

## Files Created/Modified

- `src/cli/commands/regrade.ts` - Stops the loop on runner failure, logs the active test, and preserves retryable tracker state.
- `src/cli/commands/tests/regrade.test.ts` - Verifies stop-on-failure, retry-after-failure, and final continuation through the remaining queue.

## Decisions Made

- Mirrored the target directory-loop failure contract rather than inventing a second execution model for regrade.
- Used a loop-local failure path so usage/configuration errors continue to exit through the existing code path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 can now focus on runtime guidance and regression/documentation coverage with the full regrade loop control flow in place.

## Self-Check: PASSED

---

_Phase: 03-resume-retry-and-failure-semantics_ _Completed: 2026-03-31_
