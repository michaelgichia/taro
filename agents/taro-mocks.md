---
name: "@taro-dev/rtl-mocks"
description: "Review mock targets, provider boundaries, fixture shape, and post-generation follow-up for Taro output. Use when a generated RTL test needs API mocking, router/auth/context setup, fixture guidance, or when the user asks why Taro suggested certain mocks."
---

# Taro Mocks

Invoke this skill with `$@taro-dev/rtl-mocks`.

## Boundary Review Workflow

1. Identify the external boundaries the generated test crosses.
2. Keep only the minimum mocks needed to make the user flow deterministic.
3. Align with the repo's existing mock stack before proposing new patterns.
4. Decide whether each collaborator should stay inline, use a provider wrapper, or move into central boundary support.

## Inline vs Extract Decision

- **Learned shared-module-factory boundary** → reuse the central support module and its stable exports
- **Provider wrappers** (router, auth, query client) → always reuse the shared render helper or wrapper path
- **Inline-safe boundary** (router/env one-offs) → keep inline only when the repo has not taught a stronger pattern
- **No learned boundary profile** → scaffold central support for collaborator modules instead of inlining repo-local query-hook implementations

## Mock Instability Patterns to Fix

Taro detects and flags two instability patterns:

**`recreated-factory`** — `vi.mock()` or `jest.mock()` is declared inside `it()`/`test()` bodies. This recreates the module factory on every test run and produces inconsistent state.
- Fix: move `vi.mock('...')` to module scope (outside all test callbacks).

**`per-test-churn`** — `clearAllMocks`/`resetAllMocks` is called repeatedly alongside many `mockReturnValue`/`mockResolvedValue` calls, which means mock configuration is torn down and rebuilt per test.
- Fix: consolidate shared mock state in `beforeEach`, use `mockReturnValueOnce` for per-test overrides only.

## Mutation Lifecycle Coverage

When the recorded flow involves a mutation (submit, save, create, update, delete), the generated test should cover all three stages:

| Stage | What to assert | Mock setup |
|-------|----------------|------------|
| `loading` | Submit button is disabled, spinner/pending indicator visible | Before `mockResolvedValue` resolves |
| `success` | Success message, redirect, or updated value visible | `mockResolvedValue(...)` |
| `error` | `role="alert"` error message visible | `mockRejectedValue(new Error(...))` |

If only one or two stages are present in the generated output, explain what the missing stages should assert.

## Common Boundaries

- network and data-fetching clients (fetch, axios, React Query, SWR, tRPC)
- router and navigation hooks (`useRouter`, `useNavigate`)
- auth or session providers (`useAuth`, `useSession`)
- feature flags and runtime config
- time, randomness, and browser APIs (`Date.now`, `Math.random`, `localStorage`)

## Guardrails

- do not invent API shapes, endpoints, or fixture payloads without evidence from the repo
- prefer existing fixtures, factories, and render wrappers over new one-off helpers
- prefer collaborator-oriented support modules over component-specific inline mocks
- call out provider requirements separately from pure data mocks
- separate blocking mock requirements from optional cleanup

## Output Contract

Summarize:

- the collaborator boundaries that matter and whether each should be inline, wrapped, reused from shared support, or scaffolded
- which instability patterns were detected and the specific fix
- whether mutation lifecycle coverage is complete or which stages are missing
- the fixture shape or shared helper to reuse
- any manual follow-up still required after generation
