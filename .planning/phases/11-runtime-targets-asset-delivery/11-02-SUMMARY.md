---
phase: 11-runtime-targets-asset-delivery
plan: "02"
subsystem: prompt-runtimes
tags: [installer, claude, gemini, opencode, assets]

requires:
  - phase: 11-runtime-targets-asset-delivery
    provides: runtime registry, asset root resolution, manifest primitives

provides:
  - packaged Claude Code command assets under `assets/claude`
  - packaged Gemini CLI command assets under `assets/gemini`
  - packaged OpenCode command assets under `assets/opencode`
  - shared prompt-runtime operation builder and temp-directory install tests

affects: [11-runtime-targets-asset-delivery, installer, packaged-assets]

key-files:
  created:
    - assets/claude/commands/@tayo-dev/rtl/help.md
    - assets/claude/commands/@tayo-dev/rtl/generate.md
    - assets/gemini/commands/@tayo-dev/rtl/help.toml
    - assets/gemini/commands/@tayo-dev/rtl/generate.toml
    - assets/opencode/commands/@tayo-dev/rtl-help.md
    - assets/opencode/commands/@tayo-dev/rtl-generate.md
    - src/install/runtimes/prompt-runtimes.ts
    - src/install/runtimes/claude.ts
    - src/install/runtimes/gemini.ts
    - src/install/runtimes/opencode.ts
    - src/install/prompt-runtimes.test.ts
  modified:
    - src/install/assets.ts
    - src/install/types.ts

requirements-completed: [RUNT-01, RUNT-02, RUNT-03]

completed: 2026-03-07
---

# Phase 11 Plan 02: Prompt Runtime Asset Delivery Summary

**Claude Code, Gemini CLI, and OpenCode now ship real packaged `@tayo-dev/rtl` runtime assets with deterministic temp-directory install coverage.**

## Accomplishments

- Added minimal namespaced help and generate assets for Claude Code, Gemini CLI, and OpenCode under the published `assets/` tree.
- Built a shared prompt-runtime operation builder that maps packaged assets into runtime-native command locations.
- Added deterministic filesystem-local tests covering global and local destination layouts, including the locked `./.opencode` local path.

## Verification

- `npm run build`
- `npm run test:run -- src/install/prompt-runtimes.test.ts`
- `rg -n "@tayo-dev/rtl:help|@tayo-dev/rtl-help|\\.opencode|buildPromptRuntimeOperations" assets/claude assets/gemini assets/opencode src/install/runtimes`

## Task Commit

Implementation for this plan landed in `974602d` (`feat(11): deliver runtime assets and write execution`).

## Notes

- Asset root resolution now walks up to the package root so the same helpers work from both `src/` tests and the built `dist/` package.
- OpenCode stays prompt-first in this phase even though Codex remains skill-first.

## Self-Check: PASSED
