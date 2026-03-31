---
phase: 04-runtime-guidance-and-regression-coverage
plan: 02
subsystem: verification
tags: [vitest, install, packaging, cli, regrade]
requires:
  - phase: 04-01
    provides: published batch regrade runtime guidance
provides:
  - installed-output regression coverage for regrade directory-loop wording
  - package smoke proof for the updated regrade runtime assets
  - smoke assertions that keep documented tracker behavior aligned with the real command
affects: [milestone-closeout]
tech-stack:
  added: []
  patterns: [installed-asset contract tests, docs-to-runtime smoke alignment]
key-files:
  created: []
  modified:
    - src/install/tests/codex-runtime.test.ts
    - src/install/tests/prompt-runtimes.test.ts
    - src/install/tests/verification.test.ts
    - src/cli/commands/tests/regrade.test.ts
key-decisions:
  - "Asserted installed output rather than authored source files so packaging or substitution regressions fail fast."
  - "Extended the existing regrade smoke test instead of adding a second end-to-end harness."
patterns-established:
  - "Runtime asset tests now fail if regrade guidance drops the directory-loop launcher path or tracker wording."
  - "The documented batch-complete log line is anchored to a passing CLI test."
requirements-completed: [RGUX-01]
duration: 4min
completed: 2026-03-31
---

# Phase 4: Runtime Guidance and Regression Coverage Summary

**Installed runtime assets and package smoke coverage now lock the documented batch regrade flow to the shipped and tested command path**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T07:04:39Z
- **Completed:** 2026-03-31T07:13:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Expanded installed Codex, Claude, Gemini, and OpenCode runtime tests to assert directory-loop regrade wording, launcher paths, and tracker reporting.
- Kept the package smoke proof aware of the updated regrade assets so the packaged install surface cannot silently omit them.
- Added a focused regrade smoke assertion for the final tracker-complete log line described by the new docs.

## Task Commits

This plan landed together with Plan `04-01` in one implementation commit:

1. **Tasks 1-3: Publish batch regrade runtime guidance and lock it with regression coverage** - `ab6b5f6` (feat)

## Files Created/Modified

- `src/install/tests/codex-runtime.test.ts` - verifies the installed Codex help and regrade skills advertise directory-loop regrade correctly.
- `src/install/tests/prompt-runtimes.test.ts` - verifies the shipped Claude, Gemini, and OpenCode regrade assets keep the batch-launch contract.
- `src/install/tests/verification.test.ts` - keeps the updated regrade assets inside package smoke proof.
- `src/cli/commands/tests/regrade.test.ts` - anchors the documented tracker-complete logging behavior to the real command path.

## Decisions Made

- Covered both global and local installed-output variants because runtime-command substitution is part of the user-facing contract.
- Reused the existing CLI smoke harness so documentation drift is caught without introducing duplicate loop orchestration tests.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first install-test pass exposed that shipped Codex help is sourced from `agents/taro-help.md`, not the ignored local `.codex` copy. Updating the shipped agent asset resolved the mismatch cleanly.

## User Setup Required

None

## Next Phase Readiness

All planned Phase 4 work is complete. The milestone is ready for completion/archival.

## Self-Check: PASSED

---

_Phase: 04-runtime-guidance-and-regression-coverage_ _Completed: 2026-03-31_
