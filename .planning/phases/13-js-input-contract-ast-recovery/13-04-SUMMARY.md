---
phase: 13-js-input-contract-ast-recovery
plan: "04"
subsystem: testing
tags: [regression, cli, json-parity, phase-boundary]

requires:
  - phase: 13-js-input-contract-ast-recovery
    provides: dedicated JS baseline normalization and shared CLI flow

provides:
  - CLI parity coverage for recorder JS public flags
  - explicit JSON parser regression proof during the JS milestone
  - boundary assertions that preserve selector evidence without invented accessible queries

affects: [13-js-input-contract-ast-recovery, testing, cli]

key-files:
  created:
    - src/cli/commands/generate.test.ts
    - src/core/parser.test.ts
  modified:
    - src/core/input-loader.test.ts
    - src/core/recording-intelligence.test.ts
    - src/core/js-parser.test.ts

requirements-completed: [INPUT-01, INPUT-02, INPUT-03, QUERY-01]

completed: 2026-03-09
---

# Phase 13 Plan 04: Regression & Parity Summary

**Phase 13 now closes with public-flow regression proof for recorder JS, explicit non-regression coverage for Chrome Recorder JSON, and boundary assertions that keep selector strengthening out of scope until Phase 14.**

## Accomplishments

- Added [`src/cli/commands/generate.test.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.test.ts) to prove the real `taro generate <recording.js>` path supports `--dry-run`, `--output`, and `--force` without relying on helper-only assumptions.
- Expanded [`src/core/input-loader.test.ts`](/Users/michaelgichia/workspace/taro/src/core/input-loader.test.ts) and [`src/core/recording-intelligence.test.ts`](/Users/michaelgichia/workspace/taro/src/core/recording-intelligence.test.ts) so shared loading stays truthful across `.json` and `.js` inputs and JS sync assertions no longer fragment intent grouping.
- Added [`src/core/parser.test.ts`](/Users/michaelgichia/workspace/taro/src/core/parser.test.ts) to lock in JSON URL preservation, stable `json-step-*` ids, and the absence of JS baseline leakage in the legacy parser path.
- Extended [`src/core/js-parser.test.ts`](/Users/michaelgichia/workspace/taro/src/core/js-parser.test.ts) with explicit phase-boundary coverage proving selector-only evidence remains selector-only evidence instead of becoming invented accessible queries.

## Verification

- `npm run build`
- `npm run test:run -- src/cli/commands/generate.test.ts src/core/input-loader.test.ts src/core/recording-intelligence.test.ts src/core/js-parser.test.ts src/core/parser.test.ts`

## Task Commits

1. **Task 1: Add CLI and shared-loader regression coverage** — `c19d612` (`test(13-04): cover shared loader and CLI parity`)
2. **Task 2: Add explicit JSON parity coverage and phase-boundary assertions** — `d1c4df9` (`test(13-04): prove JSON parity and phase boundaries`)

## Decisions Made

- Treated Phase 13 as the place to prove parity, not to improve selector quality, so selector-only `document.querySelector(...)` evidence stays explicit until Phase 14 has justification to strengthen it.
- Added JSON regression coverage directly to `parseRecording()` tests rather than inferring JSON safety indirectly from shared-loader behavior.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- CLI tests needed to invoke Commander with user-style argv handling so subcommand parsing matched the shipped entrypoint instead of a synthetic harness path.
- Shared-loader assertions had to move to partial matching because the normalized JS baseline now legitimately carries both recovered query evidence and standalone sync assertions on the same recording.

## Next Phase Readiness

- Phase 14 can focus strictly on truthful selector recovery because Phase 13 now has regression proof for the shared loader, public CLI JS path, and non-regression JSON path.
- The sample recorder fixture remains the canonical JS baseline asset, with tests now guarding both preserved accessible-query evidence and unresolved fallback selector evidence.

## Self-Check: PASSED
