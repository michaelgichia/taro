---
phase: 11-runtime-targets-asset-delivery
plan: "03"
subsystem: codex-runtime
tags: [installer, codex, skills, assets]

requires:
  - phase: 11-runtime-targets-asset-delivery
    provides: runtime registry, asset root resolution, shared file operation types

provides:
  - packaged Codex skills under `assets/codex`
  - Codex-specific runtime operation builder
  - temp-directory coverage for global and local `.codex` installs

affects: [11-runtime-targets-asset-delivery, installer, codex]

key-files:
  created:
    - assets/codex/@tayo-dev/rtl-help/SKILL.md
    - assets/codex/@tayo-dev/rtl-generate/SKILL.md
    - assets/codex/@tayo-dev/rtl-conventions/SKILL.md
    - assets/codex/@tayo-dev/rtl-mocks/SKILL.md
    - src/install/runtimes/codex.ts
    - src/install/codex-runtime.test.ts

requirements-completed: [RUNT-04]

completed: 2026-03-07
---

# Phase 11 Plan 03: Codex Skill Delivery Summary

**Codex now ships a separate skill-first `@tayo-dev/rtl` surface with one namespaced skill directory per installed capability.**

## Accomplishments

- Added a broader Codex skill suite under `assets/codex/@tayo-dev/rtl-*`, including the required help entrypoint for `$@tayo-dev/rtl-help`.
- Built a Codex runtime builder that maps packaged skill files into global and local `.codex/skills/@tayo-dev/...` destinations.
- Added deterministic tests proving multiple namespaced skill directories land correctly in both global and local installs.

## Verification

- `npm run build`
- `npm run test:run -- src/install/codex-runtime.test.ts`
- `find assets/codex -name SKILL.md | wc -l`

## Task Commit

Implementation for this plan landed in `974602d` (`feat(11): deliver runtime assets and write execution`).

## Notes

- Codex was normalized onto the same file-operation contract as the prompt runtimes so Phase 11 can enforce one shared write path and one shared conflict policy.

## Self-Check: PASSED
