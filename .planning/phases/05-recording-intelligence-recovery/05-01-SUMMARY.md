---
phase: 05-recording-intelligence-recovery
plan: 01
status: complete
completed: 2026-03-07T10:05:44Z
duration: ~10min
---

# Plan 01 Summary: Recorder Metadata + Noise Filtering Foundation

## What Was Done

Established the recording-intelligence foundation by preserving recorder metadata during JSON parsing and adding a dedicated analyzer for redundant-click, dblClick-noise, and cursor-wandering cleanup.

## Changes Made

### `src/types/recording.ts`
- Added `RecordingSource` to distinguish JSON and JS-originated steps
- Extended `NormalizedStep` with optional recorder metadata:
  - `selectors`
  - `assertedEvents`
  - `key`
  - `line`
  - `x`, `y`, `offsetX`, `offsetY`
- Added `RecordingDiagnostics`, `IntentGroup`, and `AnalyzedRecording` types for the new recording-intelligence pipeline

### `src/core/parser.ts`
- Added metadata-preserving step normalization via `withMetadata()`
- Kept current generation-friendly fields (`action`, `target`, `value`, `originalType`) intact
- Preserved source evidence needed for REC-01 through REC-03 instead of dropping it during parse

### `src/core/recording-intelligence.ts`
- Added `filterNoiseSteps()` for:
  - redundant same-target click consolidation
  - separate dblClick / tripleClick noise accounting
  - movement-only / cursor-wander cleanup
- Added `inferIntentGroups()` baseline grouping so analyzed recordings have a stable output shape
- Added `analyzeRecording()` as the public entry point returning cleaned steps plus diagnostics

### `src/core/recording-intelligence.test.ts`
- Added coverage for metadata preservation in `normalizeStep()`
- Added REC-01 redundant click filtering test
- Added REC-02 dblClick noise classification test
- Added REC-03 cursor wandering cleanup test
- Added `analyzeRecording()` diagnostics test

## Verification

- `npm run test:run -- src/core/recording-intelligence.test.ts` ✓
- `npm run build` ✓

## Outcome

Taro now has a dedicated recording-intelligence foundation with analyzable step metadata and deterministic cleanup heuristics. The next plan can build REC-04 intent inference on top of this cleaned recording model instead of trying to infer intent from lossy raw recorder output.
