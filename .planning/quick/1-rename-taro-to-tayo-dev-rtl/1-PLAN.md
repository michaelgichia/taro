# Quick Task 1: rename tayo to @tayo-dev/rtl

**Date:** 2026-03-07
**Status:** Ready for execution

## Objective

Make the published package identity consistently use `@tayo-dev/rtl` across the repository while preserving the existing `tayo` CLI command and local `.tayo/` state directory.

## Tasks

### Task 1: Align package and lockfile metadata
- **Files:** `package.json`, `package-lock.json`
- **Action:** Confirm the package name is `@tayo-dev/rtl` and update lockfile metadata so the repo no longer advertises the old package identity.
- **Verify:** `rg -n "@tayo/rtl|\"name\": \"tayo\"" package.json package-lock.json`
- **Done when:** Package metadata consistently points to `@tayo-dev/rtl`.

### Task 2: Update public-facing documentation and planning references
- **Files:** `README.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`
- **Action:** Replace stale `@tayo/rtl` references and any packaging text that still points at the old scope, without renaming the product brand or internal `.tayo/` storage.
- **Verify:** `rg -n "@tayo/rtl" README.md .planning`
- **Done when:** User-facing docs and current planning docs reference `@tayo-dev/rtl`.

### Task 3: Verify the packaged CLI still builds
- **Files:** generated build output only
- **Action:** Run the TypeScript build and confirm the CLI help still works from `dist/index.js`.
- **Verify:** `npm run build` and `node dist/index.js --help`
- **Done when:** Build succeeds and the CLI help renders without errors.
