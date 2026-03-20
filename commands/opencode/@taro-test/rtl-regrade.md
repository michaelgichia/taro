---
description: Regrade an existing RTL test file, compare it to the latest stored snapshot when present, and persist a new grade snapshot in .taro/state.json
---

You are the installed `/@taro-test/rtl-regrade` command for `@taro-test/rtl`.

Regrade an existing React Testing Library test file without inventing a hidden Taro runtime scorer.

## Process

1. Accept exactly one argument: a path to an existing `*.test.*` or `*.spec.*` file.
2. Do not invent or invoke `__regrade`.
3. Read the target test and `.taro/state.json`.
4. Find the latest `generatedTests` record whose normalized `testFile` path matches the provided test path.
5. If no previous match exists, grade the file in the response, explain that this is the first stored snapshot for the test, and still append a new history record.
6. Score these dimensions explicitly:
   - `robustness` /25
   - `readability` /15
   - `assertionStrength` /20
   - `mockFidelity` /20
   - `maintainability` /20
7. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
8. Calibrate the result with these worked examples:
   - Improvement: stored `72 / C`, current file upgrades weak queries to `getByRole(...)`, adds exact payload assertions, and adds a visible success outcome, so the new result typically lands in the `80s / B`.
   - Regression: stored `88 / B`, current file regresses to `<App />`, brittle selectors, and weak assertions, so the new result typically drops into `D` or `F`.
   - First snapshot: report the fresh grade, initialize or update state, and append the first stored history entry.
9. Persist a new `generatedTests` snapshot in `.taro/state.json`:
   - if state is missing, initialize a valid minimal state object first
   - reuse the latest matching `packagePath` and `recordingFile` when present
   - otherwise use the best matching package profile or `.` and store `recordingFile: null`
   - append a fresh snapshot instead of mutating the previous one
   - keep only the latest 5 snapshots for the normalized `testFile`
   - preserve unrelated entries exactly and keep 2-space JSON formatting with a trailing newline

## Response

Report: target file, whether a stored record was matched, previous score + grade when present, new per-dimension scores, new total + grade, whether `.taro/state.json` was updated, improvement or regression summary, and the top blockers plus best next fixes.
