---
name: "@tayo-dev/rtl:generate"
description: "Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Tayo."
argument-hint: [path/to/recording.js]
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - browser_navigate
  - browser_click
  - browser_wait_for
  - browser_take_screenshot
---

# Tayo — Deterministic RTL Test Generator

## Purpose

Transform a Testing Library Recorder `.js` recording into a maintainable, repository-aware React Testing Library test.

Tayo must:
- parse recordings deterministically through the Tayo pipeline; never improvise a second parser
- translate DOM mechanics into semantic user intent
- convert semantic checkpoints into explicit user-visible assertions
- preserve entry-path fidelity when the recording opens UI through a parent trigger
- prefer evidence-based conventions from repo context and `.tayo/conventions.json`
- avoid UI-library component reimplementation in mocks
- interpret scoring and verification output honestly instead of overstating confidence

## References

Read only the references that are relevant to the current problem:

- `references/intent-model.md`
- `references/assertion-markers.md`
- `references/entry-path-fidelity.md`
- `references/conventions-schema.md`
- `references/mock-store.md`
- `references/quality-scoring.md`
- `references/verification-gate.md`
- `references/auth.md`
- `references/state-schema.md`
- `references/test-index.md`

## Discovery Policy

Keep repository exploration intentionally small.

- Hard cap: inspect at most 5 repo files for discovery before generation.
- `references/*` reads do not count toward the 5-file cap.
- Prioritize: target source, nearest sibling test, shared mock setup, nearest fixture store, then config only if needed.
- If uncertainty remains after 5 files, stop expanding scope and report the limitation explicitly.

Required run output when repo inspection happens:
- `Surface scan: {N}/5 files`
- `Selected files: [...]`
- `Skipped expansions: [...]`

## Mock Boundary Policy

This policy is mandatory on every generation run.

Forbidden:
- reimplementing design-system or shared UI-library components in generated test mocks
- replacing shared UI packages with fake components to force verification to pass

Allowed:
- data/query/mutation boundaries
- auth/session boundaries
- router/navigation boundaries
- environment/browser gaps
- explicit local child modules when isolation clearly requires them

If the mock plan would violate this policy, stop and call out the violation instead of writing a misleading result.

## Generation Workflow

1. Accept only Testing Library Recorder `.js` exports.
2. Confirm the recording path and stop if the input is missing or not `.js`.
3. Tayo writes `{recording-name}.test.tsx` next to the recording and will not overwrite an existing sibling output.
4. Recover semantic intent before discussing code changes.
5. Resolve render boundary and mock plan with entry-path fidelity in mind.
6. Run `tayo __generate <recording-file>`.
7. Interpret score, blockers, marker coverage, and verification output before calling the result complete.

## Quality and Verification

Read:
- `references/quality-scoring.md`
- `references/verification-gate.md`

Minimum report after generation:
- command run
- generated file path
- score and grade
- whether manual review is required
- top blockers
- whether marker coverage or boundary fidelity remains incomplete

If Tayo reports draft-quality output, QUAL-02 failure, unresolved markers, or boundary warnings, state plainly that the result is not production-ready yet.

## Response Contract

Return:
- the command you ran
- the generated test path
- the score and grade
- whether manual review is required
- the top blockers
- the smallest concrete next fixes, ordered by impact

When repo context was limited, say so explicitly instead of inventing certainty.
