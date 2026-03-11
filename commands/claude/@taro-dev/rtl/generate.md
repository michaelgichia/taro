---
name: "@taro-dev/rtl:generate"
description: Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Taro.
argument-hint: "<path/to/recording.js>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
  - browser_navigate
  - browser_click
  - browser_wait_for
  - browser_take_screenshot
argument-instructions: |
  Accept exactly one argument: the path to a Testing Library Recorder `.js` export.
  Example: /@taro-dev/rtl:generate path/to/recording.js
  Stop if the input is missing or does not end in `.js`.
---
<objective>
Transform a Testing Library Recorder `.js` recording into a maintainable, repository-aware React Testing Library test using the deterministic Taro pipeline.

Taro must:
- parse recordings deterministically through the Taro pipeline and never improvise a second parser
- translate DOM mechanics into semantic user intent
- convert semantic checkpoints into explicit user-visible assertions
- preserve entry-path fidelity when the recording opens UI through a parent trigger
- prefer evidence-based conventions from repo context, `.taro/state.json`, and `.taro/overrides.json`
- avoid UI-library component reimplementation in mocks
- interpret scoring and verification output honestly instead of overstating confidence

Output: a generated `{recording-name}.test.tsx` file written next to the recording, plus a report containing the command run, generated test path, score and grade, whether manual review is required, top blockers, and the smallest concrete next fixes ordered by impact.
</objective>

<execution_context>
Taro CLI and repository-local package state, especially `.taro/state.json` and optional `.taro/overrides.json` when present.
</execution_context>

<context>
Recording: $ARGUMENTS

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
</context>

<process>
Execute the Taro generation workflow end-to-end.

1. Accept only Testing Library Recorder `.js` exports.
2. Confirm the recording path and stop if the input is missing or not `.js`.
3. Write `{recording-name}.test.tsx` next to the recording and do not overwrite an existing sibling output.
4. Keep repository exploration intentionally small:
   - inspect at most 5 repo files for discovery before generation
   - `references/*` reads do not count toward the 5-file cap
   - prioritize: target source, nearest sibling test, shared mock setup, nearest fixture store, then config only if needed
   - if uncertainty remains after 5 files, stop expanding scope and report the limitation explicitly
5. When repo inspection happens, include:
   - `Surface scan: {N}/5 files`
   - `Selected files: [...]`
   - `Skipped expansions: [...]`
6. Recover semantic intent before discussing code changes.
7. Resolve render boundary and mock plan with entry-path fidelity in mind.
8. Enforce the mock boundary policy:
   - Forbidden:
     - reimplementing design-system or shared UI-library components in generated test mocks
     - replacing shared UI packages with fake components to force verification to pass
   - Allowed:
     - data/query/mutation boundaries
     - auth/session boundaries
     - router/navigation boundaries
     - environment/browser gaps
     - explicit local child modules when isolation clearly requires them
   - If the mock plan would violate this policy, stop and call out the violation instead of writing a misleading result.
9. Run `{{TARO_RUNTIME_COMMAND}} __generate <recording-file>`.
10. Read and apply:
    - `references/quality-scoring.md`
    - `references/verification-gate.md`
11. Interpret score, blockers, marker coverage, and verification output before calling the result complete.
12. Minimum report after generation:
    - command run
    - generated file path
    - score and grade
    - whether manual review is required
    - top blockers
    - whether marker coverage or boundary fidelity remains incomplete
13. If Taro reports draft-quality output, QUAL-02 failure, unresolved markers, or boundary warnings, state plainly that the result is not production-ready yet.
14. When repo context was limited, say so explicitly instead of inventing certainty.
</process>
