---
phase: 03-query-test-design-intelligence
plan: 02
subsystem: testing
tags: [babel, ast, parsing, testing-library, jest]

# Dependency graph
requires:
  - phase: 03-01
    provides: Type contracts and failing test stubs for js-parser
provides:
  - Babel AST-based parser for Testing Library Recorder JS files
  - Query quality classification (excellent/good/acceptable/fragile)
  - Modal boundary detection for ItGroup segmentation
  - Environment URL extraction from @jest-environment-options
  - CSS selector extraction for Playwright resolution
affects:
  - 03-03 (resolver implementation)
  - 03-04 (test generation)

# Tech tracking
tech-stack:
  added: [@babel/parser, @babel/traverse]
  patterns: [AST visitor pattern, ESM interop with CommonJS libs, TDD]

key-files:
  created: [src/core/js-parser.ts]
  modified: []

key-decisions:
  - "Used static map for query quality classification (not switch statement)"
  - "ESM interop pattern for @babel/traverse: import _traverse; const traverse = (_traverse as any).default ?? _traverse"
  - "Modal boundary: click + assert with matching target name splits groups"

patterns-established:
  - "Babel AST traversal for extracting RTL queries and userEvent calls"
  - "segmentIntoItGroups returns ItGroup[] with named groups at boundaries"

requirements-completed: [QRY-01, TEST-01]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 3 Plan 2: Babel AST Parser for Testing Library Recorder JS Summary

**Babel AST-based parser that extracts RTL queries, segments steps into ItGroups at modal boundaries, and extracts environment URL from file headers**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T17:40:00Z
- **Completed:** 2026-03-06T17:42:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Implemented classifyQuery with quality tier mapping
- Implemented extractEnvironmentUrl parsing @jest-environment-options header
- Implemented segmentIntoItGroups with modal boundary detection
- Implemented parseJsRecording using Babel AST visitor
- All 8 tests passing (TDD GREEN phase)

## Task Commits

1. **Task 1: Implement js-parser.ts** - `e56afd8` (feat)

**Plan metadata:** (part of task commit)

## Files Created/Modified
- `src/core/js-parser.ts` - Babel AST parser with classifyQuery, extractEnvironmentUrl, segmentIntoItGroups, parseJsRecording exports
- `src/core/js-parser.test.ts` - 8 tests (pre-existing from 03-01)

## Decisions Made
- Used static QUERY_QUALITY_MAP object for classifyQuery (cleaner than switch)
- All screen.getBy* calls become assert actions in steps (per plan simplicity)
- document.querySelector calls tracked separately for Playwright resolution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial segmentIntoItGroups implementation had boundary logic bug (closing group after boundary click instead of before) - fixed by checking boundary BEFORE adding step to current group

## Next Phase Readiness
- js-parser complete, ready for resolver implementation in 03-03
- parseJsRecording returns JsParseResult with all needed data for test generation

---
*Phase: 03-query-test-design-intelligence*
*Completed: 2026-03-06*
