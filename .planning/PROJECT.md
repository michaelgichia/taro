# Taro

## What This Is

Taro installs runtime-native workflows into Claude Code, OpenCode, Gemini CLI, and Codex so teams can generate, grade, and regrade React Testing Library tests with repository-aware conventions. It is built for agent-assisted test authoring and review where the output, score history, and follow-up guidance need to stay grounded in the local codebase.

## Core Value

Taro should produce repo-aware, auditable RTL output and score history that make uncertainty explicit instead of hiding it.

## Requirements

### Validated

- ✓ Users can install runtime-native `generate`, `grade`, `regrade`, and `target` entrypoints across supported agent runtimes.
- ✓ Users can batch-generate component tests through `target --directory-loop` with a resumable Markdown tracker under `.taro/directory-loop/`.
- ✓ Taro stores recent generated-test scoring history in `.taro/state.json` and uses it to bias future learning.

### Active

- [ ] `regrade --directory-loop` can batch regrade all eligible tests in a target directory.
- [ ] The regrade directory tracker records per-test status, prior score threshold, new score threshold, and follow-up comments.
- [ ] Directory-loop regrade resumes safely after failures without changing single-file `regrade` history guarantees.

### Out of Scope

- Parallel regrading across multiple workers — the existing directory-loop model is sequential and avoids tracker/state conflicts.
- Changing the scoring rubric or letter-grade thresholds — this milestone extends orchestration, not evaluation policy.
- Replacing the Markdown tracker with a database or UI dashboard — current batch UX is file-based under `.taro/directory-loop/`.

## Context

- Existing directory-loop behavior lives in `src/cli/commands/target.ts` and `src/cli/commands/target-directory-tracker.ts`.
- Existing `regrade` behavior is runtime-skill driven and appends `generatedTests` snapshots into `.taro/state.json`.
- The current tracker schema only stores status plus component/output paths, so this milestone likely expands the tracker model for test-centric metadata.
- The repo already has strong Vitest coverage for tracker semantics, score history trimming, and generated-test state writes.

## Constraints

- **Tech stack**: TypeScript ESM on Node 18+ — new behavior should fit the existing command/state modules and test style.
- **State safety**: Preserve `.taro/state.json` matching and latest-5 trimming rules for `generatedTests` entries.
- **UX continuity**: Reuse the canonical `.taro/directory-loop/` tracker pattern instead of inventing a second batch-progress surface.
- **Runtime compatibility**: Keep runtime-facing docs and installed prompts/skills aligned across Codex, Claude Code, Gemini CLI, and OpenCode.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reuse the existing directory-loop tracker abstraction as the base for regrade batching | The repo already has resume/retry semantics, tracker persistence, and tests around this path | — Pending |
| Keep directory-loop regrade sequential with one in-progress entry at a time | This matches current batch behavior and reduces write conflicts in tracker/state files | — Pending |
| Treat follow-up comments as tracker output, not a change to the score rubric | The user asked for richer batch reporting, not a new evaluation model | — Pending |

## Current Milestone: v1.0 Regrade a test directory

**Goal:** Add `regrade --directory-loop` so Taro can batch regrade every eligible test in a directory and track progress/results across the full loop.

**Target features:**
- `regrade` accepts `--directory-loop` for directory targets.
- The loop creates a Markdown tracker with current and updated per-test score thresholds.
- Tracker entries move through `pending`, `in-progress`, and `completed` during the loop.
- Completed entries record follow-up comments from the regrade result.
- The loop resumes safely until all discovered tests are regraded.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 after milestone v1.0 kickoff*
