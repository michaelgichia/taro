---
name: "@taro-test/rtl-generate"
description: "Generate deterministic, repository-aware React Testing Library tests from Testing Library Recorder JS exports with Taro. Use when a user provides a Recorder `.js` file, asks to turn a recorded flow into an RTL test, needs render-boundary or mock strategy guidance, or needs score and verification output interpreted precisely."
---

# Taro Generate

Invoke this skill with `$@taro-test/rtl-generate`.

## Purpose

Transform a Testing Library Recorder `.js` recording into a maintainable, project-aware RTL test without losing behavioral fidelity.

Non-negotiable expectations:

- parse recordings deterministically through the Taro pipeline; do not improvise a second parser
- prefer semantic user intent over DOM mechanics
- treat semantic `dblClick` checkpoints as assertion evidence, not as UI actions to replay
- preserve the real entry path when the recording opens UI through a parent trigger or route flow
- never solve a generation problem by reimplementing design-system or shared UI-library components in mocks
- let the Taro runtime own local Playwright inspection and screenshot capture
- keep low-confidence gaps explicit instead of pretending the output is finished

## Repository-Specific Test Contracts

These rules override generic generation habits for this repo:

- generate one test per behavior or contract; never bundle multiple user journeys or system concerns into one test
- when a later behavior depends on earlier UI steps, replay that setup in helpers, but keep the assertion target narrow to one contract per test
- name tests by the behavior that would break, not by the actions performed
- helpers are setup only; never place `expect(...)` calls inside shared interaction utilities
- never wrap RTL query results in `.toBeDefined()`; the query itself is the assertion unless `.toBeInTheDocument()` or another matcher is explicitly needed
- if a test typed or selected a value, assert that payload field exactly; avoid `expect.any(...)` and `expect.anything()` for known values
- configure mock behavior per test; never use mutable shared mock-control objects
- hoist plain `vi.fn()` mocks with no scenario logic attached
- keep `vi.mock(...)` factories shape-only; set the happy-path `mockImplementation` in `beforeEach`, then override inside the owning test with a complete scenario implementation
- keep related async mock assertions in the same `waitFor` callback when timing is shared
- do not generate explicit teardown that combines RTL `cleanup()` with manual `document.body` repairs; fix root-level leaks at the component or portal boundary
- choose one mock reset boundary per suite: one complete utility reset or explicit individual resets, never a mixed partial-reset pattern
- prefer exact text matchers; do not loosen assertions with regex unless the pattern itself is the contract under test
- setup helpers must return `{ user, ...renderResult }`

## Reference Map

Read only the files that apply to the current problem:

- `references/intent-model.md` for parsed-step normalization and interaction-intent recovery
- `references/assertion-markers.md` for converting semantic `dblClick` checkpoints into explicit assertions
- `references/entry-path-fidelity.md` when deciding parent trigger flow versus direct dialog/form harnesses
- `references/component-targeting.md` when generating from a resolved component target or when prop/setup intent is unclear
- `references/conventions-schema.md` when interpreting `.taro/state.json`, `.taro/overrides.json`, or convention drift
- `references/mock-store.md` when deciding fixture reuse or persistent mock storage
- `references/quality-scoring.md` when explaining score changes, grade drops, or blocker priorities
- `references/verification-gate.md` when deciding whether generated output is acceptable to hand off
- `references/auth.md` only when live URL inspection or screenshots hit an authentication wall
- `references/boundary-patterns.md` when deciding whether a collaborator should stay real, reuse support, or allow an inline mock
- `references/state-schema.md` and `references/test-index.md` only when state/history questions matter

## Working Style

Keep discovery narrow and deliberate.

- Default cap: inspect at most 10 repo files before generation planning.
- Prioritize target source, nearest sibling test, shared mock setup, nearest fixture store, then config.
- If uncertainty remains after that cap, stop expanding scope and report the limitation instead of scanning blindly.

When you do repo inspection beyond Taro's own console output, report:

- `Surface scan: {N}/10 files`
- `Selected files: [...]`
- `Skipped expansions: [...]`

## Preflight

1. Accept only Testing Library Recorder `.js` exports.
2. Taro must write the generated test next to the inferred component when it can resolve the owning render target.
3. If the render target stays unresolved, keep the fallback boundary-draft output next to the recording.
4. If that intended output file already exists, assess whether the existing test already covers the Recorder flow and whether the new generation improves quality. Keep the existing file when it already matches or exceeds the candidate; otherwise update it in place and report why.
5. If the user is asking for convention diagnosis or mock review instead of generation, route them to the more specific Taro skill when that is the better fit.

## Generation Workflow

1. Validate the input recording and confirm it is the intended flow.
2. Recover semantic intent from the recording before discussing code changes.
3. Resolve render boundary and mock plan with entry-path fidelity in mind.
4. Run `{{TARO_RUNTIME_COMMAND}} __generate <recording-file>`.
5. When the user specifies a quality threshold, append `--min-score <0-100>` to that runtime command.
6. Interpret score, blockers, marker coverage, and verification output before calling the result complete.

## Intent Recovery Rules

- Prefer accessible role/name and visible-text evidence over CSS evidence.
- Use semantic marker guidance from `references/assertion-markers.md` when the recording preserves checkpoint intent.
- Treat unresolved selector evidence as an explicit checkpoint to explain, not something to hide with fabricated queries.
- Use `getByTestId` only as a last resort and only when the repo conventions justify it.

