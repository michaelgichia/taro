---
phase: 05-recording-intelligence-recovery
plan: 03
status: complete
completed: 2026-03-07T10:10:16Z
duration: ~5min
---

# Plan 03 Summary: Generate Pipeline Integration

## What Was Done

Integrated the recording-intelligence layer into both `taro generate` input paths and verified that cleanup, scoring, and post-write verification still coexist in the real CLI flow.

## Changes Made

### `src/core/js-parser.ts`
- Tagged parsed JS steps with `source: 'js'`
- Preserved source line metadata on generated steps so the shared analyzer can reason over a consistent step shape

### `src/core/js-parser.test.ts`
- Added coverage proving parsed JS steps carry source metadata needed by the analyzer contract

### `src/cli/commands/generate.ts`
- Imported `analyzeRecording()` from the new recording-intelligence module
- Added cleanup-summary logging via `summarizeCleanup()`
- Routed JSON recordings through `analyzeRecording()` before `generateTest()`
- Routed JS recordings through `analyzeRecording()` before `generateTestFromGroups()`
- Switched JS multi-`it()` generation to use analyzer-produced intent groups instead of raw pre-analysis groups
- Preserved the existing order of:
  - score calculation
  - score hints
  - file writing
  - post-write verification
  - convention merge hooks

## Verification

Automated:
- `npm run test:run -- src/core/js-parser.test.ts src/core/recording-intelligence.test.ts` ✓
- `npm run build` ✓

Manual:
- `node dist/index.js generate /tmp/taro-phase5-noisy.json -o /tmp/taro-phase5-noisy.test.tsx --force` ✓
  - cleanup summary reported dblClick noise + cursor wander removal
  - post-write verification ran
  - output contained one semantic click instead of the noisy cluster
- `node dist/index.js generate /tmp/taro-phase5-valid-js.js -o /tmp/taro-phase5-valid-js.test.tsx --force` ✓
  - cleanup summary reported dblClick noise + intent groups
  - post-write verification ran
  - generated output used analyzer-derived intent grouping

## Outcome

Phase 5’s recording-intelligence layer is now active in the real CLI pipeline. Both supported input formats pass through cleanup before generation, and the existing Phase 4 score/verification flow still runs after generation.
