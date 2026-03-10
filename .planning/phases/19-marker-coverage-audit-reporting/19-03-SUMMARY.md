---
phase: 19-marker-coverage-audit-reporting
plan: "03"
subsystem: cli
tags: [semantic-markers, reporting, vitest, quality-gate]
requires:
  - phase: 19-marker-coverage-audit-reporting
    provides: QUAL-02 marker coverage totals and gate status surfaced in generate output
provides:
  - Deterministic unresolved-marker warning lines with marker id, reason code, human-readable guidance, and recorder line context
  - `line: unknown` fallback behavior when unresolved marker line metadata is absent
  - Regression coverage across CLI/planner/generator for unresolved metadata traceability and truthful non-emission
affects: [marker-coverage, cli-reporting, suite-planner, generator]
tech-stack:
  added: []
  patterns:
    - deterministic unresolved marker warning formatting
    - planner metadata passthrough for CLI repair guidance
key-files:
  created: []
  modified:
    - src/cli/commands/generate.ts
    - src/cli/commands/generate.test.ts
    - src/core/suite-planner.test.ts
    - src/core/generator.test.ts
key-decisions:
  - "Emit unresolved marker warnings as single-line MKR-03 entries with stable field ordering for terminal/CI logs."
  - "Derive warning entries from hydrated suite-plan unresolved marker metadata and dedupe by marker step id."
patterns-established:
  - "Unresolved marker reporting remains advisory and explicit, independent from whether QUAL-02 passes for other markers."
  - "CLI warning traceability relies on planner metadata contracts (marker step id, reason, line/sourceContext)."
requirements-completed: [QUAL-01, QUAL-03]
duration: 6min
completed: 2026-03-10
---

# Phase 19 Plan 03: Marker Coverage Audit & Reporting Summary

**QUAL-03 now emits actionable MKR-03 unresolved-marker warnings with recorder-line traceability and regression locks for known/unknown line contexts.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-10T10:32:30Z
- **Completed:** 2026-03-10T10:38:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added deterministic unresolved marker warning emission in `generate` output with stable field order and reason guidance text.
- Implemented recorder line fallback behavior (`line: unknown`) while keeping marker step id and reason code visible.
- Added regression coverage spanning CLI, suite planner metadata, and generator truthfulness for mixed resolved/unresolved marker runs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add structured unresolved-marker warning emission with recorder-line fallback** - `620b9ca` (feat)
2. **Task 2: Lock unresolved warning traceability with planner/generator-aware regressions** - `fd759b7` (test)

## Files Created/Modified
- `src/cli/commands/generate.ts` - Added MKR-03 unresolved warning formatter, reason guidance map, line fallback logic, and warning emission from hydrated suite metadata.
- `src/cli/commands/generate.test.ts` - Added coverage for warning field shape and explicit `line: unknown` fallback behavior.
- `src/core/suite-planner.test.ts` - Locked unresolved marker metadata line/sourceContext propagation for CLI traceability.
- `src/core/generator.test.ts` - Added mixed resolved/unresolved marker regression ensuring unresolved entries never fabricate emitted assertions.

## Decisions Made
- Used one-line MKR-03 warning entries (`marker`, `line`, `reason`, `detail`, `hint`) to keep output parseable and scan-friendly in local terminals and CI logs.
- Kept unresolved warning emission independent of QUAL-02 pass/fail so unresolved repair guidance is always visible when unresolved markers exist.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 19 execution is complete and ready for milestone transition/audit.

## Self-Check: PASSED

- Found `.planning/phases/19-marker-coverage-audit-reporting/19-03-SUMMARY.md`
- Found task commit `620b9ca`
- Found task commit `fd759b7`

---
*Phase: 19-marker-coverage-audit-reporting*
*Completed: 2026-03-10*
