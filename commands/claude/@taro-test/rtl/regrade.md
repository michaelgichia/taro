---
name: "@taro-test/rtl:regrade"
description: Regrade an existing RTL test file, or regrade all tests in one directory with `--directory-loop`, and persist the resulting progress.
argument-hint: "<path/to/test-file-or-directory>"
allowed-tools:
  - Read
  - Write
  - Glob
argument-instructions: |
  Accept exactly one required path argument: the path to an existing RTL test file or test directory.
  If the argument is a directory, require `--directory-loop` and route it into the internal runtime command.
  Example: /@taro-test/rtl:regrade src/features/FeatureFlow.test.tsx
  Example: /@taro-test/rtl:regrade src/features/tests --directory-loop
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
   - report that completed rows keep the current score threshold from gradedTests (with generatedTests fallback), the updated score threshold, and follow-up comments
3. If the path is a single file, run `{{TARO_RUNTIME_COMMAND}} __regrade <test-file>` and use that output as the scoring source of truth for the updated grade.
4. Read the target test and `.taro/state.json`.
5. Find the latest `gradedTests` record whose normalized `testFile` path matches the provided test path.
6. If no previous match exists:
   - grade the file in the response
   - explain that this is the first stored snapshot for the test
   - still append a new history record
7. Score these dimensions explicitly:
   - `robustness` out of 25
   - `readability` out of 15
   - `assertionStrength` out of 20
   - `mockFidelity` out of 20
   - `maintainability` out of 20
8. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
9. Calibrate the regrade with these worked examples:
   - Improvement example:
     - stored `72 / C`
     - current file upgrades weak queries to `getByRole(...)`, adds exact payload assertions, and adds a visible success outcome
     - expected new result: `B` in the `80s`
   - Regression example:
     - stored `88 / B`
     - current file regresses to `<App />`, brittle selectors, and weak assertions
     - expected new result: `D` or `F`
   - First-snapshot example:
     - the file exists but no matching `gradedTests[].testFile` exists
     - report the grade, initialize or update state, and append the first stored snapshot
10. Persist a new `gradedTests` snapshot in `.taro/state.json`:
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
