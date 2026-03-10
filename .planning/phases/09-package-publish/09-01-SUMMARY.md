---
phase: 09-package-publish
plan: "01"
subsystem: infra
tags: [npm, package, publish, versioning]

requires:
  - phase: 08-readme-documentation
    provides: README.md documentation that is whitelisted in the npm files array

provides:
  - npm package manifest with correct scoped name @tayo/rtl
  - version 1.0.0 set in both package.json and CLI entry point
  - files whitelist restricting npm tarball to dist/, README.md, LICENSE
  - exports map directing consumers to ./dist/index.js
  - engines constraint requiring Node >=18

affects: [09-package-publish]

tech-stack:
  added: []
  patterns:
    - "npm scoped package naming: @tayo/rtl"
    - "Exports field for modern package consumers alongside bin field"

key-files:
  created: []
  modified:
    - package.json
    - src/index.ts

key-decisions:
  - "Package name is @tayo/rtl (scoped under @tayo organisation)"
  - "files whitelist includes dist/, README.md, LICENSE — excludes src/, tests/, .planning/"
  - "exports field added alongside bin so both CLI and programmatic consumers work"
  - "engines.node set to >=18 matching ESM and modern API requirements throughout the codebase"

patterns-established:
  - "Version parity: package.json version and hardcoded .version() string in src/index.ts must match"

requirements-completed: [PKG-01, PKG-02]

duration: 4min
completed: 2026-03-07
---

# Phase 9 Plan 01: Package & Publish — Manifest Update Summary

**package.json renamed to @tayo/rtl at 1.0.0 with files whitelist, exports map, and node>=18 engine constraint; CLI version string in src/index.ts bumped to match**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-07T13:10:00Z
- **Completed:** 2026-03-07T13:14:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Renamed npm package from `tayo` to `@tayo/rtl` and bumped version to `1.0.0`
- Added `files` whitelist so the published tarball includes only `dist/`, `README.md`, and `LICENSE`
- Added `exports` field mapping the package root (`.`) to `./dist/index.js` for modern consumers
- Added `engines` field requiring `node >=18` to match ESM and API usage throughout the codebase
- Kept `bin.tayo` pointing to `./dist/index.js` so the CLI still works after install
- Updated the hardcoded `.version('0.1.0', ...)` call in `src/index.ts` to `1.0.0` so `tayo --version` outputs the correct value

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Update package.json fields and bump version to 1.0.0** - `b3fab5c` (feat)

## Files Created/Modified

- `package.json` - Renamed to @tayo/rtl, bumped to 1.0.0, added files/exports/engines fields
- `src/index.ts` - Updated .version() call from 0.1.0 to 1.0.0

## Decisions Made

- Version parity enforced: the hardcoded version string in `src/index.ts` must always match `package.json` so `tayo --version` stays accurate without a build-time injection step.
- `files` whitelist chosen over `.npmignore` — allowlist approach is safer and easier to audit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- package.json is ready for `npm publish` or `npm pack` verification
- Phase 09-02 (publish verification / dry-run) can proceed immediately
- No blockers

---
*Phase: 09-package-publish*
*Completed: 2026-03-07*
