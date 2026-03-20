---
name: "@taro-test/rtl:regrade"
description: Regrade an existing RTL test file and refresh the matching stored generated-test grade when a safe state entry exists.
argument-hint: "<path/to/test-file>"
allowed-tools:
  - Read
  - Write
  - Glob
argument-instructions: |
  Accept exactly one argument: the path to an existing RTL test file.
  Example: /@taro-test/rtl:regrade src/features/FeatureFlow.test.tsx
  Stop if the input is missing or does not look like a test file.
---

<objective>
Regrade an existing React Testing Library test file without inventing a hidden Taro runtime scorer, and refresh the matching stored generated-test grade only when a safe state match already exists.
</objective>

<context>
Target test file: $ARGUMENTS
</context>

<process>
1. Accept exactly one argument: a path to an existing `*.test.*` or `*.spec.*` file.
2. Do not invent or invoke `__regrade`.
3. Read the target test and `.taro/state.json`.
4. Find the latest `generatedTests` record whose normalized `testFile` path matches the provided test path.
5. If no safe match exists:
   - grade the file in the response
   - explain that there is no stored generated-test record to refresh
   - do not edit `.taro/state.json`
6. Score these dimensions explicitly:
   - `robustness` out of 25
   - `readability` out of 15
   - `assertionStrength` out of 20
   - `mockFidelity` out of 20
   - `maintainability` out of 20
7. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
8. Calibrate the regrade with these worked examples:
   - Improvement example:
     - stored `72 / C`
     - current file upgrades weak queries to `getByRole(...)`, adds exact payload assertions, and adds a visible success outcome
     - expected new result: `B` in the `80s`
   - Regression example:
     - stored `88 / B`
     - current file regresses to `<App />`, brittle selectors, and weak assertions
     - expected new result: `D` or `F`
   - No-match example:
     - the file exists but no matching `generatedTests[].testFile` exists
     - report the grade and leave state untouched
9. When a safe match exists, update only that matching record's `quality` and `requiresReview` fields. Preserve all other fields and preserve 2-space JSON formatting with a trailing newline.
10. Report:
   - target file
   - whether a stored record was matched
   - previous score and grade
   - new per-dimension scores
   - new total and letter grade
   - whether `.taro/state.json` was updated
   - improvement or regression summary
   - top blockers and best next fixes
</process>
