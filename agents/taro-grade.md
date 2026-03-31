---
name: "@taro-test/rtl-grade"
description: "Grade an existing React Testing Library test file using Taro's published scoring shape, then persist a new grade snapshot in `.taro/state.json`. Use when a user wants a score for an existing test without regenerating it."
---

# Taro Grade

Invoke this skill with `$@taro-test/rtl-grade`.

## Purpose

Assess an existing RTL test file using Taro's shared existing-test grading engine.

This skill is intentionally example-driven:

- read the target test directly
- use minimal repo context
- run `{{TARO_RUNTIME_COMMAND}} __grade <test-file>` first, then explain the shared-engine result explicitly
- persist a new grade snapshot so test quality can be tracked over time
- persist the shared-engine result in the open with the published grading rubric

## Inputs

- required: path to an existing `*.test.*` or `*.spec.*` file

## Minimal Context Rules

Read in this order:

1. the target test file
2. `.taro/state.json` if present
3. at most 4 nearby files that materially affect provider wrappers, fixtures, helper setup, or boundary support

If that context is still ambiguous, say so directly instead of expanding the scan.

## State Persistence Rules

After scoring, persist a new `gradedTests` snapshot in `.taro/state.json`.

- if `.taro/state.json` is missing, initialize a valid minimal state object first
- compare existing history by normalized `gradedTests[].testFile`
- reuse the latest matching `packagePath` and `recordingFile` when they exist
- when no prior match exists, use the best matching package profile or `"."`, and store `recordingFile: null`
- append a fresh history record instead of overwriting older scores
- keep only the latest 5 snapshots for that normalized `testFile`
- preserve unrelated entries exactly as they are
- keep `.taro/state.json` formatted as 2-space JSON with a trailing newline
- update `meta.updatedAt` and preserve `meta.createdAt`

## Scoring Shape

Score the file dimension by dimension:

- `robustness` out of 25
- `readability` out of 15
- `assertionStrength` out of 20
- `mockFidelity` out of 20
- `maintainability` out of 20

Map the total to:

- `A`: 90-100
- `B`: 80-89
- `C`: 70-79
- `D`: 60-69
- `F`: 0-59

Manual review is still required when blockers remain or the result is below `80`.

## Worked Examples

Use these examples to calibrate the grade instead of inventing a second scoring system.

### Example A: Strong Existing Test

Traits:

- `renderWithProviders(...)` or a package-standard render helper
- main interactions use `getByRole(...)`
- asserts a visible user outcome and the exact mutation payload
- shared fixtures come from a mock store or stable factory
- mocks reset cleanly in `beforeEach`

Typical result:

- `82-90`
- usually `B`
- manual review often `no`

### Example B: Brittle Existing Test

Traits:

- `render(<App />)`
- `container.querySelector(...)` or positional `getAllByRole(...)[1]`
- only `toBeInTheDocument()` or only `expect(mock).toHaveBeenCalled()`
- inline ad hoc fixtures
- design-system components reimplemented in mocks

Typical result:

- `0-59`
- usually `F`
- manual review `yes`

### Example C: Borderline Test Upgraded By Better Assertions

Before:

- role queries were acceptable
- the test only asserted that a dialog stayed visible

After:

- keeps the role queries
- adds exact payload assertions
- adds a visible success outcome

Typical movement:

- from low `70s` / `C`
- to mid/high `80s` / `B`

## Workflow

1. Confirm the target path.
2. Stop if the file is missing or does not look like a test file.
3. Read the test and summarize:
   - render boundary
   - query strategy
   - assertion strategy
   - fixture strategy
   - mock/reset strategy
4. If `.taro/state.json` exists, identify the package profile and the latest stored grade for that exact normalized `testFile`.
5. Score each dimension explicitly.
6. Append the new snapshot into `.taro/state.json` using the persistence rules above.
7. Report the total, grade, blockers, delta versus the previous stored grade when one exists, and the smallest next fixes ordered by impact.

## Response Contract

Return:

- target file path
- surface scan summary
- previous stored score and grade when present
- per-dimension scores
- total and letter grade
- whether `.taro/state.json` was updated
- whether manual review is required
- top blockers
- the best next fixes ordered by impact
