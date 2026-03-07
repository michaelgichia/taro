---
phase: 01-core-pipeline
plan: 03
subsystem: parsing
tags: [chrome-recorder, typescript, normalization]
provides:
  - TypeScript types for ChromeRecorderExport, ChromeStep, NormalizedStep, NormalizedRecording
  - parseRecording() reads JSON file and returns NormalizedRecording
  - normalizeStep() maps all Chrome Recorder step types to internal actions
affects: [01-core-pipeline]
tech-stack:
  added: []
  patterns: [action-map normalization, unknown-step warning]
key-files:
  created: [src/types/recording.ts, src/core/parser.ts]
  modified: [src/core/generator.ts]
key-decisions:
  - Used action map object over switch for cleaner normalization
  - doubleClick maps to 'click', change maps to 'fill' (semantically equivalent)
  - Unknown/no-op steps emit console.warn and return action:'unknown' (not error)
requirements-completed: [INPT-01, INPT-02]
duration: 10min
completed: 2026-03-06
---

# Plan 01-03: Chrome Recorder JSON Parser

**Full Chrome Recorder step normalization — reads JSON files and maps all step types to a typed internal representation.**

## Performance
- **Duration:** 10min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `src/types/recording.ts` with complete type hierarchy (ChromeRecorderExport → NormalizedRecording)
- Implemented `parseRecording(filePath)` with file read, JSON parse, and step normalization
- All step types handled: click, fill, select, scroll, assert, navigate, keyDown (and aliases)

## Task Commits
1. **Task 1: Create recording types** - `c64f693`
2. **Task 2: Implement parser with step normalization** - `97025d6`

## Files Created/Modified
- `src/types/recording.ts` - Full type hierarchy for Chrome Recorder and normalized steps
- `src/core/parser.ts` - parseRecording() + normalizeStep() with action map
- `src/core/generator.ts` - Updated import to use NormalizedRecording from types module

## Next Phase Readiness
Ready — parser exports `parseRecording` and `normalizeStep` for use in validation (01-04) and generation (01-05).
