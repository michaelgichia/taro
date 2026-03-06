---
phase: 01-core-pipeline
plan: 05
subsystem: generation
tags: [rtl, testing-library, code-generation, user-event]
provides:
  - importBlock() generates correct RTL/jest-dom/user-event imports
  - stepTemplate() maps each NormalizedAction to RTL/user-event code
  - describeBlock() wraps steps in describe/it structure with userEvent.setup()
  - generateTest() produces complete GeneratedTest from NormalizedRecording
  - selectorToQuery() converts CSS selectors to RTL queries (accessibility-first)
affects: [01-core-pipeline]
tech-stack:
  added: []
  patterns: [accessibility-first query priority, action-map template dispatch]
key-files:
  created: [src/templates/test-template.ts]
  modified: [src/core/generator.ts]
key-decisions:
  - Query priority: data-testid > aria-label > role inference > getByTestId fallback with TODO comment
  - user-event v14 setup() pattern (not legacy direct calls)
  - Unknown steps emit TODO comments, not errors — keeps partial recordings usable
  - navigate steps become comments since RTL does not navigate
duration: 12min
completed: 2026-03-06
---

# Plan 01-05: RTL Test Code Generation

**Generator converts NormalizedRecording into complete, runnable RTL test files using accessibility-first query selection.**

## Performance
- **Duration:** 12min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `src/templates/test-template.ts` with composable template functions for all action types
- Implemented `selectorToQuery()` with CSS-to-RTL query conversion (data-testid, aria-label, role inference)
- `generateTest()` produces full test code: imports + describe + it + userEvent.setup()
- Verified with Login Flow sample — 5 steps correctly mapped to RTL assertions and user-event calls

## Task Commits
1. **Task 1: Test code templates** - `21e160e`
2. **Task 2: Generator implementation** - `062bb11`

## Files Created/Modified
- `src/templates/test-template.ts` — importBlock, stepTemplate, describeBlock functions
- `src/core/generator.ts` — Full generateTest() with selectorToQuery and accessibility-first queries

## Next Phase Readiness
Ready — generator outputs GeneratedTest.code string consumed by writer (01-06).
