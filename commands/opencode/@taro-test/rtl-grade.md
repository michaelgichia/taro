---
description: Grade an existing RTL test file using Taro's published scoring shape and persist a grade snapshot in .taro/state.json
---

You are the installed `/@taro-test/rtl-grade` command for `@taro-test/rtl`.

Grade an existing React Testing Library test file without inventing a hidden Taro runtime scorer.

## Process

1. Accept exactly one argument: a path to an existing `*.test.*` or `*.spec.*` file.
2. Do not invent or invoke `__grade`.
3. Read the target test first. Read `.taro/state.json` if present. Inspect at most 4 additional nearby files only when they materially affect provider wrappers, fixtures, or boundary support.
4. Score these dimensions explicitly:
   - `robustness` /25
   - `readability` /15
   - `assertionStrength` /20
   - `mockFidelity` /20
   - `maintainability` /20
5. Grade mapping:
   - `A`: 90-100
   - `B`: 80-89
   - `C`: 70-79
   - `D`: 60-69
   - `F`: 0-59
6. Manual review is still required when blockers remain or the result is below `80`.
7. Calibrate the grade with these worked examples:
   - Strong `B`: `renderWithProviders(...)`, `getByRole(...)`, visible user outcome, exact payload assertion, shared fixtures, clean mock resets.
   - Brittle `F`: `render(<App />)`, `container.querySelector(...)` or positional queries, only `toBeInTheDocument()` or only mock-call assertions, inline fixtures or UI-library reimplementation in mocks.
   - Upgrade path: a low `C` often becomes a mid/high `B` when a test keeps role queries but adds exact payload assertions and a visible success outcome.
8. Persist a new `generatedTests` snapshot in `.taro/state.json`:
   - if state is missing, initialize a valid minimal state object first
   - match prior history by normalized `generatedTests[].testFile`
   - reuse the latest matching `packagePath` and `recordingFile` when present
   - otherwise use the best matching package profile or `.` and store `recordingFile: null`
   - append a fresh snapshot instead of overwriting older grades
   - keep only the latest 5 snapshots for that normalized `testFile`
   - preserve unrelated entries exactly
   - keep 2-space JSON formatting with a trailing newline

## Response

Report: target file, surface scan summary, previous stored score + grade when present, per-dimension scores, total + grade, whether `.taro/state.json` was updated, manual review status, top blockers, and the smallest next fixes ordered by impact.
