---
phase: 13-js-input-contract-ast-recovery
plan: "01"
subsystem: testing
tags: [input-loader, recorder-js, chrome-recorder, ast]

requires:
  - phase: 12-verification-updates-release-docs
    provides: installer-first generate flow and stable shipped CLI surface

provides:
  - shared parsed-input envelope for JSON and recorder JS
  - stable step ids assigned at the parse and load boundary
  - preserved JS baseline evidence for selectors, queries, and assertions

affects: [13-js-input-contract-ast-recovery, testing, cli]

key-files:
  created:
    - src/core/input-loader.ts
    - src/core/input-loader.test.ts
  modified:
    - src/types/recording.ts
    - src/core/parser.ts

requirements-completed: [INPUT-01, INPUT-03, QUERY-01]

completed: 2026-03-09
---

# Phase 13 Plan 01: Input Contract Summary

**Chrome Recorder JSON and recorder JS now enter Tayo through one parsed-input envelope with stable step IDs and preserved JS baseline evidence.**

## Accomplishments

- Added `ParsedInput`, JS baseline evidence descriptors, and shared step-id support in [`src/types/recording.ts`](/Users/michaelgichia/workspace/tayo/src/types/recording.ts).
- Added [`src/core/input-loader.ts`](/Users/michaelgichia/workspace/tayo/src/core/input-loader.ts) so JSON and recorder JS are detected at one boundary and returned through the same contract.
- Kept JSON delegated to [`src/core/parser.ts`](/Users/michaelgichia/workspace/tayo/src/core/parser.ts), while upgrading that path to assign stable `json-step-*` ids and preserve `settings.url`.
- Added [`src/core/input-loader.test.ts`](/Users/michaelgichia/workspace/tayo/src/core/input-loader.test.ts) coverage for `.json`, `.js`, and `@jest-environment-options`-driven JS detection plus shared-envelope behavior.

## Verification

- `npm run build`
- `npm run test:run -- src/core/input-loader.test.ts`

## Task Commits

1. **Task 1: Define the shared parsed-input and baseline metadata contracts** — `a76c074` (`feat(13-01): add shared parsed-input contracts`)
2. **Task 2: Add a shared source loader for JSON and JS inputs** — `a0af35d` (`feat(13-01): add shared recording input loader`)

## Decisions Made

- Used a discriminated `ParsedInput` envelope instead of carrying another `isJsFormat` boolean through the CLI.
- Assigned stable step IDs at the parser and loader boundary so later plans can reference baseline evidence without rewriting existing downstream consumers first.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- Vitest scanned literal `@jest-environment-options` fixture text before test collection, so the tests now construct that directive dynamically.
- The initial JS fixture used invalid top-level `await`; wrapping the fixture in a minimal `test(..., async () => {})` shape matched the real recorder export format and resolved it.

## Next Phase Readiness

- Phase 13-02 can now recover richer AST truth into `ParsedInput.baseline` without reopening the file-detection or contract boundary.
- The CLI still branches separately for JS vs JSON, which remains intentional until Phase 13-03 routes the shipped command through the shared loader.

## Self-Check: PASSED
