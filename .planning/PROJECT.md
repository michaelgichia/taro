# Taro

## What This Is

Taro is a local-first package that installs runtime-native `@tayo-dev/rtl` commands and Codex skills, then generates codebase-aware React Testing Library tests from recorder input. The shipped product is now installer-first: users start with `npx @tayo-dev/rtl@latest`, choose Claude Code, OpenCode, Gemini CLI, or Codex, and then use namespaced commands inside those runtimes while `taro generate` remains available for direct CLI use.

## Current State

- Latest shipped milestone: `v1.2 Runtime Installer Distribution` on 2026-03-07
- Active planning milestone: `v1.3 JS Baseline` on 2026-03-09
- Package surface: installer-first `@tayo-dev/rtl` with preserved direct `taro generate` support
- Supported runtime targets: Claude Code, OpenCode, Gemini CLI, and Codex
- Release proof: rerun/update safety, verified runtime help commands, and tarball validation are all shipped

## Core Value

Put high-quality RTL test generation inside Claude Code, OpenCode, Gemini CLI, and Codex with near-zero setup friction.

## Current Milestone: v1.3 JS Baseline

**Goal:** Make Testing Library Recorder JS exports a first-class baseline input that Taro can transform into structured, codebase-aware RTL tests instead of treating them as shallow executable transcripts.

**Target features:**
- Accept recorder extension JS files as a supported primary baseline input alongside Chrome Recorder JSON
- Recover user intent, assertion markers, and stable query candidates from JS baseline code without executing it as a finished test
- Generate structured RTL output with helpers, assertions, mocks, and grouped test cases closer to `sample/sample-add-sale-test.ts`

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

- [ ] First-class ingestion of Testing Library Recorder JS baseline files, with AST-level recovery of user actions, assertion markers, and selector metadata
- [ ] JS baseline transformation that produces structured, codebase-aware RTL suites with helpers, explicit assertions, and mock-aware organization instead of flat recorder transcripts
- [ ] Truthful CLI, help, and documentation coverage for dual input support so the advertised `.js` path matches shipped behavior and quality expectations

### Out of Scope

- [Direct execution of extension exports as finished tests] — recorder JS remains a baseline artifact that Taro must interpret and improve before writing a project test
- [Dropping Chrome Recorder JSON support] — JSON remains a supported path and must not regress while JS quality improves
- [Non-React frameworks or browser E2E generation] — Taro still targets React Testing Library workflows only
- [Hosted service or remote registry] — installation and generation remain filesystem-based and local-first
- [Broad `Taro` / `taro` brand rename] — keep the milestone focused on JS baseline quality, not product identity work

## Context

- **Current package shape:** `@tayo-dev/rtl` now ships both the installer-first entrypoint and the existing generator pipeline
- **Current input reality:** the CLI and README already advertise `.js` support, and the repo includes `src/core/js-parser.ts`, but the implementation still collapses most recorder JS structure into shallow step extraction
- **Milestone anchor examples:** `sample/sample-rest-recordingextension-output.js` is the baseline artifact to ingest; `sample/sample-add-sale-test.ts` is the quality bar for the transformed output
- **Runtime installer state:** Claude Code, OpenCode, Gemini CLI, and Codex all have packaged assets, manifest ownership, verification commands, and rerun protection
- **Current codebase:** TypeScript + Commander CLI with generator pipeline, input parsers under `src/core/`, recorder intelligence and mock analysis in `src/core/` and `src/analyzer/`, installer modules under `src/install/`, and packaged runtime assets under `assets/`
- **Verification baseline:** build, installer test suite, real built-CLI smoke run, and `npm pack` proof all passed on 2026-03-07
- **Codex note:** Codex remains skills-first via `skills/@tayo-dev/rtl-*/SKILL.md`

## Constraints

- **Package ownership**: `@tayo-dev/rtl` remains the installer package — no separate umbrella package in this milestone
- **Compatibility**: Support Claude Code, OpenCode, Gemini CLI, and Codex using their expected directory conventions while preserving direct `taro generate`
- **Local-first**: Installer writes files into runtime config locations only; no hosted backend or account system
- **Backward compatibility**: Preserve the existing JSON generation path and avoid breaking direct `taro generate` usage while improving JS baseline fidelity
- **Input model**: Testing Library Recorder JS must be treated as a baseline transcript, not as a finished component test that can be executed unchanged

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
| Treat Testing Library Recorder JS as a baseline, not a finished test | Extension exports capture flow order but not the mocks, structure, assertions, or selector hardening needed for maintainable RTL output | — Pending |

## Previous Planning Snapshot

<details>
<summary>v1.2 milestone framing before shipment</summary>

The active v1.2 planning goal was to make `@tayo-dev/rtl` behave like a GSD-style runtime installer that could bootstrap Taro into Claude Code, OpenCode, Gemini CLI, and Codex from one package. That plan is now fully shipped and archived in [v1.2 roadmap archive](./milestones/v1.2-ROADMAP.md) and [v1.2 requirements archive](./milestones/v1.2-REQUIREMENTS.md).

</details>

---
*Last updated: 2026-03-09 after v1.3 milestone kickoff*
