---
phase: 12-verification-updates-release-docs
plan: "03"
subsystem: release-docs
tags: [readme, onboarding, installer, docs]

requires:
  - phase: 12-verification-updates-release-docs
    provides: verified runtime commands and tarball proof

provides:
  - installer-first README onboarding
  - non-interactive install and update docs
  - development-install documentation aligned with the package boundary

affects: [12-verification-updates-release-docs, docs]

key-files:
  modified:
    - README.md

requirements-completed: [DIST-04]

completed: 2026-03-07
---

# Phase 12 Plan 03: Release Docs Summary

**The README is now installer-first and documents only the install, verification, update, and development flows proven by the package and test suite.**

## Accomplishments

- Rewrote the top of the README around `npx @tayo-dev/rtl@latest` and the runtime/location installer flow.
- Added runtime-specific verification commands, non-interactive install examples, update guidance, and development-install steps.
- Removed outdated manual Claude-only setup guidance that predated the installer-first package surface.
- Kept the `tayo generate` documentation, but moved it after onboarding so the README matches the real entrypoint of the package.

## Verification

- `rg -n "Getting Started|Staying Updated|Non-interactive Install|Development Installation|@tayo-dev/rtl@latest" README.md`
- `env NPM_CONFIG_CACHE=/tmp/tayo-npm-cache npm pack --dry-run`
- Manual README sanity pass against Phase 12 verification output

## Task Commit

Implementation for this plan landed in `6a62f12` (`feat(12): verify installer updates and release flow`).

## Self-Check: PASSED
