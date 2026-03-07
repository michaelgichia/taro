---
phase: 03-query-test-design-intelligence
plan: 07
status: complete
completed: 2026-03-07T00:00:00.000Z
duration: ~5min
---

# Plan 07 Summary: Wire selectMatcher() into Pipeline (Gap Closure)

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
