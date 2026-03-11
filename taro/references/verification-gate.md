# Verification Gate

Goal:
Prevent Taro from claiming success unless the generated test is demonstrably runnable
and compliant with mock-boundary policy.

Rules:

- Prefer running real project commands if they can be detected.
- If commands cannot be detected, run minimal checks and clearly log limitations.
- Always run static mock audit before runtime checks.

---

## Static Mock Audit (Required)

Run an AST/text audit on the generated test before typecheck/test/lint.

Detect:

- `vi.mock(...)` / `jest.mock(...)` blocks that replace UI-library modules
  (for example design-system packages such as `@digitax/components`).
- Broad object-return replacement patterns that provide custom component
  implementations for UI libraries.

Allowed:

- boundary-safe targets: data/auth/router/env/local-child modules.

If forbidden replacement is detected:

- set checkpoint status to `approval_required`
- set `blockedWrites = true`
- record offending targets in `verification.mockAudit.forbiddenReimplementations`
- do not write generated test file
- do not mutate `.taro/state.json` generated-test history
- output:
  - violation reason
  - exact offending target(s)
  - minimal alternatives attempted/available

---

## Preferred Checks (in order)

1. Static mock audit (required)
2. Typecheck (if tsconfig exists and command discoverable)
3. Run test for the generated file (framework-aware)
4. Lint the generated file (eslint if available)

---

## Command Detection (project-agnostic heuristics)

Taro may attempt to infer commands by checking:

- package.json scripts (if readable/locatable)
- presence of vitest/jest dependencies in lockfiles or package manifests

If no reliable detection:

- Log: `Verification commands not detected; minimal validation only.`
- Minimal validation must include:
  - file can be imported
  - no syntax errors
  - TypeScript types are not obviously invalid (best-effort)

---

## Repair Pass (single iteration only)

If verification fails:

- apply one repair attempt:
  - switch getByRole → findByRole for async
  - add missing await for userEvent
  - fix obvious import alias mismatch based on conventions signals
  - add lightweight env polyfill for browser gaps (for example `ResizeObserver`)
- rerun verification once

Never loop indefinitely.
Never claim success if still failing.

---

## Output Contract

- `Verification: Passed` only if all required checks pass and no checkpoint is active.
- `Verification: Failed` if runtime checks fail or checkpoint is active.
- If checkpoint is active, output must include:
  - `Checkpoint: approval_required`
  - `Blocked writes: true`
  - violation reason and offending targets.
