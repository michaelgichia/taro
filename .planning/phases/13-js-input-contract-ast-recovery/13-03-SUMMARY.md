---
phase: 13-js-input-contract-ast-recovery
plan: "03"
subsystem: testing
tags: [normalizer, cli, recorder-js, generate]

requires:
  - phase: 13-js-input-contract-ast-recovery
    provides: shared parsed-input envelope and AST-derived recorder evidence

provides:
  - dedicated JS baseline normalization into the shared recording contract
  - shared CLI loader path for JSON and recorder JS inputs
  - grouping-safe analysis of normalized JS sync assertions

affects: [13-js-input-contract-ast-recovery, cli, testing]

key-files:
  created:
    - src/core/baseline-normalizer.ts
  modified:
    - src/types/recording.ts
    - src/core/input-loader.ts
    - src/cli/commands/generate.ts
    - src/core/recording-intelligence.ts
    - src/core/generator.ts

requirements-completed: [INPUT-01, INPUT-02, INPUT-03, QUERY-01]

completed: 2026-03-09
---

# Phase 13 Plan 03: Normalization & CLI Summary

**Recorder JS now enters the shipped `tayo generate` flow through the shared loader and a dedicated baseline normalizer, carrying recovered query evidence into the common analysis and dry-run path.**

## Accomplishments

- Added [`src/core/baseline-normalizer.ts`](/Users/michaelgichia/workspace/tayo/src/core/baseline-normalizer.ts) to merge JS query, selector, and assertion evidence back onto shared recording steps and preserve normalized baseline metadata.
- Extended [`src/types/recording.ts`](/Users/michaelgichia/workspace/tayo/src/types/recording.ts) and [`src/core/input-loader.ts`](/Users/michaelgichia/workspace/tayo/src/core/input-loader.ts) so the richer AST-derived baseline travels intact from parsing into normalization.
- Refactored [`src/cli/commands/generate.ts`](/Users/michaelgichia/workspace/tayo/src/cli/commands/generate.ts) to use `loadInput()` for both JSON and recorder JS, with JS routed through `normalizeJsBaseline()` instead of an early special-case branch.
- Updated [`src/core/recording-intelligence.ts`](/Users/michaelgichia/workspace/tayo/src/core/recording-intelligence.ts) and [`src/core/generator.ts`](/Users/michaelgichia/workspace/tayo/src/core/generator.ts) so environment-sync assertions stop fragmenting intent groups and recovered `screen.getBy...` evidence survives into generated dry-run output.

## Verification

- `npm run build`
- `node dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run`

## Task Commits

1. **Task 1: Add a dedicated JS baseline normalizer** — `b364bf0` (`feat(13-03): add JS baseline normalizer`)
2. **Task 2: Route recorder JS through the shared generation flow** — `dbe3846` (`feat(13-03): route JS through shared generate flow`)

## Decisions Made

- Carried AST-derived evidence through normalization by attaching it to shared step metadata rather than reopening the JSON parser or inventing a second analysis pipeline.
- Treated location/title expectations as sync assertions for grouping so recorder environment checks do not fragment user-intent groups before suite planning lands.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The shipped dry-run command succeeded, but Playwright visual capture and selector inspection both failed under the sandboxed browser launch restrictions (`bootstrap_check_in ... Permission denied`). The CLI already handled those failures as warnings and fell back to non-enriched output, so plan verification still passed.

## Next Phase Readiness

- Phase 13-04 can now lock in regression coverage for the shared loader and built CLI path instead of testing a transient JS-only branch.
- Accessible query evidence now survives parsing and normalization into the generated preview, while unresolved CSS selectors remain explicit placeholders for later Phase 14 strengthening work.

## Self-Check: PASSED
