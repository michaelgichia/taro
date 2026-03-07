---
phase: 03-query-test-design-intelligence
plan: 07
subsystem: testing
tags: [matcher-selection, rtl, generator, cli, gap-closure]

# Dependency graph
requires:
  - phase: 03-query-test-design-intelligence
    provides: Phase 3 CLI integration with one remaining TEST-03 matcher gap
provides:
  - Context-aware matcher selection carried from resolver output into generated assertions
  - Explicit TEST-03 closure metadata for milestone traceability
affects:
  - phase-07-verification-traceability-reconciliation
  - milestone traceability

# Tech tracking
tech-stack:
  added: []
  patterns: [Resolver-selected matchers persisted on QueryResult and consumed during test rendering]

key-files:
  created: []
  modified:
    - src/types/recording.ts - QueryResult carries matcher metadata
    - src/cli/commands/generate.ts - Pipeline stores resolver-selected matchers
    - src/core/generator.ts - Generator maps queries to matcher-aware assertion rendering
    - src/templates/test-template.ts - Assert steps emit the selected matcher

key-decisions:
  - "Persist matcher selection on QueryResult so resolver output and generated assertions stay aligned"

patterns-established:
  - "Matcher selection happens before template rendering and falls back only when no specialized matcher applies"

requirements-completed: [TEST-03]

# Metrics
duration: 5 min
completed: 2026-03-07
---

# Phase 3 Plan 7: Close Matcher Selection Gap

## What Was Done

Closed TEST-03 gap by wiring the existing `selectMatcher()` function fully into the test generation pipeline.

## Changes Made

### `src/types/recording.ts`
- Added `matcher?: string` field to `QueryResult` interface
- Stores context-aware matcher alongside the RTL query (e.g., `.toHaveValue()`, `.toBeChecked()`)

### `src/cli/commands/generate.ts`
- Added `selectMatcher` to import from resolver.js
- In the querySelector loop (element with known Playwright info), calls `selectMatcher(info, 'assert')` after `buildQuery()`
- Stores result as `matcher` in each `queryResults` entry

### `src/templates/test-template.ts`
- Added `matcher?: string` to `StepTemplateOptions` interface
- Updated `assert` case: `expect(${query})${opts.matcher ?? '.toBeInTheDocument()'}` — uses context-aware matcher when provided, defaults to `.toBeInTheDocument()`

### `src/core/generator.ts`
- In `generateTestFromGroups()`, builds a `matcherMap` (Map<string, string>) from `queryResults` keyed by query string
- For each assert step, looks up matcher from `matcherMap` and passes to `stepTemplate`

## Verification

- `npm run build` — clean, zero TypeScript errors
- `selectMatcher` imported and called in `generate.ts` ✓
- `matcher` field in `QueryResult` type ✓
- `stepTemplate` accepts and uses `matcher` for assert case ✓
- `generateTestFromGroups` passes matcher from queryResults to stepTemplate ✓

## Outcome

TEST-03 gap closed. Phase 3 is now 11/11 must-haves verified. The pipeline:

```
inspectElements() → buildQuery() + selectMatcher() → QueryResult { query, matcher }
    ↓
generateTestFromGroups() → matcherMap lookup → stepTemplate({ matcher })
    ↓
expect(screen.getByRole(...)).toHaveTextContent('...')  // instead of toBeInTheDocument()
```
