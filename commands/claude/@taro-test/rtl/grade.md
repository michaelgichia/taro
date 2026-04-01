---
name: "@taro-test/rtl:grade"
description: Grade an existing RTL test file using Taro's shared ScoreResult rubric and persist a score snapshot in `.taro/state.json`.
argument-hint: "<path/to/test-file>"
allowed-tools:
  - Read
  - Write
  - Glob
argument-instructions: |
  Accept exactly one argument: the path to an existing RTL test file.
  Example: /@taro-test/rtl:grade src/features/FeatureFlow.test.tsx
  Stop if the input is missing or does not look like a test file.
---

<objective>
Grade an existing React Testing Library test file using the same ScoreResult scorer used by `generate`, `generate-i`, and `target`.

This command is example-driven:

- read the target test directly
- use minimal repo context
- score each dimension explicitly
- persist a new score snapshot so progress can be tracked over time
- explain the score in the open </objective>

<context>
Target test file: $ARGUMENTS
</context>

<process>
1. Accept exactly one argument: a path to an existing `*.test.*` or `*.spec.*` file.
2. Run `{{TARO_RUNTIME_COMMAND}} __grade <test-file>` and use its output as the scoring source of truth.
3. Read the target test first. Read `.taro/state.json` if present. Inspect at most 4 additional nearby files only when they materially affect provider wrappers, fixtures, or boundary support.
4. Score these dimensions explicitly:
   - `queryQuality` out of 100
   - `assertionSpecificity` out of 100
   - `testStructure` out of 100
   - `boundaryIsolation` out of 100
5. Compute the final `overall` score as:
   - `queryQuality * 0.30`
   - `assertionSpecificity * 0.25`
   - `testStructure * 0.20`
   - `boundaryIsolation * 0.25`
6. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
7. Manual review is still required when blockers remain or the result is below `80`.
8. Calibrate the score with these worked examples:
   - Strong `B` example:
     - uses `renderWithProviders(...)`
     - main interactions use `getByRole(...)`
     - asserts a visible user outcome and the exact payload
     - uses shared fixtures and clean mock resets
   - Brittle `F` example:
     - uses `render(<App />)`
     - uses `container.querySelector(...)` or positional queries
     - only asserts `toBeInTheDocument()` or only mock-call assertions
     - uses inline ad hoc fixtures or reimplements UI-library components in mocks
   - Upgrade example:
     - role queries stay the same
     - exact payload and visible success assertions are added
     - a low `C` often becomes a mid/high `B`
9. Persist a new `generatedTests` snapshot in `.taro/state.json`:
   - if state is missing, initialize a valid minimal state object first
   - match prior history by normalized `generatedTests[].testFile`
   - reuse the latest matching `packagePath` and `recordingFile` when present
   - when no generated match exists, allow legacy `gradedTests` only as metadata fallback
   - otherwise use the best matching package profile or `"."`, and store `recordingFile: null`
   - append a fresh snapshot instead of overwriting older grades
   - keep only the latest 5 snapshots for that normalized `testFile`
   - preserve unrelated entries exactly
   - keep 2-space JSON formatting with a trailing newline
9. Report:
   - target file
   - surface scan summary
   - previous stored score and grade when present
   - per-dimension scores
   - total and letter grade
   - whether `.taro/state.json` was updated
   - whether manual review is required
   - top blockers
   - the smallest next fixes ordered by impact
</process>
