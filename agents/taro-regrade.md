---
name: "@taro-test/rtl-regrade"
description: "Regrade an existing RTL test against the latest file contents and refresh the matching stored generated-test grade when one already exists. Use when a test changed after generation and the recorded grade needs to be updated."
---

# Taro Regrade

Invoke this skill with `$@taro-test/rtl-regrade`.

## Purpose

Re-score an existing RTL test file without inventing a hidden `__regrade` command.

This skill is example-driven:

- read the current test file
- compare it to the latest matching stored generated-test record
- apply the published scoring shape openly
- update only the matching stored grade when a safe match exists

## Inputs

- required: path to an existing `*.test.*` or `*.spec.*` file

## Guardrails

- never invent a missing `recordingFile`
- never append a brand new `generatedTests` record when no matching stored record exists
- update only the latest matching `generatedTests` record for the target `testFile`
- preserve unrelated history entries exactly as they are
- keep `.taro/state.json` formatted as 2-space JSON with a trailing newline

## Matching Rule

Match the latest `generatedTests` entry whose normalized `testFile` path equals the provided test path.

If no matching entry exists:

- grade the file in the response
- explain that there is no stored generated-test record to refresh
- do not edit `.taro/state.json`

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
- update the latest matching state entry in place

### Example B: Regression

Stored state:

- `88 / B`

Current file:

- now renders `<App />`
- lost visible outcome assertions
- added brittle selectors

Expected result:

- score drops into `D` or `F`
- update the matching state entry
- call out the regression explicitly

### Example C: No Safe Stored Match

Current file exists, but `.taro/state.json` has no matching `generatedTests[].testFile`.

Expected result:

- report the fresh grade
- explain that regrade could not update stored history safely
- leave state untouched

## Workflow

1. Confirm the target path.
2. Stop if the file is missing or does not look like a test file.
3. Read the target test file and `.taro/state.json`.
4. Find the latest matching stored generated-test record.
5. Score the current file explicitly.
6. If a stored match exists:
   - compare old vs new score and grade
   - update only `quality` and `requiresReview` on that matching record
   - preserve all other fields
7. If no stored match exists, do not write state.
8. Report the delta and the highest-impact fixes.

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
