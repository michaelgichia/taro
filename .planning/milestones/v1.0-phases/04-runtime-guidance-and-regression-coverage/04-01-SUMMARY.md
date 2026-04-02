---
phase: 04-runtime-guidance-and-regression-coverage
plan: 01
subsystem: runtime-docs
tags: [docs, codex, claude, gemini, opencode, regrade]
requires:
  - phase: 03-02
    provides: complete regrade directory-loop resume and failure semantics
provides:
  - published regrade docs for both single-file and directory-loop flows
  - authored runtime assets that route directory input into `__regrade <test-directory> --directory-loop`
  - help-routing text that advertises tracker location and batch progress behavior
affects: [04-02, milestone-closeout]
tech-stack:
  added: []
  patterns:
    [runtime-doc parity across packaged assets, tracker lifecycle documentation]
key-files:
  created: []
  modified:
    - README.md
    - docs/USER-GUIDE.md
    - agents/taro-help.md
    - agents/taro-regrade.md
    - commands/claude/@taro-test/rtl/regrade.md
    - commands/gemini/@taro-test/rtl/regrade.toml
    - commands/opencode/@taro-test/rtl-regrade.md
key-decisions:
  - "Documented regrade as a two-mode contract instead of keeping directory-loop support implicit."
  - "Used the same runtime-command routing pattern already established by target directory-loop assets."
patterns-established:
  - "Batch regrade guidance always names `.taro/directory-loop/` and the `pending` -> `in-progress` -> `completed` tracker lifecycle."
  - "Directory-mode regrade assets route only explicit directory requests through the internal runtime command."
requirements-completed: [RGUX-01]
duration: 4min
completed: 2026-03-31
---

# Phase 4: Runtime Guidance and Regression Coverage Summary

**Runtime-facing regrade docs now expose both single-file and directory-loop flows, including the tracker path and row lifecycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T07:04:39Z
- **Completed:** 2026-03-31T07:13:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Updated README and the user guide so `regrade` no longer appears to be single-file only.
- Revised the authored Codex and prompt-runtime regrade assets to route explicit directory input into `__regrade <test-directory> --directory-loop`.
- Updated packaged help-routing content so batch regrade points users at `.taro/directory-loop/` and the tracker state progression.

## Task Commits

This plan landed together with Plan `04-02` in one implementation commit:

1. **Tasks 1-3: Publish batch regrade runtime guidance and lock it with regression coverage** - `ab6b5f6` (feat)

## Files Created/Modified

- `README.md` - documents the two-mode regrade contract and the tracker row lifecycle.
- `docs/USER-GUIDE.md` - adds directory-loop grading rules and tracker metadata expectations.
- `agents/taro-help.md` - advertises batch regrade in the shipped Codex help surface.
- `agents/taro-regrade.md` - makes the shipped Codex regrade skill explicitly support directory-loop mode.
- `commands/claude/@taro-test/rtl/regrade.md` - routes directory input to the runtime launcher and reports tracker metadata.
- `commands/gemini/@taro-test/rtl/regrade.toml` - mirrors the same two-mode regrade contract for Gemini installs.
- `commands/opencode/@taro-test/rtl-regrade.md` - mirrors the same two-mode regrade contract for OpenCode installs.

## Decisions Made

- Matched the existing `target` directory-loop runtime phrasing so Taro exposes one consistent batch-launch contract across surfaces.
- Kept single-file regrade as the state-driven skill flow and reserved `__regrade` for explicit directory-loop use only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - the new guidance ships through the existing runtime assets.

## Next Phase Readiness

Plan `04-02` can now lock the updated guidance into installed-output and smoke coverage.

## Self-Check: PASSED

---

_Phase: 04-runtime-guidance-and-regression-coverage_ _Completed: 2026-03-31_
