---
phase: 03-query-test-design-intelligence
plan: 01
subsystem: testing
tags: [typescript, vitest, testing-library, query-strategy, conventions-detection]

# Dependency graph
requires:
  - phase: 01-core-pipeline
    provides: Core CLI, Chrome Recorder parsing, basic test generation
provides:
  - ConventionsSchema and ImportStyle/MockPattern types for project convention detection
  - QueryQuality, ElementInfo, QueryResult types for intelligent query selection
  - ItGroup and GeneratedItBlock types for test structure
  - Failing test stubs for all Phase 3 modules (js-parser, resolver, scanner)
affects:
  - Phase 3 plans (02-06) that will implement query selection and convention scanning

# Tech tracking
tech-stack:
  added: []
  patterns: [Interface-first ordering - types before implementations]

key-files:
  created:
    - src/types/conventions.ts - ConventionsSchema, ImportStyle, MockPattern, ConventionFile types
    - src/core/js-parser.test.ts - Failing tests for classifyQuery, segmentIntoItGroups, parseJsRecording
    - src/core/resolver.test.ts - Failing tests for buildQuery, selectMatcher
    - src/core/scanner.test.ts - Failing tests for scanConventions, findTestFiles
  modified:
    - src/types/recording.ts - Added QueryQuality, ElementInfo, QueryResult, ItGroup, GeneratedItBlock

key-decisions:
  - "Interface-first ordering: types defined before implementations ensure stable contracts"

patterns-established:
  - "TDD RED phase: All test stubs fail with 'Cannot find module' until implementations exist"
  - "Type-only exports: No implementation code in type definition files"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 3 Plan 1: Type Contracts & Failing Test Scaffolds

**Type contracts established and RED-phase test stubs created for all Phase 3 implementations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T17:35:00Z
- **Completed:** 2026-03-06T17:38:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `src/types/conventions.ts` with ConventionsSchema, ImportStyle, MockPattern, ConventionFile types and DEFAULT_CONVENTIONS constant
- Extended `src/types/recording.ts` with QueryQuality, ElementInfo, QueryResult, ItGroup, GeneratedItBlock types
- Created three failing test stub files that import non-existent modules (establishing RED state)
- All TypeScript builds pass with new types

## Task Commits

Each task was committed atomically:

1. **Task 1: Define type contracts for Phase 3** - `112282d` (feat)
2. **Task 2: Create failing test stubs (Wave 0 scaffolds)** - `0ca4616` (test)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `src/types/conventions.ts` - New file with conventions schema types
- `src/types/recording.ts` - Extended with Phase 3 query and test design types
- `src/core/js-parser.test.ts` - Failing tests for js-parser module
- `src/core/resolver.test.ts` - Failing tests for resolver module with vi.mock('playwright')
- `src/core/scanner.test.ts` - Failing tests for scanner module

## Decisions Made
- Interface-first ordering: types defined before any implementation files reference them
- All types properly typed with no `any` - follows project coding standards

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness
- Type contracts ready for Phase 3 implementation modules to import
- Test stubs in RED state - implementations in plans 02-06 will turn them green
- Requirement completion intentionally deferred - this summary captures scaffolding only, not shipped CTX/QRY/TEST behavior
- Build passes with new types

---
*Phase: 03-query-test-design-intelligence*
*Completed: 2026-03-06*
