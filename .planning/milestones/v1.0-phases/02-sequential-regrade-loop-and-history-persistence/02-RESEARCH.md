# Phase 2 Research: Sequential Regrade Loop and History Persistence

**Phase:** 2
**Date:** 2026-03-31
**Status:** Complete

## Goal

Execute the regrade directory loop end-to-end so each discovered test is rescored, appended into `generatedTests` history, and written back into the canonical tracker with its new score threshold and follow-up comments.

## Context Source

No `02-CONTEXT.md` exists, so this research is derived from:

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- Phase 1 summaries
- current `regrade.ts`, tracker, scorer, and state persistence code

## Relevant Existing Surfaces

- `src/cli/commands/regrade.ts`
  Already validates `--directory-loop`, discovers eligible tests, reads the latest stored score threshold, and writes the initial tracker bootstrap.
- `src/cli/commands/target-directory-tracker.ts`
  Owns canonical tracker naming, repo-relative display paths, atomic writes, Markdown round-tripping, and single-active-entry status updates.
- `src/core/state.ts`
  Exposes `appendGeneratedTestRecord()` and the existing `generatedTests` trimming behavior. It does not yet expose a reusable “latest matching generated-test record” lookup for regrade flows.
- `src/core/state-paths.ts`
  Already contains `normalizeGeneratedTestHistoryPath()`, which is the correct comparison key for matching regrade history to a test file.
- `src/core/scorer.ts`
  Exposes `scoreGeneratedTest()`, the repo’s real scoring engine for current test contents.
- `.codex/skills/@taro-test/rtl-regrade/SKILL.md`
  Documents the intended single-file regrade contract: compare to latest matching snapshot, append a new snapshot, preserve unrelated history, and keep only the latest 5 records for the target file.
- `src/cli/commands/target.ts`
  Already demonstrates the existing directory-loop sequencing pattern: bootstrap tracker, mark one entry `in-progress`, run a per-item worker, update the tracker, and continue until no pending work remains.

## Existing Implementation Seams To Extend

### 1. Regrade needs a reusable single-file runner boundary

Phase 1 stopped at discovery/bootstrap. Phase 2 needs a concrete seam that:

- reads an existing `*.test.*` / `*.spec.*` file
- finds the latest matching `generatedTests` entry by normalized `testFile` path
- scores current contents with `scoreGeneratedTest()`
- appends a fresh snapshot via `appendGeneratedTestRecord()`
- returns structured result data the directory loop can write into tracker rows

That logic should not live inline inside the loop body in `regrade.ts`. A dedicated helper such as `src/cli/commands/regrade-runner.ts` is the cleanest boundary for later reuse by runtime-facing single-file regrade surfaces.

### 2. Tracker rows need completion metadata, not a second tracker format

Phase 1 added:

- `currentScoreThreshold`
- `kind`

Phase 2 must extend the same tracker rows with:

- updated score threshold after regrade
- follow-up comments derived from the regrade result

The tracker should remain canonical under `.taro/directory-loop/`; creating a second completion tracker format would duplicate resume state and break the existing Markdown flow.

### 3. `generatedTests` history matching must reuse current normalization

The current bootstrap already keys off:

- `normalizeGeneratedTestHistoryPath(projectRoot, testFile)`

Phase 2 should continue to use that exact normalization both for:

- “current stored score threshold” reads
- latest matching record lookup before appending a new history entry

Anything else risks path mismatches between directory-loop mode and existing history.

## Planning Boundary

Phase 2 should own:

- reusable single-test regrade execution
- latest matching record lookup and persistence parameter reuse
- appending fresh `generatedTests` snapshots per successful test
- completed tracker rows with updated score threshold and follow-up comments
- sequential directory-loop execution across all queued tests on the success path

Phase 2 should not own:

- hardened stop/resume/retry behavior beyond what naturally falls out of the loop
- requeue policy for already-completed rows under failure or gating conditions
- runtime-facing help or installed skill docs

Those are already reserved for Phases 3 and 4.

## Required Requirement Coverage

Phase 2 must cover these IDs explicitly:

- `RGTRK-04`
- `RGEX-01`
- `RGST-01`
- `RGST-02`
- `RGST-03`

## Recommended Decomposition

### Plan 02-01 (Wave 1)
Build a reusable single-file regrade runner and history persistence contract.

Recommended files:

- `src/cli/commands/regrade-runner.ts`
- `src/cli/commands/tests/regrade-runner.test.ts`
- `src/core/state.ts`
- `src/core/tests/state.test.ts`

Why first:

- the directory loop should call a real worker instead of embedding scoring/state logic inline
- it isolates `generatedTests` semantics before tracker/UI integration

### Plan 02-02 (Wave 2)
Extend tracker completion rows and wire the sequential `regrade --directory-loop` loop.

Recommended files:

- `src/cli/commands/target-directory-tracker.ts`
- `src/cli/commands/tests/target-directory-tracker.test.ts`
- `src/cli/commands/regrade.ts`
- `src/cli/commands/tests/regrade.test.ts`

Why second:

- the loop can treat the runner result as an input and focus on orchestration
- tracker completion schema and loop output stay aligned in one plan

## Risks

### Latest-match reuse drift

If the runner and bootstrap use different path-normalization rules, the tracker’s “current score” and the actual regrade delta will diverge.

### History append metadata drift

The runtime skill expects:

- reuse latest `packagePath`
- reuse latest `recordingFile` when present
- fall back cleanly when no prior snapshot exists

If Phase 2 hardcodes one of those values incorrectly, directory-loop history will diverge from single-file regrade semantics.

### Follow-up comment shape creep

Tracker comments should be concise, deterministic, and derived from existing scorer outputs such as:

- `requiresReview`
- `blockers`
- high-signal `reasons`

The plan should avoid inventing a second free-form diagnostics system.

### Success-path work bleeding into resume semantics

Phase 2 should prove the loop can finish all queued tests. It should not absorb Phase 3’s full interruption policy just because the same tracker is reused.

## Verification Targets

Phase completion should be proven by automated tests that show:

- a single-file regrade appends a new history entry while preserving unrelated entries
- the latest matching snapshot is reused when present and initialization still works when absent
- per-test history still trims to the latest 5 entries
- a successful directory loop completes all queued tests sequentially
- completed tracker rows show the updated score threshold and follow-up comments

Given the repo test wrapper behavior observed in Phase 1, Phase 2 planning should prefer direct `pnpm exec vitest run ...` commands for scoped verification.

## Summary

- Extract a reusable single-file regrade runner first.
- Keep `generatedTests` matching keyed by `normalizeGeneratedTestHistoryPath()`.
- Extend the existing tracker rows rather than inventing a new completion format.
- Let Phase 2 cover the success path; keep interruption hardening for Phase 3.
