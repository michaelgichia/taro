# Phase 16 Research: Verification, JSON Parity & Product Surface

## Phase Intent

Phase 15 made the JS path structurally better, but the product surface still does not fully tell the truth about what Tayo can and cannot guarantee. The current generator can produce repo-aware JS output, explicit selector checkpoints, and boundary-safe module tests for supported flows, yet the score contract is still thin, the JSON path does not have representative milestone-level proof, the README still presents generation as JS-only, and Phase 13 still lacks the verification artifact needed for milestone closeout.

Phase 16 should finish the milestone by making the shipped trust story match the actual behavior:
- scoring should explain low-confidence output instead of only printing a number,
- JSON support should be proven at the public `tayo generate` boundary, not just assumed from older tests,
- README/help/examples should acknowledge dual-input support and honest degraded output,
- milestone evidence should be strong enough to re-audit and close `v1.3`.

## What Must Be True

### VERIFY-01

- The score must account for low-confidence states that now exist in the JS path: unresolved selector checkpoints, placeholder render targets, boundary draft warnings, and weak assertions.
- The public score surface should stay recognizable, but it needs deterministic reasons/signals so a user can understand why Tayo scored an output the way it did.
- Low-confidence messaging should be stronger than the current per-dimension tips: a single clear banner for `C` or below, with the top blockers named directly.
- Scoring must remain advisory. Phase 4 already locked that behavior and Phase 16 should not turn low scores into write-time failures.

### VERIFY-02

- JSON non-regression needs to be proven at the public generate flow, not just inside parser helpers.
- The repo currently has inline JSON tests in `src/core/input-loader.test.ts`, `src/core/parser.test.ts`, and JSON-backed behavior in `src/core/recording-intelligence.test.ts`, but it does not have canonical JSON sample fixtures or milestone-level smoke proof.
- A small representative proof set is enough. The user explicitly chose two representative JSON flows over a broad matrix.
- A parity failure should mean a behavioral regression in the public contract for supported JSON inputs, not harmless output drift.

### VERIFY-03

- The README must stop implying JS-only generation support now that `loadInput()` and the public CLI already accept both recorder JS and Chrome Recorder JSON.
- CLI help should stay concise, so the README/examples should carry most of the nuance around truthful degraded output.
- One honest draft-quality example is important. Phase 15 proved that Tayo often does the right thing by staying explicit rather than guessing, and the docs should show that instead of hiding it.
- The Codex skill/help surface should stay aligned with the CLI and README so installed runtime instructions do not lag behind the package behavior.

### Milestone Closeout Backfill

- The audit still fails because `.planning/phases/13-js-input-contract-ast-recovery/13-VERIFICATION.md` is missing.
- Phase 13 already has plan summaries, validation strategy, parser/loader/generate tests, and a shipped CLI dry-run path. Phase 16 mainly needs to package that evidence into a verification artifact and tie it into the milestone proof set.

## Current Repo Reality

### `src/core/scorer.ts` has only the thin milestone-era score contract

The current score contract is:
- `queryQuality`
- `assertionSpecificity`
- `testStructure`
- `boundaryIsolation`

That is good enough for a headline score, but it lacks:
- explicit reasons for deductions,
- explicit low-confidence signals,
- a stable way to derive the “top blockers” for user-facing warnings,
- a distinct trust-layer summary for `C`/`D`/`F` output.

`src/core/scorer.test.ts` only guards placeholder render targets and boundary warnings today. That is not enough to prove Phase 16’s trust contract.

### `src/cli/commands/generate.ts` already owns the right public seam

The generate command already:
- loads JS or JSON via `loadInput()`,
- resolves JS-only selectors and visual state when available,
- logs the public score line,
- emits hints and boundary warnings,
- shows the dry-run preview,
- verifies syntax after writing.

That makes `src/cli/commands/generate.ts` the main Phase 16 seam for:
- low-confidence banners,
- top-blocker summaries,
- score reason emission,
- and public-flow parity smoke proof.

### JSON support exists, but public proof is weaker than the JS path

The codebase already supports JSON generation through:
- `src/core/input-loader.ts`
- `src/core/parser.ts`
- `src/core/recording-intelligence.ts`
- the non-JS branch in `src/cli/commands/generate.ts`

But the repo lacks:
- canonical JSON recording fixtures under `sample/`,
- sample-backed CLI regression coverage for JSON,
- milestone-level built-CLI smoke evidence for representative JSON flows,
- README/help text that describes JSON support alongside JS support.

