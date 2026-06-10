---
description: Regrade an existing RTL test file, or regrade all tests in one directory with --directory-loop, and persist the resulting progress
---

You are the installed `/@tr-rtl/cli-regrade` command for `@tr-rtl/cli`.

Regrade an existing React Testing Library test file, or batch regrade every matching test in one directory, while keeping the stored progress contract aligned with Taro's runtime behavior.

## Process

1. Accept exactly one required path argument: a path to an existing `*.test.*`, `*.spec.*`, or a directory.
2. If the path is a directory, require `--directory-loop`, run `{{TARO_RUNTIME_COMMAND}} __regrade <test-directory> --directory-loop`, report the tracker path under `.taro/directory-loop/`, explain that rows move from `pending` to `in-progress` to `completed`, and report that completed rows keep the current score threshold from generatedTests (with gradedTests legacy fallback), the updated score threshold, and follow-up comments.
3. If the path is a single file, run `{{TARO_RUNTIME_COMMAND}} __regrade <test-file>` and use that output as the scoring source of truth for the updated grade.
4. Read the target test and `.taro/state.json`.
5. Find the latest `generatedTests` record whose normalized `testFile` path matches the provided test path.
6. If no previous generated match exists, grade the file in the response, explain that this is the first stored canonical snapshot for the test, and still append a new history record. Legacy `gradedTests` history may be used only as a metadata fallback.
7. Score these dimensions explicitly:
   - `queryQuality` /100
   - `assertionSpecificity` /100
   - `testStructure` /100
   - `boundaryIsolation` /100
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
10. Calibrate the result with these worked examples:
   - Improvement: stored `72 / C`, current file upgrades weak queries to `getByRole(...)`, adds exact payload assertions, and adds a visible success outcome, so the new result typically lands in the `80s / B`.
   - Regression: stored `88 / B`, current file regresses to `<App />`, brittle selectors, and weak assertions, so the new result typically drops into `D` or `F`.
   - First snapshot: report the fresh grade, initialize or update state, and append the first stored history entry.
11. Persist a new `generatedTests` snapshot in `.taro/state.json`:

- if state is missing, initialize a valid minimal state object first
- reuse the latest matching `packagePath` and `recordingFile` when present
- when no generated match exists, allow legacy `gradedTests` only as metadata fallback
- otherwise use the best matching package profile or `.` and store `recordingFile: null`
- append a fresh snapshot instead of mutating the previous one
- keep only the latest 5 snapshots for the normalized `testFile`
- preserve unrelated entries exactly and keep 2-space JSON formatting with a trailing newline

## Response

Report: target file or directory, whether the run used single-file mode or `--directory-loop`, for single-file mode whether a stored record was matched plus previous score + grade when present plus new per-dimension scores plus new total + grade plus whether `.taro/state.json` was updated, for directory-loop mode the tracker path plus queued batch count when available plus the completed-row metadata shape, improvement or regression summary, and the top blockers plus best next fixes.
