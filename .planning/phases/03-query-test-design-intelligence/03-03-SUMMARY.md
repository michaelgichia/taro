---
phase: 03-query-test-design-intelligence
plan: 03
subsystem: testing
tags: [playwright, dom-inspection, css-selector-resolution, react-testing-library, headless-chromium]

# Dependency graph
requires:
  - phase: 03-query-test-design-intelligence
    provides: ElementInfo type, QueryResult type from src/types/recording.ts
provides:
  - Playwright-based DOM inspection module
  - buildQuery function for RTL query generation
  - selectMatcher function for matcher selection
  - inspectElement for single-element inspection
  - inspectElements for batch inspection with single browser
  - emitQry03Warning helper for fragile query warnings
affects: [query-generation, css-selector-resolution, js-parser-fallbacks]

# Tech tracking
tech-stack:
  added: [playwright]
  patterns: [priority-query-selection, batch-browser-inspection, graceful-error-handling]

key-files:
  created: [src/core/resolver.ts]
  modified: [package.json]

key-decisions:
  - "playwright added as runtime dependency (not devDep) for CLI usage"
  - "Browser launched once per batch for efficiency (Pattern 3 from RESEARCH)"
  - "All inspect functions return null on ANY error - no crashes"

patterns-established:
  - "Priority query selection: getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId"
  - "ROLE_MAP for implied ARIA roles from tag names"

requirements-completed: [QRY-02, QRY-03]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 3 Plan 3: resolver.ts with Playwright DOM inspection

**Playwright-based DOM inspection module with priority RTL query selection and batch browser efficiency**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T14:49:16Z
- **Completed:** 2026-03-06T14:52:00Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- Installed Playwright with Chromium browser binary
- Implemented resolver.ts with all required functions:
  - buildQuery: Priority-based RTL query selection (5 tiers)
  - selectMatcher: Context-aware matcher selection (5 cases)
  - inspectElement: Single-element inspection with graceful error handling
  - inspectElements: Batch inspection with single browser launch
  - emitQry03Warning: Console warning for fragile queries

## Task Commits

1. **Task 1: Install Playwright** - `90abb1b` (deps)
2. **Task 2: Implement resolver.ts** - `72effb2` (feat)

## Files Created/Modified
- `src/core/resolver.ts` - Main implementation (265 lines)
- `package.json` - Added playwright dependency
- `package-lock.json` - Updated

## Decisions Made

- Used ROLE_MAP for implied ARIA roles from tag names (research pattern)
- Browser launched once per batch for efficiency (Pitfall 3 fix)
- All inspect functions wrapped in try/catch returning null on any error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- resolver.ts ready for JS parser fallback integration
- Matcher selection logic exists here, but TEST-03 was only fully closed once Plan 07 wired it into generated assertions
- All tests pass (7/7)
- TypeScript build succeeds

---
*Phase: 03-query-test-design-intelligence*
*Completed: 2026-03-06*
