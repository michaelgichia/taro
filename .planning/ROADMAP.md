# Roadmap: Taro

## Milestones

- ✅ **v1.0 Taro v1.0** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.0-ROADMAP.md), [requirements archive](./milestones/v1.0-REQUIREMENTS.md), and [audit](./milestones/v1.0-MILESTONE-AUDIT.md).
- ✅ **v1.1 Documentation & Deployment** — shipped 2026-03-07
- ◐ **v1.2 Runtime Installer Distribution** — execution started 2026-03-07

## Phases

<details>
<summary>✅ v1.0 Taro v1.0 (Phases 1-7) - SHIPPED 2026-03-07</summary>

See [v1.0 roadmap archive](./milestones/v1.0-ROADMAP.md) for full phase details.

</details>

### ✅ v1.1 Documentation & Deployment (Completed 2026-03-07)

**Milestone Goal:** Make Taro publicly installable and well-documented so any developer can discover, install, and use it.

- [x] **Phase 8: README Documentation** - Comprehensive public-facing README covering what Taro is, how to install it, and how to use it (completed 2026-03-07)
- [x] **Phase 9: Package & Publish** - Package fields, build verification, and npm publish so `npx @tayo-dev/rtl generate` works out of the box (completed 2026-03-07)

### ◐ v1.2 Runtime Installer Distribution (In Progress)

**Milestone Goal:** Make `@tayo-dev/rtl` install like a runtime-native agent package so users can bootstrap Taro into Claude Code, OpenCode, Gemini CLI, or Codex from one command.

- [x] **Phase 10: Installer Core & Package Entry** - Create the installer entrypoint, interactive/non-interactive selection flow, and installation plan model (completed 2026-03-07)
- [ ] **Phase 11: Runtime Targets & Asset Delivery** - Install runtime-specific prompts/commands/skills for Claude Code, OpenCode, Gemini CLI, and Codex
- [ ] **Phase 12: Verification, Updates & Release Docs** - Make reruns/update flows safe, verify installed assets, and document the release-ready onboarding path

## Phase Details

### Phase 10: Installer Core & Package Entry
**Goal**: Users can invoke `@tayo-dev/rtl` as an installer, choose runtimes and install location, and get a deterministic install plan without yet depending on runtime-specific payload implementation details
**Depends on**: Phase 9
**Requirements**: INST-01, INST-02, INST-03, INST-04, DIST-01
**Success Criteria** (what must be TRUE):
  1. Running `npx @tayo-dev/rtl@latest` enters an interactive installer flow instead of dropping the user into generator-only help
  2. The installer can accept `--claude`, `--opencode`, `--gemini`, `--codex`, `--all`, `--global`, and `--local` combinations without prompting
  3. Global vs local destination resolution is modeled explicitly and can be previewed or summarized before writes occur
  4. `@tayo-dev/rtl` remains the only documented installer package; no secondary umbrella package is required
**Plans**:
- [x] 10-01 - Installer-first root CLI and explicit `install` command
- [x] 10-02 - Runtime-first interactive flow and non-interactive flag normalization
- [x] 10-03 - Install-plan model, prewrite summary, and confirmation flow

### Phase 11: Runtime Targets & Asset Delivery
**Goal**: Each supported runtime receives the correct packaged assets and a working runtime-native help entrypoint
**Depends on**: Phase 10
**Requirements**: RUNT-01, RUNT-02, RUNT-03, RUNT-04, RUNT-05
**Success Criteria** (what must be TRUE):
  1. Claude Code installations expose `/@tayo-dev/rtl:help`
  2. Gemini CLI installations expose `/@tayo-dev/rtl:help`
  3. OpenCode installations expose `/@tayo-dev/rtl-help`
  4. Codex installations create `skills/@tayo-dev/rtl-*/SKILL.md` assets and expose `$@tayo-dev/rtl-help`
  5. `--all` installs all supported runtimes in one run and reports what was written
**Plans**:
- [ ] 11-01 - Runtime registry, manifest, and package asset foundation
- [ ] 11-02 - Prompt-runtime assets and temp-directory delivery tests
- [ ] 11-03 - Codex skill suite and temp-directory delivery tests
- [ ] 11-04 - Real write execution, conflict handling, and all-runtime reporting

### Phase 12: Verification, Updates & Release Docs
**Goal**: Installer reruns are safe, verification commands are trustworthy, and the README documents the real shipped onboarding flow
**Depends on**: Phase 11
**Requirements**: DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Re-running the installer updates or repairs owned assets without requiring manual cleanup
  2. Install completion output includes verification commands for every selected runtime
  3. The README covers interactive install, non-interactive install, staying updated, and development installation using the real published/package-local commands
  4. Release verification proves the shipped tarball contains runtime assets and that the documented verification commands work
**Plans**: Not yet created

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. v1.0 Phases | v1.0 | Complete | Complete | 2026-03-07 |
| 8. README Documentation | v1.1 | 2/2 | Complete | 2026-03-07 |
| 9. Package & Publish | v1.1 | 2/2 | Complete | 2026-03-07 |
| 10. Installer Core & Package Entry | v1.2 | 3/3 | Complete | 2026-03-07 |
| 11. Runtime Targets & Asset Delivery | v1.2 | 0/4 | Planned | — |
| 12. Verification, Updates & Release Docs | v1.2 | 0/0 | Not Started | — |