This is the main gap for `VERIFY-02`.

### README and runtime docs still present generation as JS-only

`README.md` currently:
- documents `tayo generate <file>` as accepting Testing Library Recorder JS files,
- shows only JS examples,
- omits Chrome Recorder JSON from the supported input list,
- does not show an honest degraded-output example.

The installed Codex skill in `assets/codex/@tayo-dev/rtl-generate/SKILL.md` is also generic enough that it does not mention dual-input behavior or truthful degraded output.

This is the main gap for `VERIFY-03`.

### Phase 13 proof exists in fragments, not in one verification artifact

Phase 13 already has:
- `13-VALIDATION.md`
- `13-01` through `13-04` summaries
- input-loader, JS parser, CLI, and recording-intelligence coverage
- a shipped CLI JS baseline path

What is missing is the verification report that says those fragments now satisfy `INPUT-01`, `INPUT-02`, `INPUT-03`, and `QUERY-01` in audit terms.

## Recommended Implementation Shape

### 1. Expand the score contract without breaking the recognizable score line

Phase 16 should preserve the current headline score shape:
- total score,
- letter grade,
- dimension breakdown.

But it should add:
- deterministic `signals`,
- deterministic `reasons`,
- an explicit low-confidence classifier/badge derived from the same evidence,
- a top-blocker summary for the CLI surface.

That matches the user’s instruction: move toward a deterministic/explainable rubric without replacing the public surface entirely in this phase.

### 2. Introduce representative JSON fixtures and public-flow parity regressions

Because there are no JSON samples in `sample/` today, Phase 16 likely needs to add a small canonical fixture set such as:
- a straightforward flow,
- a dialog/stateful flow.

Those fixtures should drive:
- input-loader coverage,
- parser/recording-intelligence non-regression coverage,
- CLI `generate --dry-run` parity assertions.

The point is not byte-for-byte output locking. The point is behavioral proof that JSON still works through the public flow while JS fidelity improved.

### 3. Align README/help/examples with shipped behavior

Phase 16 should update the product surface so that:
- installer-first onboarding stays intact,
- dual-input generation is explicit,
- JS remains the primary worked example,
- JSON appears in the supported input surface and shorter example/note path,
- one honest draft-quality example demonstrates checkpoints/warnings instead of hiding them.

The CLI help should remain short and let the README/examples carry the nuance.

### 4. Backfill Phase 13 verification and use it in milestone closeout

Phase 16 should create `.planning/phases/13-js-input-contract-ast-recovery/13-VERIFICATION.md` using evidence that already exists plus any new built-CLI proof run needed for consistency with the milestone’s final verification story.

This is not a new feature; it is milestone evidence packaging.

## Main Risks

- Replacing the score surface instead of extending it would create unnecessary churn and could make Phase 16 larger than planned.
- Overly rigid JSON parity checks could turn harmless output drift into noisy failures and slow future improvements.
- README/help updates could overstate confidence if the honest degraded-output example is removed or softened too much.
- Phase 13 verification backfill could become hand-wavy if it does not cite real commands and artifacts that still exist in the repo.
- Phase 16 could accidentally drift into new generator features; the phase boundary needs to stay on verification, parity, and public truth.

## Validation Architecture

- Score contract tests:
  - scorer output includes deterministic reasons/signals for low-confidence states,
  - structure/boundary deductions remain explainable and stable,
  - `C`-or-below output triggers the stronger trust banner path.
- CLI regression tests:
  - dry-run and write mode emit the same low-confidence summary behavior,
  - top blockers are derived from real score/boundary evidence instead of static tips,
  - the public score line remains recognizable.
- JSON parity regressions:
  - representative JSON fixtures load through the shared input boundary,
  - CLI JSON dry-run behavior remains stable at the public surface,
  - JSON flows continue to respect existing normalization/noise filtering behavior.
- Product-surface/manual verification:
  - README and help text visibly document both `.js` and `.json` support,
  - one draft-quality example demonstrates truthful degraded output,
  - Phase 13 verification artifact cites real evidence and closes the audit gap.

## Likely Plan Slices

1. Expand scoring and CLI trust messaging with deterministic reasons/signals and a `C`-or-below draft banner.
2. Add representative JSON parity fixtures and public-flow regression proof for the JSON path.
3. Update README/help/examples, backfill Phase 13 verification, and align the milestone proof surface for re-audit.
