---
name: "@tr/rtl-geni"
description: "Generate deterministic, repository-aware React Testing Library tests from Testing Library Recorder JS exports with Taro, forcing interactive auth recovery when visual capture needs it."
---

# Taro Generate Interactive

Invoke this skill with `$@tr/rtl-geni`.

Use the same workflow and expectations as `$@tr/rtl-gen`, but force interactive Playwright auth recovery for this run.

## Purpose

Transform a Testing Library Recorder `.js` recording into a maintainable, project-aware RTL test without losing behavioral fidelity, while forcing Taro's interactive auth flow when browser inspection needs sign-in.

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
- `references/auth.md` when auth or screenshot capture is relevant
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
5. This entrypoint is for runs that should force interactive auth recovery when browser inspection hits sign-in.

## Generation Workflow

1. Validate the input recording and confirm it is the intended flow.
2. Recover semantic intent from the recording before discussing code changes.
3. Resolve render boundary and mock plan with entry-path fidelity in mind.
4. Run `{{TARO_RUNTIME_COMMAND}} __generate -i <recording-file>` for the first pass, even when the user requested a score threshold.
5. Inspect the machine-readable findings block. If it includes `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`, run one bounded `$@tr/rtl-mocks` review pass against the generated file.
6. Auto-apply at most one mock-scoped repair pass. Limit edits to the generated test file and existing repo support paths backed by repo evidence or already planned boundary support.
7. After auto-fixes, run `{{TARO_RUNTIME_COMMAND}} __regrade <generated-test-file>` and keep the revised file only if syntax still verifies, score does not drop, flow coverage does not drop, and blocking findings do not increase. Otherwise restore the original file and report the mock feedback as manual follow-up.
8. Treat any requested `--min-score <0-100>` as the final post-review gate, not the first-pass gate.
9. Interpret score, blockers, marker coverage, and verification output before calling the result complete.

When repo-local prop defaults or mock examples are missing:

- do not synthesize replacement component behavior
- do not invent semantic sentinels or default hook payloads
- keep the draft gap explicit and call out the missing local evidence

## Boundary Pattern Few-Shots

Infer the principle first, then choose the concrete repo artifact. Use the strongest local exemplar instead of generic mocking.

- Partial support import: A shared boundary stays mostly real and a support import overrides only the unstable slice. Reuse that support import; do not recreate the package inline.
- Keep-real wrapper: A local wrapper is part of the render surface. Keep it real and solve boundary issues at the render layer instead of mocking through it.
- Factory support: A collaborator exposes stable factory/reset handles. Import those handles and configure behavior per test.
- Inline-safe boundary: A simple router, env, or platform seam can use a lightweight inline mock when no stronger local pattern exists.

Never invent a fake shared UI implementation when a partial-support or keep-real pattern exists.

## Automatic Mock Review Loop

Use the `$@tr/rtl-mocks` contract as the second-pass repair workflow.

- Allowed auto-fixes: replace inline shared-boundary mocks with learned shared support imports, remove forbidden boundary/package mocks while keeping wrappers real, move `vi.mock(...)` or `jest.mock(...)` factories to module scope, replace mutable shared mock-control state with hoisted handles plus per-test implementations, and add missing mutation lifecycle coverage only when repo evidence already exists.
- Manual-only follow-up: invented API shapes, invented fixture payloads, or brand-new support modules without repo evidence.
- One repair attempt per generation run. No recursive review loops.

## Response Contract

Report:

- the command you ran
- the generated test path
- the score and grade
- whether manual review is required
- the top blockers
- the smallest concrete next fixes, ordered by impact
- whether interactive auth recovery was required or skipped
- whether the automatic mock-review pass ran, and whether its edits were accepted or rolled back

When repo context was limited, say so explicitly instead of inventing certainty.
