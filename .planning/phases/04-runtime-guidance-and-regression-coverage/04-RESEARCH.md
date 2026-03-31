# Phase 4 Research: Runtime Guidance and Regression Coverage

**Phase:** 4
**Date:** 2026-03-31
**Status:** Complete

## Goal

Make `regrade --directory-loop` discoverable in the installed runtime surfaces and keep the published guidance aligned with the implemented tracker semantics through regression coverage.

## Context Source

No `04-CONTEXT.md` exists, so this research is derived from:

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- Phase 1-3 summaries
- current runtime skill/command assets
- install/runtime regression tests
- README and `docs/USER-GUIDE.md`

## Relevant Existing Surfaces

- `README.md`
  Documents generation, grading, and target directory-loop behavior, but the regrade section still describes only single-file regrade. It does not yet tell users how to invoke directory-loop regrade, where the tracker lives, or which statuses to expect.
- `docs/USER-GUIDE.md`
  Mirrors the same gap: `regrade` is described as a single-file reevaluation flow, while directory-loop details exist only for `target`.
- `.codex/skills/@taro-test/rtl-regrade/SKILL.md`
  Still frames regrade as “existing RTL test file” only and explicitly avoids invoking `__regrade`, which is now wrong for directory-loop use.
- `agents/taro-regrade.md`
  Is the authored source for the packaged Codex regrade skill. It has the same single-file-only framing.
- `commands/claude/@taro-test/rtl/regrade.md`
- `commands/gemini/@taro-test/rtl/regrade.toml`
- `commands/opencode/@taro-test/rtl-regrade.md`
  These prompt-runtime assets are also still single-file oriented and do not route directory input with `--directory-loop` into the runtime command.
- `.codex/skills/@taro-test/rtl-help/SKILL.md`
  Routes users to `$@taro-test/rtl-regrade` but does not explain that regrade now supports directory-loop mode for test directories.
- `src/install/tests/codex-runtime.test.ts`
- `src/install/tests/prompt-runtimes.test.ts`
  Assert basic regrade asset content today, but only for the legacy single-file wording like “latest 5 snapshots” and “Do not invent or invoke `__regrade`.”
- `src/cli/commands/tests/regrade.test.ts`
  Already acts as a CLI smoke suite for the implemented `__regrade <dir> --directory-loop` behavior and tracker output.

## Current Gap

The implementation is ahead of the packaged guidance:

- the CLI supports directory-loop regrade with tracker bootstrap, sequential completion, resume, and failure-stop semantics
- the installed user-facing regrade surfaces still imply single-file-only behavior
- the help routing surfaces do not tell users that regrade accepts a test directory when `--directory-loop` is passed
- install/runtime tests do not protect this new guidance

That creates a real product risk: users can have a working feature that is not discoverable from the packaged surfaces they are meant to use.

## Recommended Guidance Shape

### 1. Regrade should explicitly support two invocation modes

The user-facing runtime docs should distinguish:

- single-file regrade: existing `*.test.*` / `*.spec.*` file
- directory-loop regrade: test directory plus `--directory-loop`

The packaged guidance should make it clear that directory mode:

- runs `__regrade <test-directory> --directory-loop`
- writes a tracker under `.taro/directory-loop/`
- records rows that move through `pending` → `in-progress` → `completed`
- stores current and updated score thresholds plus follow-up comments

### 2. Single-file and directory-loop guidance need different internal rules

The previous blanket instruction “Do not invent or invoke `__regrade`” is now too broad. The correct rule is:

- do not invent hidden scoring flows for single-file regrade
- for directory input plus `--directory-loop`, invoke the supported runtime command path

That distinction should be reflected in the authored assets rather than patched only in installed outputs.

### 3. Help-routing surfaces should advertise the new path

`rtl-help` should mention that:

- `$@taro-test/rtl-regrade <test-file>` remains the single-file delta flow
- `$@taro-test/rtl-regrade <test-directory> --directory-loop` is the batch regrade flow
- the tracker lives under `.taro/directory-loop/`

This keeps the routing layer aligned with the actual feature set.

## Planning Boundary

Phase 4 should own:

- runtime-facing docs/help/skill updates for directory-loop regrade
- packaged prompt/skill asset updates for Claude, Gemini, OpenCode, and Codex
- regression coverage that locks the new guidance into authored/install surfaces
- lightweight smoke coverage that keeps documented invocation aligned with the implemented command path

Phase 4 should not own:

- new regrade orchestration behavior
- configurable requeue thresholds
- non-Markdown tracker UI
- parallel execution

Those are outside this milestone.

## Required Requirement Coverage

Phase 4 must cover this ID explicitly:

- `RGUX-01`

## Recommended Decomposition

### Plan 04-01 (Wave 1)
Update user-facing runtime docs and packaged asset sources.

Recommended files:

- `README.md`
- `docs/USER-GUIDE.md`
- `.codex/skills/@taro-test/rtl-regrade/SKILL.md`
- `.codex/skills/@taro-test/rtl-help/SKILL.md`
- `agents/taro-regrade.md`
- `commands/claude/@taro-test/rtl/regrade.md`
- `commands/gemini/@taro-test/rtl/regrade.toml`
- `commands/opencode/@taro-test/rtl-regrade.md`

Why first:

- it defines the canonical wording and invocation contract that regression tests should assert

### Plan 04-02 (Wave 2)
Add regression coverage for packaged runtime assets and documented invocation smoke.

Recommended files:

- `src/install/tests/codex-runtime.test.ts`
- `src/install/tests/prompt-runtimes.test.ts`
- `src/install/tests/verification.test.ts` if packaging/documented assets need tarball-level assertions
- `src/cli/commands/tests/regrade.test.ts` only if a focused smoke assertion is needed to keep the documented directory-loop contract aligned

Why second:

- tests should assert the exact wording and command paths established in Plan `04-01`

## Risks

### Runtime-doc drift

If README, user guide, and packaged runtime assets use different wording, users will get contradictory instructions depending on where they look.

### Asset-source vs installed-output drift

The runtime surfaces are authored in `agents/` and `commands/`, then installed through runtime builders. Phase 4 needs tests at the installed-output level, not just source-file edits.

### Overcorrecting the single-file regrade contract

The new directory-loop guidance must not break or obscure the existing single-file regrade flow. The plan should keep both modes explicit.

### Testing only docs, not packaged assets

Because users consume installed commands/skills, coverage should prioritize packaged/install surfaces over README-only checks.

## Verification Targets

Phase completion should be proven by automated checks that show:

- packaged Codex and prompt-runtime regrade assets mention directory-loop invocation
- help/routing surfaces mention the batch regrade path
- packaged assets still include the expected launcher/runtime command paths
- the current `regrade.test.ts` smoke coverage still matches the documented tracker behavior

Scoped verification should prefer direct `pnpm exec vitest run ...` commands for install/runtime tests and regrade smoke.

## Summary

- The feature is implemented, but the installed runtime guidance is still single-file-centric.
- Phase 4 should update the authored runtime docs first, then lock them down with install/runtime regression tests.
- The target skill is the correct precedent: directory input should be explicitly routed into the hidden runtime command path, not hand-waved.
