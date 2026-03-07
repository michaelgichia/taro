---
phase: 04-self-scoring-convention-learning
plan: 02
status: complete
completed: 2026-03-07T09:23:20Z
duration: ~10min
requirements-completed: [SCR-03]
---

# Plan 02 Summary: Post-Write Syntax Verifier

## What Was Done

Implemented a post-write syntax verifier around `@babel/parser` so generated tests can be parsed immediately after file creation.

## Changes Made

### `src/core/verifier.ts`
- Added `VerificationResult` with `valid` and optional `error`
- Added parser plugin selection by file extension:
  - `.tsx` → `typescript`, `jsx`
  - `.ts` → `typescript`
  - `.js`/`.jsx` → `jsx`
- Added `verifySyntax()` to parse generated code and return a structured success/failure result

## Verification

- `npm run build` ✓
- Verifier module compiles cleanly against the existing Babel parser dependency

## Outcome

Phase 4 now has a post-write verification primitive that can fail fast on syntax-invalid generated output while keeping the CLI integration simple.
