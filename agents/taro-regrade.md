---
name: "@taro-test/rtl-regrade"
description: "Regrade an existing RTL test against the latest file contents, compare it to the latest stored snapshot when present, and persist a new grade snapshot in `.taro/state.json`. Use when a test changed after generation and you want progress tracked over time."
---

# Taro Regrade

Invoke this skill with `$@taro-test/rtl-regrade`.

## Purpose

Re-score an existing RTL test file without inventing a hidden `__regrade` command.

This skill is example-driven:

- read the current test file
- compare it to the latest matching stored generated-test snapshot when one exists
- apply the published scoring shape openly
- append a fresh snapshot so repeated regrades show grade movement over time

## Inputs

- required: path to an existing `*.test.*` or `*.spec.*` file

## Guardrails

- never invent a missing `recordingFile`; reuse the latest matching value when it exists, otherwise store `null`
- always append a fresh `generatedTests` record for the current score
- compare against only the latest matching `generatedTests` record for the target `testFile`
- keep only the latest 5 snapshots for the target normalized `testFile`
- preserve unrelated history entries exactly as they are
- keep `.taro/state.json` formatted as 2-space JSON with a trailing newline

## Matching Rule

Match the latest `generatedTests` entry whose normalized `testFile` path equals the provided test path.

If no matching entry exists:

- grade the file in the response
- explain that there was no previous stored snapshot for this test
- still append the first snapshot into `.taro/state.json`

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
2. Stop if the file is missing or does not look like a test file.
3. Read the target test file and `.taro/state.json`.
4. Find the latest matching stored generated-test record.
5. Score the current file explicitly.
6. Append a new snapshot into `.taro/state.json`:
   - if a stored match exists, reuse its `packagePath` and `recordingFile` when possible
   - if no stored match exists, use the best matching package profile or `"."`, and store `recordingFile: null`
   - preserve unrelated entries exactly
   - keep only the latest 5 snapshots for the normalized `testFile`
7. Report the delta and the highest-impact fixes.

## Response Contract

Return:

- target file path
- whether a stored generated-test record was matched
- previous score and grade when present
- new per-dimension scores
- new total and letter grade
- whether `.taro/state.json` was updated
- regression or improvement summary
- top blockers and best next fixes
