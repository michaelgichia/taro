---
phase: 16-verification-json-parity-product-surface
plan: "02"
subsystem: testing
tags: [json, recorder, parity, cli]
requires:
  - phase: 16-verification-json-parity-product-surface
    provides: explainable draft-mode trust contract for generated output
provides:
  - representative JSON fixture set for parity proof
  - shared-boundary JSON regressions across input loading, parsing, and recording analysis
  - public generate-flow coverage for JSON recordings
affects: [verification, docs, input-boundary]
tech-stack:
  added: []
  patterns: [fixture-backed-parity, public-flow-json-regression]
key-files:
  created:
    - sample/sample-json-recording-basic.json
    - sample/sample-json-recording-dialog.json
    - .planning/phases/16-verification-json-parity-product-surface/16-02-SUMMARY.md
  modified:
    - src/core/input-loader.test.ts
    - src/core/parser.test.ts
    - src/core/recording-intelligence.test.ts
    - src/cli/commands/generate.test.ts
key-decisions:
  - "Treat JSON parity as a public generate contract, but keep assertions aligned with the simpler non-JS generator path."
  - "Use behavioral checks around placeholder queries and advisory review messaging instead of freezing every output line."
patterns-established:
  - "Representative sample fixtures under sample/ anchor parity coverage for both shared and public boundaries."
  - "JSON tests assert truthful degradation instead of expecting JS-only selector recovery."
requirements-completed: [VERIFY-02]
duration: 20min
completed: 2026-03-10
---

# Phase 16 Plan 02 Summary

**Representative Chrome Recorder JSON fixtures now prove both the shared input boundary and the public generate flow without overstating JS-only capabilities.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-03-10
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added two representative JSON recordings covering a straightforward sales flow and a dialog/stateful draft flow.
- Locked the shared JSON boundary with fixture-backed tests for input loading, parsing, and recording analysis.
- Extended CLI regression coverage so `taro generate` proves JSON support at the user-facing boundary while keeping placeholder-query behavior explicit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add representative JSON fixtures and shared-boundary regression coverage** - `00370a1` (test)
2. **Task 2: Prove JSON parity through the public generate flow** - `2b0989c` (test)

**Plan metadata:** Captured in the Phase 16 verification and closeout artifacts.

## Files Created/Modified

- `sample/sample-json-recording-basic.json` - Straightforward JSON proof fixture for a basic sale flow.
- `sample/sample-json-recording-dialog.json` - Dialog/stateful JSON proof fixture with double-click cleanup behavior.
- `src/core/input-loader.test.ts` - Verifies both fixtures load through the shared parsed-input envelope.
- `src/core/parser.test.ts` - Verifies stable ids and preserved recorder intent from the representative fixtures.
- `src/core/recording-intelligence.test.ts` - Verifies cleanup, grouping, and visual-capture behavior on the representative fixtures.
- `src/cli/commands/generate.test.ts` - Verifies dry-run and write-mode JSON generation at the public CLI boundary.

## Decisions Made

- Kept JSON assertions behavioral and public-flow oriented so harmless formatting drift does not break parity tests.
- Preserved the current simpler JSON output path, including placeholder queries and manual-review messaging, instead of asserting repo-aware JS behavior.

## Deviations from Plan

None.

## Issues Encountered

- Initial JSON CLI expectations assumed the JS recovery path. The failing tests showed the real contract: JSON generation works, but remains placeholder-based and advisory. The tests were corrected to lock that truthful boundary.

## User Setup Required

None.

## Next Phase Readiness

Wave 2 gives Wave 3 a concrete public JSON contract to document in README/help without inventing capabilities that the shipped CLI does not have.
