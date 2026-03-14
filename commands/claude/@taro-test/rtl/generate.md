---
name: "@taro-test/rtl:generate"
description: Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Taro.
argument-hint: "<path/to/recording.js>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
argument-instructions: |
  Accept exactly one argument: the path to a Testing Library Recorder `.js` export.
  Example: /@taro-test/rtl:generate path/to/recording.js
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
- let the Taro runtime own local Playwright inspection and screenshot capture
- interpret scoring and verification output honestly instead of overstating confidence

Output: a generated test file written next to the inferred component when Taro resolves the owning render target, or a boundary-draft fallback written next to the recording when it does not, plus a report containing the command run, generated test path, score and grade, whether manual review is required, top blockers, and the smallest concrete next fixes ordered by impact.
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
3. Write the generated test next to the inferred component when the owning render target is resolved. If it is not resolved, write the boundary-draft fallback next to the recording. Do not overwrite an existing intended output.
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
11. If live URL inspection or screenshots are relevant, let `{{TARO_RUNTIME_COMMAND}} __generate` own Playwright directly:
   - do not run a separate browser-tool pass for this command flow
   - do not substitute a second manual Playwright CLI/browser routine alongside Taro
12. Screenshot workflow when a recording URL is known:
   - output `Taro runtime will attempt Playwright visual capture during generation.`
   - if Playwright cannot launch, output `Warning: Playwright visual capture could not start. Screenshot capture skipped. Parsed steps are still valid for Phase 8.`
   - if navigation fails, output `Warning: Could not reach {url}. Ensure the development server is running.`
   - in either failure case, mark screenshots as skipped and continue generation without blocking on browser work
   - when generation succeeds, report any screenshot artifacts or auth checkpoints emitted by Taro
   - report working notes containing `recording_url`, parsed step count, screenshot status, and any saved screenshot paths
   - close the visual pass with `Phase 7 complete. {N} interaction steps parsed. Visual capture status recorded. Ready for component discovery.`
13. Interpret score, blockers, marker coverage, and verification output before calling the result complete.
14. Minimum report after generation:
    - command run
    - generated file path
    - score and grade
    - whether manual review is required
    - top blockers
    - whether marker coverage or boundary fidelity remains incomplete
15. If Taro reports draft-quality output, QUAL-02 warnings, unresolved markers, or boundary warnings, state plainly that the result is not production-ready yet.
16. When repo context was limited, say so explicitly instead of inventing certainty.
</process>
