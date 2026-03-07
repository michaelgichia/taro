# Roadmap: Taro

## Milestones

- ✅ **v1.0 Taro v1.0** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.0-ROADMAP.md), [requirements archive](./milestones/v1.0-REQUIREMENTS.md), and [audit](./milestones/v1.0-MILESTONE-AUDIT.md).
- 🚧 **v1.1 Documentation & Deployment** — Phases 8-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 Taro v1.0 (Phases 1-7) - SHIPPED 2026-03-07</summary>

See [v1.0 roadmap archive](./milestones/v1.0-ROADMAP.md) for full phase details.

</details>

### 🚧 v1.1 Documentation & Deployment (In Progress)

**Milestone Goal:** Make Taro publicly installable and well-documented so any developer can discover, install, and use it.

- [ ] **Phase 8: README Documentation** - Comprehensive public-facing README covering what Taro is, how to install it, and how to use it
- [ ] **Phase 9: Package & Publish** - Package fields, build verification, and npm publish so `npx @tayo/rtl generate` works out of the box

## Phase Details

### Phase 8: README Documentation
**Goal**: Any public developer can discover, understand, install, and use Taro from the README alone
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. Developer reads the README and understands what Taro is, who it is for, and the problem it solves — without reading source code
  2. Developer follows the Quick Start section and generates their first test in under 5 minutes from a clean install
  3. Developer can look up any `taro generate` CLI flag or option in the README without guessing
  4. Developer reads a worked example that shows an actual Chrome recording going in and a generated RTL test coming out
  5. Developer reads a guide for invoking Taro as a Claude Code skill or agent tool and can configure it without additional help
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Write Introduction, Quick Start, and CLI Reference sections (DOCS-01, DOCS-02, DOCS-03)
- [ ] 08-02-PLAN.md — Write Worked Example and Claude Code Skill guide (DOCS-04, DOCS-05)

### Phase 9: Package & Publish
**Goal**: The `@tayo/rtl` package is correctly prepared, builds cleanly, and installs from npm so any developer can run `npx @tayo/rtl generate ./recording.js`
**Depends on**: Phase 8
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria** (what must be TRUE):
  1. `package.json` contains `name`, `files`, `exports`, and `engines` fields that correctly describe the package for npm consumers
  2. Package version reads `1.0.0` in `package.json`
  3. Running `tsc` produces a `dist/` directory and `node dist/index.js --help` prints the CLI help without error
  4. After publishing, `npx @tayo/rtl generate ./recording.js` installs the package and runs the generate command correctly
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. v1.0 Phases | v1.0 | Complete | Complete | 2026-03-07 |
| 8. README Documentation | 1/2 | In Progress|  | - |
| 9. Package & Publish | v1.1 | 0/TBD | Not started | - |
