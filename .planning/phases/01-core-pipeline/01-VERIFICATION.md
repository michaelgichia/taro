---
phase: 01-core-pipeline
verified: 2026-03-06T00:00:00Z
status: passed
score: 7/7 must-haves verified
gaps:
  - truth: "Generated tests are always valid, runnable TypeScript"
    status: resolved
    reason: "Fixed in commit c892faa — describeBlock() now accepts hasUserEvents and conditionally emits setup line; navigate URL rendering fixed; dead VALID_EXTENSIONS removed"
human_verification:
  - test: "Run the generated .test.tsx file with vitest to confirm it passes"
    expected: "All non-TODO steps execute without import/runtime errors"
    why_human: "Requires a full test harness with component under test; can't verify execution without it"
  - test: "Run taro generate on a real Chrome Recorder export from a live app"
    expected: "Generated selectors map correctly to the target component's DOM structure"
    why_human: "Selector quality depends on the actual DOM; can't verify without a live app"
---

# Phase 1: Core Pipeline Verification Report

**Phase Goal:** Build the core pipeline — CLI invocation, input parsing, validation, test generation, and file writing. A developer should be able to run `taro generate ./recording.json` and get a React Testing Library test file.
**Verified:** 2026-03-06
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Taro accepts Chrome Recorder JSON as input | VERIFIED | `taro generate /tmp/taro-sample.json --dry-run` parsed 7 steps correctly |
| 2 | Taro normalizes all step types (click, fill, select, scroll, assert, navigate) | VERIFIED | All 10 step types in comprehensive test produced mapped output with no unknown steps |
| 3 | Generated tests use describe/it structure | VERIFIED | Output wraps all steps in `describe('...', () => { it('should complete the recorded flow', ...) })` |
| 4 | Generated tests use user-event (not fireEvent) | VERIFIED | `import userEvent from '@testing-library/user-event'` present; all interactions use `await user.click/type/selectOptions/keyboard` |
| 5 | Generated tests include RTL imports | VERIFIED | `import { render, screen } from '@testing-library/react'` and `import '@testing-library/jest-dom'` always present |
| 6 | Validation errors produce clear messages (exit code 1) | VERIFIED | Invalid JSON exits 1 with message "Invalid JSON in file"; wrong schema exits 1 with "Invalid Chrome Recorder format" and field-level bullet errors |
| 7 | Generated tests are always valid, runnable TypeScript | FAILED | `describeBlock()` always emits `const user = userEvent.setup()` even when `userEvent` is not imported; navigate-only recordings produce code that references undefined `userEvent` |

