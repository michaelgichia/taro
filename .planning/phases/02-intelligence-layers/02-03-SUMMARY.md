---
phase: 02-intelligence-layers
plan: "03"
subsystem: testing
tags: mocking, msw, jest, api-mocking, test-generation

# Dependency graph
requires:
  - phase: 01-core-pipeline
    provides: Recording parser and core pipeline infrastructure
provides:
  - API call detection from recordings and codebase
  - Mock target analysis with library recommendations
  - Mock code generation for multiple libraries
  - Integration into test generation pipeline
affects: test-generation, phase-03-query-test-design

# Tech tracking
tech-stack:
  added: []
  patterns: 
    - Mock library detection from package.json
    - Inline vs extracted mock decision logic
    - Multi-framework mock generation (MSW, jest.fn, sinon, nock, fetch-mock, undici)

key-files:
  created:
    - src/analyzer/mocks/detector.ts - API call detection
    - src/analyzer/mocks/target-analyzer.ts - Mock target analysis
    - src/generator/mocks/builder.ts - Mock code generation
  modified:
    - src/core/orchestrator.ts - Pipeline integration

key-decisions:
  - "MOCK-01: fetch, XMLHttpRequest, and common API patterns detected"
  - "MOCK-02: Common mock libraries (msw, jest.fn, sinon) identified"
  - "MOCK-03: Inline vs extracted mock decision made intelligently"
  - "MOCK-04: Valid mock code generated"

patterns-established:
  - "Mock detection runs after parser.normalize() before generator.generate()"
  - "Mock detection can be disabled via --no-mocks flag"

# Metrics
duration: 7min
completed: 2026-03-06
---

# Phase 2 Plan 3: Mock Intelligence Summary

**API call detection and mock generation module for automatic test mocking**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T13:37:10Z
- **Completed:** 2026-03-06T13:44:11Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- API call detector identifies fetch, XMLHttpRequest, and axios patterns in recordings and codebase
- Mock target analyzer detects available mock libraries and recommends best option
- Mock code builder generates valid mock code for MSW, jest.fn, sinon, nock, fetch-mock, and undici
- Integrated into orchestrator pipeline with --no-mocks flag for disabling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API call detector** - `c17b8f7` (feat)
2. **Task 2: Create mock target analyzer** - `0bec337` (feat)
3. **Task 3: Create mock code builder** - `8bd6c62` (feat)
4. **Task 4: Integrate mock detection into pipeline** - `796b388` (feat)

## Files Created/Modified

- `src/analyzer/mocks/detector.ts` - API call detection (322 lines)
- `src/analyzer/mocks/target-analyzer.ts` - Mock target analysis (425 lines)
- `src/generator/mocks/builder.ts` - Mock code generation (408 lines)
- `src/core/orchestrator.ts` - Pipeline integration (+107 lines)

## Decisions Made

- MOCK-01: fetch, XMLHttpRequest, and common API patterns detected
- MOCK-02: Common mock libraries (msw, jest.fn, sinon) identified
- MOCK-03: Inline vs extracted mock decision made intelligently
- MOCK-04: Valid mock code generated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

Mock detection ready for test generation integration. The mock context is now available to pass to the generator for including mocks in generated tests.

---
*Phase: 02-intelligence-layers*
*Completed: 2026-03-06*
