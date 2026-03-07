---
phase: 06-visual-mock-intelligence-recovery
plan: 04
status: complete
completed: 2026-03-07T10:32:13Z
duration: ~10min
---

# Plan 04 Summary: Mock Lifecycle, Stability, and Generate Integration

## What Was Done

Finished the mock-intelligence layer by detecting mutation lifecycle patterns and unstable mock-instance usage, then integrated that analysis into `taro generate` alongside the existing visual-intelligence, scoring, and post-write verification pipeline.

## Changes Made

### `src/types/conventions.ts`
- Added `MutationLifecycleStage`
- Added `MutationLifecyclePattern`
- Added `MockInstabilityKind`
- Added `MockInstabilityWarning`

### `src/core/mock-intelligence.ts`
- Added `analyzeMutationLifecycle()` for deterministic loading/success/error pattern detection
- Added `detectMockInstability()` for recreated factory and per-test churn warnings
- Extended `analyzeMocks()` to return lifecycle findings and stability warnings in one advisory result

### `src/core/mock-intelligence.test.ts`
- Added focused coverage for:
  - mutation lifecycle detection
  - mock stability warnings

### `src/cli/commands/generate.ts`
- Added advisory mock-analysis integration before generation in both JS and JSON flows
- Added concise CLI summaries for repeated targets, extraction hints, mutation lifecycle findings, and stability warnings
- Kept generation, scoring, write, and post-write verification ordering intact

### `src/core/generator.ts`
- Fixed JS multi-`it()` generation to reconstruct valid RTL query expressions from JS-derived steps during end-to-end verification

### `src/core/generator.test.ts`
- Added a regression test proving JS-derived multi-`it()` output parses successfully after query reconstruction

### `src/core/recording-intelligence.ts`
- Fixed dialog-capture selector selection to skip navigation URLs and prefer actionable element targets

### `src/core/recording-intelligence.test.ts`
- Added coverage proving visual capture candidates prefer non-navigation selectors

## Verification

- `npm run test:run -- src/core/mock-intelligence.test.ts src/core/generator.test.ts src/core/recording-intelligence.test.ts` ✓
- `npm run build` ✓
- `node /Users/michaelgichia/workspace/taro/dist/index.js generate dialog-recording.js --output generated.test.tsx --force` from `/tmp/taro-phase6-manual.Bjufyv` ✓

## Outcome

Taro now captures dialog-aware visual state, analyzes mock strategy before generation, emits mutation/stability advice, and still completes scoring plus post-write verification in the real CLI path.