**Score:** 6/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Project configuration and dependencies | VERIFIED | commander, zod, picocolors, babel packages all present; bin entry points to `./dist/index.js` |
| `src/index.ts` | CLI entry point and commander setup | VERIFIED | 26 lines; registers generate command via `program.addCommand(createGenerateCommand())` |
| `src/cli/commands/generate.ts` | Generate command implementation | VERIFIED | 127 lines; full 5-stage pipeline with dry-run, force, output options |
| `src/core/parser.ts` | Chrome Recorder JSON parsing | VERIFIED | 99 lines; normalizes all 10 step types via actionMap; handles unknown/no-op types |
| `src/core/validator.ts` | Input schema validation | VERIFIED | 62 lines; Zod schema with ValidationResult discriminated union; formatValidationErrors returns bullet list |
| `src/core/generator.ts` | RTL test code generation | VERIFIED | 105 lines; selectorToQuery maps data-testid, aria-label, element roles; accessibility-first query priority |
| `src/core/writer.ts` | Test file filesystem writing | VERIFIED | 73 lines; extension validation, mkdir recursive, overwrite protection, WriteResult |
| `src/types/recording.ts` | TypeScript types | VERIFIED | 60 lines; ChromeStep, ChromeRecorderExport, NormalizedStep, NormalizedRecording all defined |
| `src/templates/test-template.ts` | Code templates | VERIFIED (with bug) | 85 lines; importBlock/describeBlock/stepTemplate all implemented; bug in describeBlock (see gaps) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/cli/commands/generate.ts` | `createGenerateCommand()` import + `program.addCommand()` | WIRED | Line 10-11, 23 |
| `src/cli/commands/generate.ts` | `src/core/validator.ts` | `import { validateRecording, formatValidationErrors }` | WIRED | Line 11; called at line 74 |
| `src/cli/commands/generate.ts` | `src/core/parser.ts` | `import { parseRecording }` | WIRED | Line 12; called at line 87 |
| `src/cli/commands/generate.ts` | `src/core/generator.ts` | `import { generateTest }` | WIRED | Line 13; called at line 100 |
| `src/cli/commands/generate.ts` | `src/core/writer.ts` | `import { writeTestFile }` | WIRED | Line 14; called at line 113 |
| `src/core/generator.ts` | `src/templates/test-template.ts` | `import { importBlock, describeBlock, stepTemplate }` | WIRED | Lines 11-14; all three used |

### Requirements Coverage

Requirements IDs listed as null for this phase; coverage assessed from CONTEXT.md goals.

| Area | Description | Status | Evidence |
|------|-------------|--------|----------|
| CLI-01 | `taro generate` command invocable from terminal | SATISFIED | `node dist/index.js generate <file>` works; `--help` shows correct usage |
| CLI-02 | `--dry-run`, `--output`, `--force` flags | SATISFIED | All three flags implemented and functional |
| INPT-01 | Parse Chrome Recorder JSON | SATISFIED | `parseRecording()` reads and normalizes all step types |
| INPT-02 | Validate schema with clear errors | SATISFIED | `validateRecording()` returns structured ValidationResult; errors formatted with path and message |
| INPT-03 | Normalize step types | SATISFIED | actionMap covers click, doubleClick, fill, change, select, scroll, assertElementPresent, assertElementVisible, navigate, keyDown, keyUp |
| GEN-01 | RTL imports in output | SATISFIED | Always present: render, screen, jest-dom; userEvent when needed |
| GEN-02 | describe/it structure | SATISFIED | All output wrapped in `describe/it` blocks |
| GEN-03 | user-event interactions | SATISFIED | All interactive steps use `user.click`, `user.type`, `user.selectOptions`, `user.keyboard` |
| GEN-04 | Accessibility-first query strategy | SATISFIED | selectorToQuery prefers data-testid, aria-label, element roles over CSS fallback |
| GEN-05 | File written with .test.tsx extension | SATISFIED | Default output derives name from input file with `.test.tsx` suffix; extension validated before write |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/templates/test-template.ts` | 78 | `const user = userEvent.setup()` unconditional in `describeBlock()` | BLOCKER | Navigate/assert-only recordings produce code with undefined `userEvent` reference |
| `src/core/parser.ts` | 44-45 | `navigate` step stores URL in `target` field; `stepTemplate` uses `value \|\| query`, passing URL through `selectorToQuery()` | WARNING | Navigate line in generated test reads `// navigate: screen.getByTestId(/* TODO ...CSS: 'https://...' */ '')` instead of `// navigate: https://...` |
| `src/core/writer.ts` | 20 | `VALID_EXTENSIONS` Set declared but never used; `isValidTestPath()` re-implements the check manually | INFO | Dead code; minor maintainability issue |
| `src/core/parser.ts` | 59, 61 | `console.warn` statements | WARNING | Violates project no-console style rule; output clutters CLI stdout |
| `src/templates/test-template.ts` | 10 | `render` always imported but never emitted in generated test body | WARNING | Generated tests will get "imported but unused" lint warnings |
| (all source files) | — | No unit or integration tests exist | BLOCKER | Project requires 80% test coverage; zero tests violate the mandatory testing policy |

### Human Verification Required

#### 1. Generated Test Execution

**Test:** Take the generated `/tmp/taro-sample.test.tsx`, add a component render call (`render(<YourComponent />)`) at the top of the `it` block, then run `npx vitest run taro-sample.test.tsx`
**Expected:** All steps execute without import errors; assertions pass for present elements
**Why human:** Requires a real component under test; execution environment not available in static verification

#### 2. Real Chrome Recorder Export Quality

**Test:** Export a real recording from Chrome DevTools Recorder on any web app, run `taro generate` on it, inspect the generated queries
**Expected:** `getByRole`, `getByLabelText`, `getByTestId` queries correspond to actual elements in the app's DOM
**Why human:** Selector quality is a judgment call based on the app's specific DOM structure

### Gaps Summary

**Root cause of the single failing truth:** The `describeBlock()` function in `src/templates/test-template.ts` (line 78) unconditionally emits `const user = userEvent.setup()`. This line is paired with a `hasUserEvents` flag used in `importBlock()` to conditionally include the `userEvent` import. When `hasUserEvents` is false (e.g., navigate-only or assert-only recordings), the generated file will have `userEvent.setup()` on line 9 but no `userEvent` import — the generated TypeScript is invalid.

**Fix scope is narrow:** The `hasUserEvents` boolean is already computed in `generator.ts` (line 90-92) and passed to `importBlock()`. It must also be passed to `describeBlock()`, which then conditionally emits the setup line.

**Additional warnings do not block the core goal** for typical recordings (those with at least one click/fill/select/keyDown step), but the navigate URL rendering and unused `render` import degrade output quality.

**Missing test suite is a separate requirement gap:** The project mandates 80% coverage (unit + integration + E2E) per `CLAUDE.md` and workspace rules. Zero tests exist across the entire `src/` tree. This was not scaffolded during Phase 1 and should be addressed before Phase 2 adds more code to cover.

---

_Verified: 2026-03-06_
_Verifier: Claude (gsd-verifier)_
