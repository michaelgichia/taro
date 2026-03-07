---
phase: 12-verification-updates-release-docs
plan: "02"
subsystem: verification
tags: [installer, verification, package, tarball]

requires:
  - phase: 12-verification-updates-release-docs
    provides: stable rerun/update semantics

provides:
  - runtime verification helper for installed assets
  - CLI output grounded in verified runtime paths
  - package smoke proof for the npm tarball boundary

affects: [12-verification-updates-release-docs, installer, packaging]

key-files:
  created:
    - src/install/verification.ts
    - src/install/verification.test.ts
  modified:
    - src/install/executor.ts
    - src/install/summary.ts
    - src/cli/commands/install.test.ts
    - package.json

requirements-completed: [DIST-03]

completed: 2026-03-07
---

# Phase 12 Plan 02: Verification & Tarball Summary

**Runtime verification commands are now backed by explicit filesystem verification, and the release proof includes an npm tarball smoke check.**

## Accomplishments

- Added `verifyInstalledRuntime` to confirm the documented verification command maps to a real installed asset or skill.
- Integrated verification results into install completion output so runtime commands are printed with verified paths.
- Added package smoke coverage that runs `npm pack`, inspects the tarball, and asserts it includes `dist`, `assets`, and README content needed by the installer flow.
- Added `pack:check` to `package.json` for repeatable release verification.

## Verification

- `npm run build`
- `npm run test:run -- src/install/verification.test.ts src/cli/commands/install.test.ts`
- `env NPM_CONFIG_CACHE=/tmp/taro-npm-cache npm pack --pack-destination "$(mktemp -d /tmp/taro-pack.XXXXXX)"`

## Task Commit

Implementation for this plan landed in `6a62f12` (`feat(12): verify installer updates and release flow`).

## Self-Check: PASSED
