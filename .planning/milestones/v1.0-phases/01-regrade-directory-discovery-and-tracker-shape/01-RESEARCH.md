# Phase 1 Research: Regrade Directory Discovery and Tracker Shape

**Phase:** 1 **Date:** 2026-03-31 **Status:** Complete

## Goal

Define which files a regrade directory loop processes and extend the Markdown tracker format to represent test-oriented entries without pulling Phase 2 regrade execution or Phase 3 resume-policy changes forward.

## Relevant Existing Surfaces

- `src/cli/commands/target.ts` Owns the existing `--directory-loop` flow, including validation, tracker bootstrap, sequential processing, and resume/retry semantics.
- `src/cli/commands/target-directory-tracker.ts` Owns canonical `.taro/directory-loop/*.md` tracker naming, Markdown rendering/parsing, single-in-progress updates, and atomic writes.
- `src/cli/commands/tests/target.test.ts` Already covers directory scanning, non-component skips, completed/in-progress transitions, resume behavior, and tracker log output.
- `src/cli/commands/tests/target-directory-tracker.test.ts` Covers tracker path generation, Markdown rendering, and the single-active-entry invariant.
- `src/core/state.ts` Exposes `appendGeneratedTestRecord()` and existing `.taro/state.json` persistence, but that belongs mostly to Phase 2 onward.
- `src/types/state.ts` and `src/core/state.validation.ts` Define the persisted `generatedTests` schema. No tracker-facing metadata for follow-up comments or prior score thresholds exists there today.
- `.codex/skills/@taro-test/rtl-regrade/SKILL.md` Documents the current single-file `regrade` contract: latest matching snapshot lookup, append-only history, and latest-5 trimming.

## Planning Boundary

Phase 1 should plan and implement:

- directory-target validation for `regrade`
- eligible test discovery for `*.test.*` and `*.spec.*`
- canonical tracker creation in `.taro/directory-loop/`
- tracker entry schema changes for test-oriented metadata
- tracker parsing/rendering/update behavior and tests

Phase 1 should not own:

- full sequential directory-loop regrade execution
- appending new `generatedTests` records for each looped test
- failure/retry semantics beyond preserving the tracker model needed by later phases
- runtime-doc/help rollout

## Implementation Seams To Reuse

### 1. Trackers should be extended, not replaced

`target-directory-tracker.ts` already solves:

- stable tracker file naming via `getProjectStatePath(projectRoot, "directory-loop", ...)`
- display-path normalization for repo-relative Markdown
- atomic writes using temp-file replacement
- Markdown round-tripping via `renderDirectoryLoopTrackerMarkdown()` and `readDirectoryLoopTracker()`
- a single `in-progress` entry invariant in `updateDirectoryLoopTrackerStatus()`

This phase should preserve those guarantees while changing the entry shape from component/output-centric data to test/regrade-centric data or introducing a compatible generalized form.

### 2. Discovery should mirror `target --directory-loop` structure

`target.ts` already validates:

- directory input requires `--directory-loop`
- `--directory-loop` is invalid for single-file targets
- discovery filters and tracker bootstrap happen before the loop executes

The planner should reuse that decomposition for `regrade`, but swap component-source discovery for test-file discovery.

### 3. Existing acceptance heuristics are useful context, not Phase 1 scope

`buildDirectoryLoopTracker()` in `target.ts` uses:

- prior tracker state
- current filesystem output presence
- latest generated-test score status from `.taro/state.json`

That pattern matters because regrade directory mode will also need tracker bootstrap informed by stored history. But Phase 1 only needs the tracker and discovery model, not the full completed/requeue policy.

## Required Requirement Coverage

Phase 1 must cover these IDs explicitly in plan frontmatter or task mappings:

- `RGDIR-01`
- `RGDIR-02`
- `RGDIR-03`
- `RGTRK-01`
- `RGTRK-02`
- `RGTRK-03`

## Recommended File Touch Points

Most likely Phase 1 files:

- `src/cli/commands/target-directory-tracker.ts`
- `src/cli/commands/tests/target-directory-tracker.test.ts`
- `src/cli/commands/tests/target.test.ts`

Likely additional files depending on how `regrade` is surfaced:

- a runtime-facing regrade command implementation file if one exists in `src/cli/commands/`
- `src/index.ts` or related CLI command wiring if directory-loop parsing is introduced there
- shared helpers for discovering test files if `regrade` should not live inside `target.ts`

## Open Decisions The Planner Must Resolve

### Tracker model shape

The current tracker entry is:

- `componentPath`
- `outputPath`
- `status`

Phase 1 needs a plan for representing:

- test file path
- prior score threshold when known
- later compatibility with updated score threshold and follow-up comments

The planner should decide whether to:

- generalize the tracker into a reusable directory-loop tracker type, or
- introduce a separate regrade-specific tracker utility while preserving canonical path and write patterns

### Discovery ownership

The planner should decide whether test discovery belongs in:

- a new `regrade` command module, or
- a shared discovery helper used by current and future directory-loop flows

The plan should keep this decision concrete and tied to actual files.

## Risks

- Over-generalizing the tracker in Phase 1 could accidentally drag in Phase 2 execution concerns.
- Keeping tracker changes too component-specific will make Phase 2 awkward and duplicate logic.
- The UI-phase detector can false-positive on the word `component`; this phase is CLI/state work, not frontend design work.
- `phase_req_ids` were not populated by tooling init, so the plan must manually include the roadmap requirement IDs above.

## Test Strategy

Phase 1 should primarily expand existing Vitest coverage:

- tracker render/parse tests for new test-centric fields
- tracker status-update tests that preserve one in-progress entry at a time
- directory discovery tests that include `*.test.*`, `*.spec.*`, and exclude non-tests
- argument validation tests for directory vs file input and `--directory-loop` usage

Prefer extending the current target/tracker tests if the code reuse remains in those files; otherwise add new regrade command tests only where the new surface actually lives.

## Validation Architecture

Phase 1 is well-suited to fast automated verification because it is mostly tracker and discovery logic with stable filesystem fixtures. Validation should lean on targeted Vitest runs plus a final broader repo test run before phase verification.

## Summary

- Reuse the canonical `.taro/directory-loop/` tracker conventions.
- Keep Phase 1 limited to discovery plus tracker shape.
- Make the requirement-ID mapping explicit because init did not surface it.
- Use existing tracker and directory-loop tests as the primary execution guardrail.
