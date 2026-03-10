---
phase: 06-visual-mock-intelligence-recovery
plan: 02
status: complete
completed: 2026-03-07T10:21:00Z
duration: ~5min
---

# Plan 02 Summary: Dialog-State Understanding + Visual Integration

## What Was Done

Connected Phase 5 intent groups to Phase 6 visual intelligence so dialog-like or ambiguous UI states can trigger explicit visual-state capture before generation.

## Changes Made

### `src/core/recording-intelligence.ts`
- Added `VisualCaptureCandidate` to describe why a cleaned intent group should trigger visual capture
- Added `findVisualCaptureCandidates()` to flag dialog-like flows from analyzer-produced intent groups using deterministic heuristics

### `src/core/recording-intelligence.test.ts`
- Added coverage proving dialog-like intent groups are marked for visual capture

### `src/cli/commands/generate.ts`
- Imported `captureVisualState()` and `findVisualCaptureCandidates()`
- Added `maybeCaptureVisualState()` to invoke visual capture conservatively:
  - first for dialog-like intent groups
  - then for selector ambiguity in the JS path
- Added `summarizeVisualState()` for concise CLI reporting
- Added `findRecordingUrl()` so the JSON path can reuse navigation targets for visual capture
- Kept the existing pipeline order intact:
  - cleanup
  - visual intelligence
  - generation
  - scoring
  - write
  - post-write verification

## Verification

- `npm run test:run -- src/core/resolver.test.ts src/core/recording-intelligence.test.ts` ✓
- `npm run build` ✓

## Outcome

Tayo can now recognize dialog-heavy or ambiguous UI states from analyzed recordings and trigger visual-state capture intentionally, without turning Playwright screenshots into a noisy always-on behavior.
