---
name: "@tayo-dev/rtl-conventions"
description: "Explain and stabilize how Taro learns project test conventions from `.taro/conventions.json` and nearby repo examples. Use when generated output style, imports, file placement, helpers, or mock structure differ from expectations, or when the user wants Taro to follow local testing conventions more closely."
---

# Taro Conventions

Invoke this skill with `$@tayo-dev/rtl-conventions`.

## What `.taro/conventions.json` Controls

Taro reads `.taro/conventions.json` on every generation and uses it to align output with the project's test style. Key fields:

| Field | Values | Effect |
|-------|--------|--------|
| `importStyle` | `"esm"` (default) / `"cjs"` | Controls `import` vs `require` in generated tests |
| Render helper name | learned from repo | Taro reuses existing render wrapper functions instead of writing `render(...)` directly |
| File placement | learned from repo | Taro matches `__tests__/`, `*.test.tsx` co-location, or `src/tests/` depending on what exists |
| Mock shape | learned from repo | Taro aligns factory shapes with existing `vi.mock` or `jest.mock` examples |

Taro accumulates knowledge from existing test files in the project. Commit `.taro/conventions.json` to your repo so convention learning persists for all team members.

## Investigation Workflow

1. Check whether `.taro/conventions.json` exists. If it is missing, Taro falls back to generic defaults — the fix is to run Taro on a few existing flows so it can learn the project style.
2. Sample nearby existing tests when repo context is available.
3. Compare generated output against local patterns for imports, render helpers, user-event setup, mocks, naming, and file placement.
4. Explain whether the mismatch comes from learned repo conventions, missing examples, or a current Taro limitation.

## How to Correct Convention Drift

- **Wrong import style** — set `importStyle` in `.taro/conventions.json` to `"esm"` or `"cjs"`.
- **Wrong file placement** — move one generated test to the correct location and re-run; Taro picks up placement from the nearest examples.
- **Missing render wrapper** — if the project uses a custom `renderWithProviders` helper, add one test that uses it; subsequent generations will prefer it.
- **Before re-running generation** — make sure the sibling `{recording-name}.test.tsx` path is free, because Taro writes next to the recording and will not overwrite an existing file.

## Guardrails

- prefer existing project conventions over generic defaults
- surface missing context instead of inventing project-specific patterns
- if there is no stable local pattern, say that directly instead of claiming Taro has a single correct style
- tell the user what repo examples or config need to exist for future generations to improve

## Response Contract

Summarize:

- what conventions Taro is currently picking up (importStyle, render helper, file placement)
- where the generated output matches or diverges from local patterns
- whether `.taro/conventions.json` or repo examples are driving the current behavior
- the specific field or example the user needs to add or fix to improve future generations
