---
name: "@taro-dev/rtl-generate"
description: "Generate deterministic, repository-aware React Testing Library tests from Testing Library Recorder JS exports with Taro. Use when a user provides a Recorder `.js` file, asks to turn a recorded flow into an RTL test, needs render-boundary or mock strategy guidance, or needs score and verification output interpreted precisely."
---

# Taro Generate

Invoke this skill with `$@taro-dev/rtl-generate`.

## Purpose

Transform a Testing Library Recorder `.js` recording into a maintainable, project-aware RTL test without losing behavioral fidelity.

Non-negotiable expectations:

- parse recordings deterministically through the Taro pipeline; do not improvise a second parser
- prefer semantic user intent over DOM mechanics
- treat semantic `dblClick` checkpoints as assertion evidence, not as UI actions to replay
- preserve the real entry path when the recording opens UI through a parent trigger or route flow
- never solve a generation problem by reimplementing design-system or shared UI-library components in mocks
- keep low-confidence gaps explicit instead of pretending the output is finished

## Reference Map

Read only the files that apply to the current problem:

- `references/intent-model.md` for parsed-step normalization and interaction-intent recovery
- `references/assertion-markers.md` for converting semantic `dblClick` checkpoints into explicit assertions
- `references/entry-path-fidelity.md` when deciding parent trigger flow versus direct dialog/form harnesses
- `references/conventions-schema.md` when interpreting `.taro/state.json`, `.taro/overrides.json`, or convention drift
- `references/mock-store.md` when deciding fixture reuse or persistent mock storage
- `references/quality-scoring.md` when explaining score changes, grade drops, or blocker priorities
- `references/verification-gate.md` when deciding whether generated output is acceptable to hand off
- `references/auth.md` only when live URL inspection or screenshots hit an authentication wall
- `references/state-schema.md` and `references/test-index.md` only when state/history questions matter

## Working Style

Keep discovery narrow and deliberate.

- Default cap: inspect at most 5 repo files before generation planning.
- Prioritize target source, nearest sibling test, shared mock setup, nearest fixture store, then config.
- If uncertainty remains after that cap, stop expanding scope and report the limitation instead of scanning blindly.

When you do repo inspection beyond Taro's own console output, report:

- `Surface scan: {N}/5 files`
- `Selected files: [...]`
- `Skipped expansions: [...]`

## Preflight

1. Accept only Testing Library Recorder `.js` exports.
2. Taro must write the generated test next to the inferred component when it can resolve the owning render target.
3. If the render target stays unresolved, keep the fallback boundary-draft output next to the recording.
4. If that intended output file already exists, stop and tell the user to rename or delete it before rerunning generation.
5. If the user is asking for convention diagnosis or mock review instead of generation, route them to the more specific Taro skill when that is the better fit.

## Generation Workflow

1. Validate the input recording and confirm it is the intended flow.
2. Recover semantic intent from the recording before discussing code changes.
3. Resolve render boundary and mock plan with entry-path fidelity in mind.
4. Run `{{TARO_RUNTIME_COMMAND}} __generate <recording-file>`.
5. Interpret score, blockers, marker coverage, and verification output before calling the result complete.

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

If Taro reports draft-quality output, QUAL-02 failure, or unresolved marker/boundary gaps, state plainly that the result is not production-ready yet.

## Auth and Screenshots

Only read `references/auth.md` when live URL inspection or screenshot capture is relevant.

Rules:

- auth is optional support for debugging, not a prerequisite for generation
- never block basic generation on unavailable auth
- never ask the user for secrets in plain text

## Response Contract

Report:

- the command you ran
- the generated test path
- the score and grade
- whether manual review is required
- the top blockers
- the smallest concrete next fixes, ordered by impact

When repo context was limited, say so explicitly instead of inventing certainty.
