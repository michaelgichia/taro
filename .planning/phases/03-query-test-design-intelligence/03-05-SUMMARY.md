---
phase: 03-query-test-design-intelligence
plan: 05
subsystem: testing
tags: [templates, generator, multi-it, query-quality, esm, cjs]

# Dependency graph
requires:
  - phase: 03-query-test-design-intelligence
    provides: ItGroup, QueryResult, QueryQuality, ConventionsSchema
  - phase: 03-query-test-design-intelligence
    provides: describeBlock, importBlock, stepTemplate
provides:
  - describeBlockMultiIt() - generates N separate it() blocks
  - ItBlockTemplate interface - type for it block data
  - importBlock() with importStyle param - ESM/CJS support
  - generateTestFromGroups() - generates test from ItGroup[]
  - emitQuerySummary() - emits quality-annotated query lines
  - GeneratedTestV3 interface - extends GeneratedTest with metadata
affects: [CLI generation pipeline, future test output formats]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-it test generation, import style detection, query quality reporting]

key-files:
  created: []
  modified: [src/templates/test-template.ts, src/core/generator.ts]

key-decisions:
  - "describeBlockMultiIt generates independent it() blocks each with own render() and userEvent.setup()"
  - "importBlock backward-compatible - defaults to ESM, accepts explicit importStyle"
  - "emitQuerySummary groups by method, shows count + quality tier per unique method"
  - "GeneratedTestV3 extends GeneratedTest with optional fields (backward-compatible)"

patterns-established:
  - "Multi-it test pattern: one it() per ItGroup with isolated setup"
  - "Query quality summary pattern: method grouping + tier reporting"
  - "Import style convention pattern: scanned convention → generator option"

requirements-completed: [QRY-01, TEST-01]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 3 Plan 05: Multi-it() Template & Generator Extension Summary

**Extended template and generator for multi-it() output, import style conventions, and query quality summary emission**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T14:58:32Z
- **Completed:** 2026-03-06T18:01:xxZ
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `ItBlockTemplate` interface and `describeBlockMultiIt` function to test-template.ts
- Updated `importBlock` to accept optional `importStyle` parameter ('esm' | 'cjs')
- Added `GeneratedTestV3` interface extending GeneratedTest with queryResults and itGroupCount
- Added `emitQuerySummary(queryResults)` function - groups queries by method, emits quality-annotated lines
- Added `generateTestFromGroups(title, itGroups, options)` function - generates test from ItGroup[]
- All existing exports unchanged for backward compatibility
- Build passes with no TypeScript errors
- All 24 tests pass

## Task Commits

1. **Task 1: Extend test-template.ts** - `44da3e8` (feat)
2. **Task 2: Extend generator.ts** - `44da3e8` (feat)

**Plan metadata:** (to be committed after summary)

## Files Created/Modified

- `src/templates/test-template.ts` - Added ItBlockTemplate interface, describeBlockMultiIt function, updated importBlock with importStyle param
- `src/core/generator.ts` - Added GeneratedTestV3, emitQuerySummary, generateTestFromGroups, imports for new template functions

## Decisions Made

- Multi-it blocks each have their own `render(<App />)` and conditional `userEvent.setup()` - ensures test isolation
- ESM is default import style (backward-compatible) - projects using CJS can pass `importStyle: 'cjs'`
- emitQuerySummary only outputs for fragile queries with line numbers - reduces noise for good queries
- GeneratedTestV3 uses optional fields - existing code using GeneratedTest continues to work unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None

## Issues Encountered

None

## Next Phase Readiness

- Multi-it test generation ready for integration with js-parser.ts ItGroup output
- Convention importStyle can flow from scanner.ts through to generateTestFromGroups
- emitQuerySummary can be called after js-parser produces QueryResult[] to show quality summary
- Matcher-aware assertion rendering still depended on later pipeline wiring, which landed in Plan 07
- Existing generateTest() pipeline unchanged - can continue using monolithic it() block

---
*Phase: 03-query-test-design-intelligence*
*Completed: 2026-03-06*
