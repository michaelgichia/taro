---
phase: 01-core-pipeline
plan: 04
subsystem: validation
tags: [zod, schema-validation, cli]
provides:
  - validateRecording() returning ValidationResult (valid|invalid with errors)
  - formatValidationErrors() for human-readable error display
  - Validation integrated into generate command — exits with code 1 on failure
affects: [01-core-pipeline]
tech-stack:
  added: []
  patterns: [ValidationResult discriminated union, safeParse over parse]
key-files:
  created: []
  modified: [src/core/validator.ts, src/cli/commands/generate.ts]
key-decisions:
  - Used safeParse + ValidationResult instead of throwing — callers decide how to handle errors
  - passthrough() on step schema allows unknown step fields without schema rejection
  - Error paths formatted as dot-notation JSON paths for clarity
duration: 8min
completed: 2026-03-06
---

# Plan 01-04: Zod Schema Validation

**Replaced throwing validator with ValidationResult pattern — clear structured errors with JSON paths, integrated into generate command.**

## Performance
- **Duration:** 8min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Refactored validator to use `safeParse` and return `{ valid: true, data } | { valid: false, errors[] }`
- Added `key` and `url` fields to step schema; added `passthrough()` for forward-compatibility
- Generate command now validates before processing, exits cleanly with formatted error messages

## Task Commits
1. **Task 1: Zod schema with ValidationResult** - `1073576`
2. **Task 2: Integrate validation into generate command** - `35f3ffb`

## Files Created/Modified
- `src/core/validator.ts` - ValidationResult type, safeParse, formatValidationErrors()
- `src/cli/commands/generate.ts` - Validation call after JSON parse, clear error output

## Next Phase Readiness
Ready — validation gate in place before generation pipeline (01-05, 01-06).
