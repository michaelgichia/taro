# Taro

## What This Is

Taro is a local-first package that installs runtime-native `@tayo-dev/rtl` commands and Codex skills, then generates codebase-aware React Testing Library tests from recorder input. The shipped product is now installer-first: users start with `npx @tayo-dev/rtl@latest`, choose Claude Code, OpenCode, Gemini CLI, or Codex, and then use namespaced commands inside those runtimes while `taro generate` remains available for direct CLI use.

## Current State

- Latest shipped milestone: `v1.2 Runtime Installer Distribution` on 2026-03-07
- Package surface: installer-first `@tayo-dev/rtl` with preserved direct `taro generate` support
- Supported runtime targets: Claude Code, OpenCode, Gemini CLI, and Codex
- Release proof: rerun/update safety, verified runtime help commands, and tarball validation are all shipped

## Core Value

Put high-quality RTL test generation inside Claude Code, OpenCode, Gemini CLI, and Codex with near-zero setup friction.

## Requirements

### Validated

- ✓ Core pipeline from recorder input to generated test file output — v1.0
- ✓ Codebase-aware query and test-design intelligence — v1.0
- ✓ Self-scoring, post-write verification, and convention learning — v1.0
- ✓ Recording, visual, and mock intelligence recovery — v1.0
- ✓ Public README onboarding for installation, CLI usage, and worked examples — v1.1
- ✓ npm publication and package verification for `@tayo-dev/rtl` — v1.1
- ✓ Installer-first `npx @tayo-dev/rtl@latest` flow with runtime and location selection — v1.2
- ✓ Runtime-native asset delivery for Claude Code, OpenCode, Gemini CLI, and Codex — v1.2
- ✓ Safe reruns, repair behavior, verified runtime commands, and installer-first release docs — v1.2

### Active

- [ ] Runtime-specific uninstall flow so users can remove installer-owned assets cleanly
- [ ] Diagnostics / doctor flow for broken or partially edited runtime setups
- [ ] Unified post-install command vocabulary that does not depend on the historical `taro` CLI name

### Out of Scope

- [Non-React frameworks] — Taro still targets React Testing Library workflows only
- [Hosted service or remote registry] — installation remains filesystem-based and local-first
- [Broad `Taro` / `taro` brand rename] — installer adoption shipped first; full identity migration still needs its own milestone
- [New generator intelligence unrelated to runtime distribution] — keep the milestone focused on delivery and setup

## Next Milestone Goals

- Add uninstall and repair tooling so installer ownership can be reversed as cleanly as it is applied.
- Add runtime diagnostics that explain missing assets, manual-edit conflicts, and recovery options.
- Decide whether the public command vocabulary should fully migrate away from the historical `taro` naming.

## Context

- **Current package shape:** `@tayo-dev/rtl` now ships both the installer-first entrypoint and the existing generator pipeline
- **Runtime installer state:** Claude Code, OpenCode, Gemini CLI, and Codex all have packaged assets, manifest ownership, verification commands, and rerun protection
- **Current codebase:** TypeScript + Commander CLI with generator pipeline, installer modules under `src/install/`, packaged runtime assets under `assets/`, and release-proofed README onboarding
- **Verification baseline:** build, installer test suite, real built-CLI smoke run, and `npm pack` proof all passed on 2026-03-07
- **Codex note:** Codex remains skills-first via `skills/@tayo-dev/rtl-*/SKILL.md`

## Constraints

- **Package ownership**: `@tayo-dev/rtl` remains the installer package — no separate umbrella package in this milestone
- **Compatibility**: Support Claude Code, OpenCode, Gemini CLI, and Codex using their expected directory conventions
- **Local-first**: Installer writes files into runtime config locations only; no hosted backend or account system
- **Backward compatibility**: Preserve the existing generator payload and avoid breaking direct `taro generate` usage unless intentionally migrated later

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep generator logic local-first | Existing pipeline already proves value without any service dependency | ✓ Good |
| Publish under `@tayo-dev/rtl` | Package scope aligns public distribution with Tayo branding | ✓ Good |
| Use `@tayo-dev/rtl` as the installer package owner | Avoid splitting the product between an umbrella installer and a payload package too early | ✓ Good |
| Focus v1.2 on installer behavior first | The biggest gap is runtime setup and adoption, not more generator intelligence | ✓ Good |
| Treat Codex as skills-first | Codex installation differs from prompt-based runtimes and needs explicit support | ✓ Good |
| Preserve `taro generate` during the installer pivot | Existing generation flows should keep working while onboarding changes | ✓ Good |
| Protect manual edits on rerun | Installer updates must not silently overwrite user-customized runtime assets | ✓ Good |

## Previous Planning Snapshot

<details>
<summary>v1.2 milestone framing before shipment</summary>

The active v1.2 planning goal was to make `@tayo-dev/rtl` behave like a GSD-style runtime installer that could bootstrap Taro into Claude Code, OpenCode, Gemini CLI, and Codex from one package. That plan is now fully shipped and archived in [v1.2 roadmap archive](./milestones/v1.2-ROADMAP.md) and [v1.2 requirements archive](./milestones/v1.2-REQUIREMENTS.md).

</details>

---
*Last updated: 2026-03-07 after v1.2 milestone completion*
