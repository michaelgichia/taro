---
name: "@tr/rtl:regrade"
description: Regrade an existing RTL test file, or regrade all tests in one directory with `--directory-loop`, and persist the resulting progress.
argument-hint: "<path/to/test-file-or-directory>"
allowed-tools:
  - Read
  - Write
  - Glob
argument-instructions: |
  Accept exactly one required path argument: the path to an existing RTL test file or test directory.
  If the argument is a directory, require `--directory-loop` and route it into the internal runtime command.
  Example: /@tr/rtl:regrade src/features/FeatureFlow.test.tsx
  Example: /@tr/rtl:regrade src/features/tests --directory-loop
  Stop if the input is missing or is neither a test file nor a directory.
---

<objective>
Regrade an existing React Testing Library test file, or batch regrade every matching test in one directory, while keeping the stored progress contract aligned with Taro's runtime behavior.
</objective>

<context>
Target test file: $ARGUMENTS
</context>

<process>
1. Accept exactly one required path argument: a path to an existing `*.test.*`, `*.spec.*`, or a directory.
2. If the path is a directory:
   - require `--directory-loop`
   - run `{{TARO_RUNTIME_COMMAND}} __regrade <test-directory> --directory-loop`
   - report the tracker path under `.taro/directory-loop/`
   - explain that rows move from `pending` to `in-progress` to `completed`
   - report that completed rows keep the current score threshold from `generatedTests` (with `gradedTests` legacy fallback), the updated score threshold, and follow-up comments
3. If the path is a single file, run `{{TARO_RUNTIME_COMMAND}} __regrade <test-file>` and use that output as the scoring source of truth for the updated grade.
4. Read the target test and `.taro/state.json`.
5. Find the latest `generatedTests` record whose normalized `testFile` path matches the provided test path.
6. If no previous match exists:
   - grade the file in the response
   - explain that this is the first stored snapshot for the test
   - still append a new history record
   - use legacy `gradedTests` only as metadata fallback when no generated snapshot exists yet
7. Score these dimensions explicitly:
   - `queryQuality` out of 100
   - `assertionSpecificity` out of 100
   - `testStructure` out of 100
   - `boundaryIsolation` out of 100
8. Compute the final `overall` score as:
   - `queryQuality * 0.30`
   - `assertionSpecificity * 0.25`
   - `testStructure * 0.20`
   - `boundaryIsolation * 0.25`
9. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
10. Calibrate the regrade with these worked examples:
   - Improvement example:
     - stored `72 / C`
     - current file upgrades weak queries to `getByRole(...)`, adds exact payload assertions, and adds a visible success outcome
     - expected new result: `B` in the `80s`
   - Regression example:
     - stored `88 / B`
     - current file regresses to `<App />`, brittle selectors, and weak assertions
     - expected new result: `D` or `F`
   - First-snapshot example:
     - the file exists but no matching `generatedTests[].testFile` exists
     - report the grade, initialize or update state, and append the first stored snapshot
11. Persist a new `generatedTests` snapshot in `.taro/state.json`:
   - if state is missing, initialize a valid minimal state object first
   - reuse the latest matching `packagePath` and `recordingFile` when present
   - otherwise use the best matching package profile or `"."`, and store `recordingFile: null`
   - append a fresh snapshot instead of mutating the previous one
   - keep only the latest 5 snapshots for the normalized `testFile`
   - preserve unrelated entries exactly and preserve 2-space JSON formatting with a trailing newline
11. Report:
   - target file or directory
   - whether the run used single-file mode or `--directory-loop`
   - for single-file mode: whether a stored record was matched, the previous score and grade when present, the new per-dimension scores, the new total and letter grade, and whether `.taro/state.json` was updated
   - for directory-loop mode: the tracker path, the queued batch count when available, and the completed-row metadata shape
   - improvement or regression summary
   - top blockers and best next fixes
</process>
