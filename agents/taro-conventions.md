---
name: "@taro-dev/rtl-conventions"
description: "Explain and stabilize how Taro learns project test conventions from `.taro/state.json`, `.taro/overrides.json`, and nearby repo examples. Use when generated output style, imports, file placement, helpers, or mock structure differ from expectations, or when the user wants Taro to follow local testing conventions more closely."
---

# Taro Conventions

Invoke this skill with `$@taro-dev/rtl-conventions`.

## What `.taro/state.json` Controls

Taro reads `.taro/state.json` on generation and resolves a package-scoped profile for the target recording/output path. Key learned signals include:

| Field | Values | Effect |
|-------|--------|--------|
| `packages.<path>.importStyle` | `"esm"` / `"cjs"` | Controls `import` vs `require` in generated tests |
| `packages.<path>.runner` | `"vitest"` / `"jest"` / `"unknown"` | Controls runner-aware imports such as `@testing-library/jest-dom/vitest` |
| `packages.<path>.renderHelpers[]` | learned from repo | Taro can reuse existing render wrapper functions instead of writing `render(...)` directly |
| `packages.<path>.folderPattern` | `colocated`, `__tests__`, `mixed`, `unknown` | Tracks how tests are commonly placed in that package |
| `packages.<path>.mockPattern` | `vi.mock`, `jest.mock`, `none` | Aligns generated mock shape with existing tests |
| `packages.<path>.sharedMockFactories[]` | learned from repo | Helps Taro prefer shared mock utilities over repeated inline mocks |

Taro accumulates this knowledge from existing tests during `init`, `refresh`, and post-generation refresh. Commit `.taro/state.json` to your repo when you want that learning to persist for all team members.

## What `.taro/overrides.json` Controls

When repo evidence is ambiguous, `.taro/overrides.json` can pin package-level policy:

- `runner`
- `renderHelper.{name,importPath}`
- `forbidMocks[]`
- `preferredSharedMocks`

## Investigation Workflow

1. Check whether `.taro/state.json` exists. If it is missing, the fix is to run `init`. `generate` can bootstrap lightly, but that is a fallback, not the preferred brownfield workflow.
2. Sample nearby existing tests when repo context is available.
3. Compare generated output against local patterns for runner, imports, render helpers, user-event setup, mocks, naming, and file placement.
4. Explain whether the mismatch comes from learned package state, explicit overrides, missing examples, or a current Taro limitation.

## How to Correct Convention Drift

- **Missing initial learning** — run `$@taro-dev/rtl-init` so Taro scans the repo before generation.
- **Wrong import style** — add stronger local examples in the target package, then run `$@taro-dev/rtl-refresh`.
- **Wrong runner import** — set `packages.<path>.runner` in `.taro/overrides.json` when Vitest/Jest evidence is mixed.
- **Wrong file placement** — move one generated test to the correct location and re-run; Taro picks up placement from the nearest examples.
- **Missing render wrapper** — if the project uses a custom `renderWithProviders` helper, add one test that uses it, then refresh; or pin it in `.taro/overrides.json`.
- **Before re-running generation** — make sure the inferred-component output path is free. Taro must write next to the inferred component when it resolves one; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.

## Guardrails

- prefer existing project conventions over generic defaults
- surface missing context instead of inventing project-specific patterns
- if there is no stable local pattern, say that directly instead of claiming Taro has a single correct style
- tell the user what repo examples or config need to exist for future generations to improve

## Response Contract

Summarize:

- what package-scoped conventions Taro is currently picking up (runner, importStyle, render helper, file placement)
- where the generated output matches or diverges from local patterns
- whether `.taro/state.json`, `.taro/overrides.json`, or repo examples are driving the current behavior
- the specific field or example the user needs to add or fix to improve future generations
