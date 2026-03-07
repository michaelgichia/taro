---
phase: 10-installer-core-package-entry
plan: "01"
subsystem: cli
tags: [commander, installer, cli, entrypoint]

requires:
  - phase: 09-package-publish
    provides: published `@tayo-dev/rtl` package entry and existing `generate` command

provides:
  - installer-first root CLI behavior
  - explicit `install` command with shared runtime/location flags
  - preserved `generate` command access during installer pivot

affects: [10-installer-core-package-entry, installer, package-entry]

tech-stack:
  added: []
  patterns:
    - "Installer-first root action delegates to a dedicated install command module"
    - "Root help keeps `generate` visible as an existing capability during the onboarding pivot"

key-files:
  created:
    - src/cli/commands/install.ts
  modified:
    - src/index.ts

key-decisions:
  - "The package root now enters installer-first behavior while preserving `taro generate` as an explicit subcommand"
  - "Installer flags are shared between the root command and `install` subcommand so later phases can extend one surface instead of two"

patterns-established:
  - "Top-level installer options are declared once in `applyInstallOptions()` and reused by both command entrypoints"

requirements-completed: [INST-01, DIST-01]

duration: 8min
completed: 2026-03-07
---

# Phase 10 Plan 01: Installer Core & Package Entry Summary

**Installer-first CLI wiring now fronts `@tayo-dev/rtl` while keeping the existing RTL generator reachable under `taro generate`**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-07T15:42:00Z
- **Completed:** 2026-03-07T15:50:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a dedicated `install` command module with the full Phase 10 runtime and location flag surface.
- Rewired the package root so normal invocation is installer-first instead of generator-first help.
- Preserved the existing `generate` command and kept it visible in top-level help output.

## Task Commits

Each task was completed in the same implementation commit for this plan:

1. **Task 1: Create installer command entrypoint** - `46ea63b` (feat)
2. **Task 2: Rewire the root CLI to be installer-first** - `46ea63b` (feat)

**Plan metadata:** pending docs closeout commit

## Files Created/Modified

- `src/cli/commands/install.ts` - Defines the installer command entrypoint and shared top-level install flags.
- `src/index.ts` - Makes the package root installer-first and keeps `generate` registered as a sibling command.

## Decisions Made

- Kept the CLI binary name as `taro` while shifting the package entry behavior to installer-first.
- Kept the explicit `install` subcommand even though the root now routes into the same installer flow, so later phases can reference a stable command surface.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - this plan only changed the CLI entry surface.

## Next Phase Readiness

- Phase 10 now has a stable installer entrypoint for prompt and planning logic.
- No blockers remain for Plan 10-02.

## Self-Check: PASSED
