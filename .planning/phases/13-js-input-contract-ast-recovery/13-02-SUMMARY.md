---
phase: 13-js-input-contract-ast-recovery
plan: "02"
subsystem: testing
tags: [babel, ast, recorder-js, parser]

requires:
  - phase: 13-js-input-contract-ast-recovery
    provides: shared parsed-input envelope and loader boundary

provides:
  - AST-derived recovery for nested userEvent targets
  - explicit URL and document-title assertion evidence
  - sample-backed parser regression coverage for recorder JS

affects: [13-js-input-contract-ast-recovery, testing, cli]

key-files:
  modified:
    - package.json
    - package-lock.json
    - src/core/js-parser.ts
    - src/core/js-parser.test.ts

requirements-completed: [INPUT-03, QUERY-01]

completed: 2026-03-09
---

# Phase 13 Plan 02: AST Recovery Summary

**Recorder JS parsing now recovers nested Testing Library queries, fallback selectors, and expectation subjects structurally from the AST instead of flattening them into fake action targets.**

## Accomplishments

- Refactored [`src/core/js-parser.ts`](/Users/michaelgichia/workspace/taro/src/core/js-parser.ts) to use explicit Babel node guards and recover `userEvent(screen.getBy...)`, `userEvent(document.querySelector(...))`, and `expect(...)` structures truthfully.
- Added direct `@babel/types` support in [`package.json`](/Users/michaelgichia/workspace/taro/package.json) and aligned [`package-lock.json`](/Users/michaelgichia/workspace/taro/package-lock.json) with the new parser dependency surface.
- Parser output now preserves recorder `test('...')` titles, query evidence, selector evidence, and assertion metadata without doing Phase 14 selector strengthening early.
- Replaced toy-only parser coverage in [`src/core/js-parser.test.ts`](/Users/michaelgichia/workspace/taro/src/core/js-parser.test.ts) with focused nested-call tests plus golden assertions against `sample/sample-rest-recordingextension-output.js`.

## Verification

- `npm run build`
- `npm run test:run -- src/core/js-parser.test.ts`

## Task Commits

1. **Task 1: Strengthen AST parsing around real recorder shapes** — `c7dc074` (`feat(13-02): recover recorder AST intent`)
2. **Task 2: Replace toy parser tests with recorder-shaped regression coverage** — `420a81d` (`test(13-02): cover recorder-shaped parser recovery`)

## Decisions Made

- Used exact source slices as baseline evidence so role/name options and matcher subjects survive parsing even before later phases decide how to strengthen or transform them.
- Kept selector recovery truthful by preserving raw `document.querySelector(...)` evidence and associated step IDs, leaving selector hardening to Phase 14.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `npm install --package-lock-only` emitted a non-blocking `EBADENGINE` warning from `eslint-visitor-keys@5.0.1` under Node `v23.11.0`; the lockfile still updated successfully and verification stayed green.

## Next Phase Readiness

- Phase 13-03 can now normalize richer AST-derived metadata and route the shipped CLI through the shared input loader without re-parsing recorder JS heuristically.
- Sample-backed parser coverage now protects against regressions where nested query operands degrade into fake `"click"` or `"type"` targets.

## Self-Check: PASSED
