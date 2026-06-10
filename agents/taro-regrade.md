---
name: "@tr/rtl-regrade"
description: "Regrade an existing RTL test against the latest file contents, compare it to the latest stored snapshot when present, and persist new progress either in `.taro/state.json` for a single file or in a directory-loop tracker for a batch run."
---

# Taro Regrade

Invoke this skill with `$@tr/rtl-regrade`.

## Purpose

Re-score an existing RTL test in one of two supported modes:

- single-file regrade against `.taro/state.json`
- directory-loop regrade for every matching test in a directory via `{{TARO_RUNTIME_COMMAND}} __regrade <test-directory> --directory-loop`

This skill is example-driven:

- read the current test file or test directory request
- run `{{TARO_RUNTIME_COMMAND}} __regrade <test-file>` for single-file mode and compare the result to the latest matching stored score snapshot when one exists
- apply the shared `ScoreResult` scoring shape openly
- append a fresh snapshot for single-file mode so repeated regrades show grade movement over time
- report the directory-loop tracker path and row progress for batch mode

## Inputs

- required: path to an existing `*.test.*` or `*.spec.*` file, or a test directory
- required for directory mode: the request must explicitly include `--directory-loop`

## Guardrails

- never invent a missing `recordingFile`; reuse the latest matching value when it exists, otherwise store `null`
- always append a fresh `generatedTests` record for the current score
- compare against the latest matching `generatedTests` record for the target `testFile`, with legacy `gradedTests` used only as metadata fallback when no canonical snapshot exists yet
- keep only the latest 5 snapshots for the target normalized `testFile`
- preserve unrelated history entries exactly as they are
- keep `.taro/state.json` formatted as 2-space JSON with a trailing newline

## Matching Rule

Match the latest `generatedTests` entry whose normalized `testFile` path equals the provided test path. If no generated match exists yet, use legacy `gradedTests` only as a metadata fallback for the first new generated snapshot.

If no matching entry exists:

- grade the file in the response
- explain that there was no previous stored snapshot for this test
- still append the first snapshot into `.taro/state.json`

## Scoring Shape

Score the file dimension by dimension:

- `queryQuality` out of 100
- `assertionSpecificity` out of 100
- `testStructure` out of 100
- `boundaryIsolation` out of 100

Compute the final `overall` score as:

- `queryQuality * 0.30`
- `assertionSpecificity * 0.25`
- `testStructure * 0.20`
- `boundaryIsolation * 0.25`

Map the total to:

- `A`: 90-100
- `B`: 80-89
- `C`: 70-79
- `D`: 60-69
- `F`: 0-59

Manual review is still required when blockers remain or the result is below `80`.

## Worked Examples

### Example A: Healthy Upgrade

Stored state:

- `72 / C`

Current file:

- replaced weak text queries with `getByRole(...)`
- added exact payload assertions
- added a visible success outcome

Expected result:

- new score in the `80s`
- `B`
- append a better snapshot and call out the improvement

### Example B: Regression

Stored state:

- `88 / B`

Current file:

- now renders `<App />`
- lost visible outcome assertions
- added brittle selectors

Expected result:

- score drops into `D` or `F`
- append a worse snapshot
- call out the regression explicitly

### Example C: No Safe Stored Match

Current file exists, but `.taro/state.json` has no matching `generatedTests[].testFile`.

Expected result:

- report the fresh grade
- explain that there was no previous stored snapshot
- initialize or update state and append the first snapshot

## Workflow

1. Confirm the target path.
2. Stop if the path is missing, inaccessible, or neither a test file nor a directory.
3. If the target is a directory:
   - require the user to pass `--directory-loop`
   - run `{{TARO_RUNTIME_COMMAND}} __regrade <test-directory> --directory-loop`
   - report the tracker path under `.taro/directory-loop/`
   - explain that each row starts as `pending`, becomes `in-progress` when selected, and ends as `completed` with current score threshold, updated score threshold, and follow-up comments
4. If the target is a single file, read the target test file and `.taro/state.json`.
5. Find the latest matching stored score record, using legacy graded history only as a metadata fallback when no generated snapshot exists yet.
6. Score the current file explicitly.
7. Append a new snapshot into `.taro/state.json`:
   - if a stored match exists, reuse its `packagePath` and `recordingFile` when possible
   - if no stored match exists, use the best matching package profile or `"."`, and store `recordingFile: null`
   - preserve unrelated entries exactly
   - keep only the latest 5 snapshots for the normalized `testFile`
8. Report the delta and the highest-impact fixes.

## Response Contract

Return:

- target file path or directory path
- whether the run used single-file mode or `--directory-loop`
- for single-file mode: whether a stored score record was matched
- for single-file mode: previous score and grade when present
- for single-file mode: new per-dimension scores
- for single-file mode: new total and letter grade
- for single-file mode: whether `.taro/state.json` was updated
- for directory-loop mode: the tracker path under `.taro/directory-loop/`
- for directory-loop mode: the batch progress state and completed-row metadata shape
- regression or improvement summary
- top blockers and best next fixes