## Entry-Path Fidelity

Use `references/entry-path-fidelity.md` whenever the recording opens a form, drawer, dialog, or route through earlier trigger steps.

Default behavior:

- if the recording clicks a parent trigger first, prefer rendering the parent/module composition and replaying that trigger
- do not replace a real parent-trigger flow with a directly-open dialog harness when the parent path is available
- if Taro emits boundary warnings or falls back to `render(<App />)`, explain that as a fidelity or context gap, not a finished solution
- if target-mode generation cannot find repo-local prop defaults or mock examples, keep that gap explicit instead of synthesizing a new implementation

## Mock Boundary Policy

This policy is mandatory on every run.

Allowed mock targets:

- data/query/mutation boundaries
- auth/session boundaries
- router/navigation boundaries
- environment/browser gaps
- explicit local child modules when isolation clearly requires them

Forbidden:

- reimplementing design-system or shared UI-library components in generated test mocks
- swapping an entire UI package with fake replacement components just to satisfy verification

If a mock plan would violate that boundary, stop and call out the violation clearly. Use `references/verification-gate.md` and `references/mock-store.md` before suggesting alternatives.

When repo-local examples are missing:

- do not invent replacement component behavior, semantic test ids, or default hook return shapes
- leave a review gap or draft warning in the output
- prefer copying an established local support shape over creating a new generic mock policy

## Score and Verification

Read these references when interpreting output quality:

- `references/quality-scoring.md`
- `references/verification-gate.md`

Minimum reporting standard after generation:

- generated file path
- score and grade
- whether manual review is still required
- top blockers
- whether marker coverage or boundary fidelity is still incomplete

If Taro reports draft-quality output, QUAL-02 warnings, or unresolved marker/boundary gaps, state plainly that the result is not production-ready yet.

## Authentication Preflight (Self-Documenting)

Only read `references/auth.md` when live URL inspection or screenshot capture is relevant.

Purpose:

Enable screenshot capture and page confirmation when the recording URL requires authentication.

Rules:

- never assume a specific auth provider
- never store credentials
- never ask the user for secrets in plain text
- never block core test generation when auth is unknown or unavailable
- if auth is required and unknown, self-document a template recipe instead of inventing hidden steps

Behavior:

- load `.taro/auth.json` if present and scope-matching
- otherwise detect auth-required states from observable navigation signals such as redirects, login copy, password inputs, or route mismatch
- if auth appears required and no recipe exists:
  - write or recommend a template `.taro/auth.json` without guessing provider-specific selectors
  - start a manual OAuth checkpoint when browser tooling is available
  - navigate to the target URL
  - prompt the user to complete sign-in in the opened browser context
  - poll auth-completion checks until timeout
  - mark auth status `authenticated` on success, otherwise `unknown_recipe`
- if a recipe exists:
  - for `ui_oauth_manual`, wait for user-driven login completion and poll until auth is confirmed or times out
  - for non-manual strategies such as `ui_email_password`, `cookie`, or `header`, apply the recipe using environment-variable names only
  - mark auth status `authenticated` or `failed`

Output:

- `Auth status: not_required | unknown_recipe | authenticated | failed`

Full recipe schema and rules:

- `references/auth.md`

## Screenshots

Rules:

- auth is optional support for visual confirmation, not a prerequisite for generation
- let `__generate` own local Playwright screenshot capture for this flow
- if Playwright launch or navigation fails, mark screenshots skipped and continue
- do not run a separate manual browser pass unless you are debugging Taro itself

Suggested screenshot flow when a recording URL is known:

1. Output `Taro runtime will attempt Playwright visual capture during generation.`
2. Run `{{TARO_RUNTIME_COMMAND}} __generate <recording-file>`.
3. If Playwright cannot launch, output `Warning: Playwright visual capture could not start. Screenshot capture skipped. Parsed steps are still valid for Phase 8.`
4. If navigation fails, output `Warning: Could not reach {url}. Ensure the development server is running.`
5. If auth is required, report the auth status and any emitted auth checkpoint or starting-point screenshot paths.
6. When generation succeeds, report any screenshot artifacts emitted by Taro.
7. Report working notes with `recording_url`, parsed step count, auth status, screenshot status, and any saved screenshot paths.
8. Close with `Phase 7 complete. {N} interaction steps parsed. Visual capture status recorded. Ready for component discovery.`

## Boundary Pattern Few-Shots

Infer the principle first, then choose the concrete repo artifact. Use the strongest local exemplar instead of generic mocking.

- Partial support import: A shared boundary stays mostly real and a support import overrides only the unstable slice. Reuse that support import; do not recreate the package inline.
- Keep-real wrapper: A local wrapper is part of the render surface. Keep it real and solve boundary issues at the render layer instead of mocking through it.
- Factory support: A collaborator exposes stable factory/reset handles. Import those handles and configure behavior per test.
- Inline-safe boundary: A simple router, env, or platform seam can use a lightweight inline mock when no stronger local pattern exists.

Never invent a fake shared UI implementation when a partial-support or keep-real pattern exists.

## Response Contract

Report:

- the command you ran
- the generated test path
- the score and grade
- whether manual review is required
- the top blockers
- the smallest concrete next fixes, ordered by impact

When repo context was limited, say so explicitly instead of inventing certainty.
