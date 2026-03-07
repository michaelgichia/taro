---
phase: 10-installer-core-package-entry
plan: "02"
subsystem: cli
tags: [installer, prompts, commander, validation]

requires:
  - phase: 10-installer-core-package-entry
    provides: installer-first root CLI and explicit install command from 10-01

provides:
  - typed installer runtime and location selection model
  - runtime-first interactive prompt flow with custom subset selection
  - non-interactive flag normalization with actionable no-TTY validation errors

affects: [10-installer-core-package-entry, installer, interactive-flow]

tech-stack:
  added: []
  patterns:
    - "Installer selection is normalized before execution so prompt and flag paths share one intent model"
    - "Interactive prompts ask runtimes first, then collect location per selected runtime"

key-files:
  created:
    - src/install/types.ts
    - src/install/options.ts
    - src/install/prompts.ts
  modified:
    - src/cli/commands/install.ts
    - src/index.ts

key-decisions:
  - "No-TTY installs fail instead of guessing defaults when runtime or location flags are missing"
  - "Interactive runtime choice uses a numbered comma-separated picker so users can install any subset, not just one runtime or all"

patterns-established:
  - "Shared installer types live under `src/install/` and are reused by both CLI wiring and later planning modules"

requirements-completed: [INST-02, INST-04]

duration: 9min
completed: 2026-03-07
---

# Phase 10 Plan 02: Installer Core & Package Entry Summary

**Typed runtime selection, runtime-first prompts, and strict non-interactive validation now define how the installer collects user intent**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-07T15:50:39Z
- **Completed:** 2026-03-07T15:52:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added installer types that model supported runtimes, location choices, and normalized selection state.
- Implemented runtime-first interactive prompts with true custom subset selection across Claude Code, OpenCode, Gemini CLI, and Codex.
- Added clear non-interactive validation so no-TTY runs fail with actionable guidance when flags are incomplete.

## Task Commits

Each task was completed in the same implementation commit for this plan:

1. **Task 1: Create installer types and option normalization** - `6ff4df8` (feat)
2. **Task 2: Implement runtime-first interactive prompt flow** - `6ff4df8` (feat)

**Plan metadata:** pending docs closeout commit

## Files Created/Modified

- `src/install/types.ts` - Defines runtime identifiers, location types, normalized options, and selection data structures.
- `src/install/options.ts` - Normalizes flag input, resolves `--all`, and rejects under-specified non-interactive runs.
- `src/install/prompts.ts` - Implements runtime-first prompts and per-runtime location questions.
- `src/cli/commands/install.ts` - Connects normalized flag handling and interactive prompt collection to the install command.
- `src/index.ts` - Imports installer option types from the new installer type layer.

## Decisions Made

- Treated fully flagged installs as non-interactive even when a TTY is available, so automation and manual terminal usage behave the same.
- Collected location per runtime in the interactive flow to match the Phase 10 context, while still allowing `--global` or `--local` to apply across all selected runtimes in non-interactive mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-ran smoke checks after a parallel build raced stale `dist/` output**
- **Found during:** Verification
- **Issue:** `node dist/index.js` checks initially ran before the concurrent `tsc` build completed, so the smoke output reflected the previous build.
- **Fix:** Re-ran the smoke commands after the build finished.
- **Files modified:** None
- **Verification:** `node dist/index.js`, `node dist/index.js --all --global`, and `node dist/index.js install --help`
- **Committed in:** not applicable (verification-only correction)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Verification sequencing changed, but the implemented selection flow and validation behavior were unaffected.

## Issues Encountered

- Parallel verification has to wait for TypeScript output before relying on `dist/` smoke checks.

## User Setup Required

None - this plan only collects installer intent.

## Next Phase Readiness

- Phase 10 now has a deterministic selection model for both prompt and flag-driven installs.
- No blockers remain for Plan 10-03.

## Self-Check: PASSED
