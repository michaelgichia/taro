---
name: "@tayo-dev/rtl-conventions"
description: "Explain and stabilize how Tayo learns project test conventions from `.tayo/conventions.json` and nearby repo examples. Use when generated output style, imports, file placement, helpers, or mock structure differ from expectations, or when the user wants Tayo to follow local testing conventions more closely."
---

# Tayo Conventions

Invoke this skill with `$@tayo-dev/rtl-conventions`.

## What `.tayo/conventions.json` Controls

Tayo reads `.tayo/conventions.json` on every generation and uses it to align output with the project's test style. Key fields:

| Field | Values | Effect |
|-------|--------|--------|
| `importStyle` | `"esm"` (default) / `"cjs"` | Controls `import` vs `require` in generated tests |
| Render helper name | learned from repo | Tayo reuses existing render wrapper functions instead of writing `render(...)` directly |
| File placement | learned from repo | Tayo matches `__tests__/`, `*.test.tsx` co-location, or `src/tests/` depending on what exists |
| Mock shape | learned from repo | Tayo aligns factory shapes with existing `vi.mock` or `jest.mock` examples |

Tayo accumulates knowledge from existing test files in the project. Commit `.tayo/conventions.json` to your repo so convention learning persists for all team members.

## Investigation Workflow

1. Check whether `.tayo/conventions.json` exists. If it is missing, Tayo falls back to generic defaults — the fix is to run Tayo on a few existing flows so it can learn the project style.
2. Sample nearby existing tests when repo context is available.
3. Compare generated output against local patterns for imports, render helpers, user-event setup, mocks, naming, and file placement.
4. Explain whether the mismatch comes from learned repo conventions, missing examples, or a current Tayo limitation.

## How to Correct Convention Drift

- **Wrong import style** — set `importStyle` in `.tayo/conventions.json` to `"esm"` or `"cjs"`.
- **Wrong file placement** — move one generated test to the correct location and re-run; Tayo picks up placement from the nearest examples.
- **Missing render wrapper** — if the project uses a custom `renderWithProviders` helper, add one test that uses it; subsequent generations will prefer it.
- **Before writing** — always use `--dry-run` to check alignment before committing generated output.

## Guardrails

- prefer existing project conventions over generic defaults
- surface missing context instead of inventing project-specific patterns
- if there is no stable local pattern, say that directly instead of claiming Tayo has a single correct style
- tell the user what repo examples or config need to exist for future generations to improve

## Response Contract

Summarize:

- what conventions Tayo is currently picking up (importStyle, render helper, file placement)
- where the generated output matches or diverges from local patterns
- whether `.tayo/conventions.json` or repo examples are driving the current behavior
- the specific field or example the user needs to add or fix to improve future generations
