# Taro

## What This Is

Taro is a local-first package for bringing codebase-aware React Testing Library generation into the AI runtimes developers already use. It currently ships the recorder-to-RTL generation pipeline, and the next milestone shifts the primary user experience toward an installer that sets up runtime-specific commands, prompts, and skills from `@tayo-dev/rtl`.

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

### Active

- [ ] Interactive installer flow from `npx @tayo-dev/rtl@latest`
- [ ] Runtime-specific installation targets for Claude Code, OpenCode, Gemini CLI, and Codex
- [ ] Non-interactive global/local installation, verification commands, and update flow

### Out of Scope

- [Non-React frameworks] — Taro still targets React Testing Library workflows only
- [Hosted service or remote registry] — installation remains filesystem-based and local-first
- [Broad `Taro` / `taro` brand rename] — this milestone is installer-first, not a full identity migration
- [New generator intelligence unrelated to runtime distribution] — keep the milestone focused on delivery and setup

## Current Milestone: v1.2 Runtime Installer Distribution

**Goal:** Make `@tayo-dev/rtl` behave like a GSD-style runtime installer so users can bootstrap Taro into Claude Code, OpenCode, Gemini CLI, or Codex from one package.

**Target features:**
- Interactive installer entrypoint with runtime and location prompts
- Non-interactive flags for runtime selection (`--claude`, `--opencode`, `--gemini`, `--codex`, `--all`) and installation location (`--global`, `--local`)
- Runtime-specific asset installation and verification commands, including Codex skills under `skills/@tayo-dev/rtl-*/SKILL.md`

## Context

- **Current package shape:** `@tayo-dev/rtl` publishes a single `taro` CLI geared toward `generate`
- **Target UX:** mirror the GSD installer pattern where users run a guided setup flow, choose runtime(s), choose global vs local install, and verify with runtime-native help commands
- **Current codebase:** TypeScript + Commander CLI with existing generator pipeline, README docs, and local `.taro/` state
- **Runtime targets:** Claude Code, OpenCode, Gemini CLI, and Codex each need their own install paths and asset conventions
- **Codex note:** Codex should install skills (`skills/@tayo-dev/rtl-*/SKILL.md`) instead of custom prompts

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
| Use `@tayo-dev/rtl` as the installer package owner | Avoid splitting the product between an umbrella installer and a payload package too early | — Pending |
| Focus v1.2 on installer behavior first | The biggest gap is runtime setup and adoption, not more generator intelligence | — Pending |
| Treat Codex as skills-first | Codex installation differs from prompt-based runtimes and needs explicit support | — Pending |

---
*Last updated: 2026-03-07 after v1.2 milestone start*
