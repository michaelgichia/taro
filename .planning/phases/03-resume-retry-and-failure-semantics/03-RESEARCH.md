# Phase 3 Research: Resume, Retry, and Failure Semantics

**Phase:** 3
**Date:** 2026-03-31
**Status:** Complete

## Goal

Preserve safe restart behavior for `regrade --directory-loop` so an interrupted or failed batch run keeps the active test `in-progress`, leaves untouched tests `pending`, skips already-completed rows on rerun, and aligns failure behavior with the existing target directory-loop UX.

## Context Source

No `03-CONTEXT.md` exists, so this research is derived from:

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- Phase 2 summaries
- current `regrade.ts`, `regrade-runner.ts`, tracker utilities, and `target.ts`
- existing target and regrade command tests

## Relevant Existing Surfaces

- `src/cli/commands/regrade.ts`
  Already bootstraps or reloads the tracker, preserves prior row status when rebuilding entries, processes `in-progress` before `pending`, and marks successful regrades `completed`. It does not yet harden failure handling inside the loop.
- `src/cli/commands/regrade-runner.ts`
  Represents the per-test regrade worker. It returns a scored result on success and currently signals failure by throwing.
- `src/cli/commands/target.ts`
  Already implements the restart model Phase 3 should mirror: mark the current row `in-progress`, run exactly one item, stop on failure, keep the current row active, and resume from that row on rerun.
- `src/cli/commands/target-directory-tracker.ts`
  Already supports the single-active-entry invariant and Markdown persistence needed for resumed runs.
- `src/cli/commands/tests/target.test.ts`
  Already codifies the expected target-loop semantics for:
  - stopping on the current item when work fails
  - retrying the current `in-progress` row on rerun
  - skipping already-completed rows on resume
- `src/cli/commands/tests/regrade.test.ts`
  Currently covers only the happy path, validation, and completed-row metadata.

## What Already Works

### 1. Completed rows are already skipped naturally on rerun

`buildRegradeDirectoryLoopTracker()` reuses `previousEntry?.status` when rebuilding the tracker from the discovered test set. The loop body then selects:

- the existing `in-progress` entry first
- otherwise the first `pending` entry

Because `completed` entries are not selected by either branch, reruns already avoid reprocessing completed tests unless some future gating rule explicitly changes their status.

### 2. An `in-progress` row is already retried first

The loop checks `tracker.entries.find((entry) => entry.status === "in-progress")` before pending rows. That matches the target command’s retry-first behavior and should remain the canonical rule for regrade.

### 3. Failure persistence is only partially present today

The current regrade loop writes the current row as `in-progress` before invoking the runner. If the runner throws, the outer command-level catch exits the whole command, so the tracker often remains with the active row still `in-progress`.

What is missing is explicit, intentional failure handling:

- the loop does not document or test that this is the contract
- failure exits currently route through the top-level catch and use exit code `2`
- no test proves later rows remain `pending`
- no test proves a rerun retries the failed row before continuing

## Existing Semantics To Mirror From `target --directory-loop`

The target command already defines the intended batch-control model:

- success marks the current row `completed`
- failure stops the loop immediately
- the current row stays `in-progress`
- later rows remain `pending`
- reruns retry the `in-progress` row first
- already-completed rows are skipped unless a documented gating rule requeues them
- command exits non-zero on loop interruption/failure

Phase 3 should copy those semantics into regrade with minimal divergence. Regrade does not need new policies beyond what target already proved out.

## Planning Boundary

Phase 3 should own:

- explicit resume semantics for previously `completed` and `in-progress` regrade rows
- failure-stop handling around the per-test runner
- exit-code and log behavior for interrupted regrade loops
- integration tests proving retry-first and skip-completed behavior

Phase 3 should not own:

- runtime help text or user-facing docs
- new gating rules for requeueing completed rows
- richer progress summaries or end-of-run reports
- parallelization or multi-worker behavior

Those remain outside this phase, primarily in Phase 4 or later milestones.

## Required Requirement Coverage

Phase 3 must cover these IDs explicitly:

- `RGEX-02`
- `RGEX-03`

## Recommended Decomposition

### Plan 03-01 (Wave 1)
Codify resume semantics and tracker reconciliation for reruns.

Recommended files:

- `src/cli/commands/regrade.ts`
- `src/cli/commands/tests/regrade.test.ts`

Why first:

- the loop already has most of the resume selection behavior, but it is unproven and not explicitly locked down
- Phase 3 should establish skip-completed and retry-current semantics before adding failure-path hardening

### Plan 03-02 (Wave 2)
Add explicit failure-stop handling and resume-after-failure coverage.

Recommended files:

- `src/cli/commands/regrade.ts`
- `src/cli/commands/tests/regrade.test.ts`

Why second:

- once rerun selection rules are fixed, the failure path can deliberately preserve `in-progress` state and exit correctly
- this keeps failure semantics from being implemented with ambiguous tracker behavior

## Risks

### Silent semantic drift from target-loop behavior

If regrade invents its own stop/retry rules instead of reusing the target command’s control flow, the two directory-loop commands will diverge and become harder to reason about.

### Accidental reprocessing of completed rows

The current tracker rebuild uses prior status, but a careless refactor could reset `completed` rows back to `pending`. Phase 3 needs tests that make that regression obvious.

### Wrong exit code on loop failure

The current top-level catch exits with code `2`, which is more appropriate for usage/configuration errors than interrupted batch work. Phase 3 should separate command-usage failure from loop-execution failure.

### Failure-path state corruption

If the loop clears or rewrites the active row after a runner error, the next rerun could skip work or lose the place where the batch stopped.

## Verification Targets

Phase completion should be proven by automated tests that show:

- reruns skip tests already marked `completed`
- reruns retry the existing `in-progress` row before any later `pending` row
- a thrown runner failure leaves the current row `in-progress` and later rows `pending`
- failure exits non-zero without falsely marking the active row `completed`
- a rerun after failure retries the same row and can continue through the rest of the queue once it succeeds

Scoped verification should prefer direct `pnpm exec vitest run ...` commands, with `target.test.ts` included where useful to guard semantic parity.

## Summary

- Regrade already has most of the resume-selection mechanics; Phase 3 needs to make them explicit and tested.
- The existing target directory loop is the canonical model for stop/retry behavior.
- Phase 3 should separate resume semantics from failure-stop hardening into two plans.
- Exit-code handling needs to distinguish usage errors from mid-loop execution failures.
