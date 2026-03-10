---
phase: 06-visual-mock-intelligence-recovery
plan: 03
status: complete
completed: 2026-03-07T10:22:19Z
duration: ~5min
---

# Plan 03 Summary: Mock-Intelligence Analysis Foundation

## What Was Done

Built a dedicated mock-intelligence module that detects repeated mock targets and recommends whether mocks should stay inline or be extracted, without overloading the convention scanner.

## Changes Made

### `src/types/conventions.ts`
- Added `MockRecommendationKind`
- Added `MockTargetUsage`
- Added `MockRecommendation`

### `src/core/scanner.ts`
- Added `readTestFiles()` so downstream analyzers can reuse discovered test files and content without reimplementing file traversal
- Kept the scanner itself focused on coarse convention detection

### `src/core/mock-intelligence.ts`
- Added `scanMockTargets()` to detect mock targets across discovered test files
- Added `deriveMockRecommendations()` to map repeat count to deterministic `inline` vs `extract` recommendations
- Added `analyzeMocks()` to combine conventions and mock-target analysis into a single result

### `src/core/mock-intelligence.test.ts`
- Added coverage for:
  - repeated mock-target detection
  - inline vs extract recommendation heuristics
  - combined mock-analysis output with conventions

## Verification

- `npm run test:run -- src/core/mock-intelligence.test.ts src/core/scanner.test.ts` ✓
- `npm run build` ✓

## Outcome

Tayo now has a real mock-intelligence foundation instead of just a majority mock-style flag. The final Phase 6 plan can build mutation lifecycle/stability reasoning and wire mock analysis into generation.
