---
phase: 11
slug: runtime-targets-asset-delivery
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
updated: 2026-03-07T16:12:00Z
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 + temp-directory filesystem integration checks |
| **Config file** | none (vitest via package scripts; targeted files invoked directly) |
| **Quick run command** | `npm run build && npm run test:run -- src/install/*.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/install/*.test.ts src/cli/commands/*.test.ts` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific installer test command or `npm run build` if the task only changes packaged assets/docs
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green and CLI smoke checks must pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | RUNT-01..RUNT-05 | unit/build | `npm run build && npm run test:run -- src/install/registry.test.ts src/install/manifest.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | RUNT-01..RUNT-03 | integration | `npm run build && npm run test:run -- src/install/prompt-runtimes.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 2 | RUNT-04 | integration | `npm run build && npm run test:run -- src/install/codex-runtime.test.ts` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 3 | RUNT-05 | integration/cli | `npm run build && npm run test:run -- src/install/write-execution.test.ts src/cli/commands/install.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/install/registry.test.ts` — covers runtime registry and destination layout assumptions
- [ ] `src/install/manifest.test.ts` — covers ownership marker and conflict classification
- [ ] `src/install/prompt-runtimes.test.ts` — covers Claude/Gemini/OpenCode temp-directory installs
- [ ] `src/install/codex-runtime.test.ts` — covers one-folder-per-skill Codex output
- [ ] `src/install/write-execution.test.ts` — covers multi-runtime `--all` execution and result reporting
- [ ] `src/cli/commands/install.test.ts` — covers CLI-level installer smoke behavior if command tests are added in-repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Installed runtime asset contents read coherently as a product family | RUNT-01..RUNT-04 | Content quality and naming consistency are easier to spot with a quick human pass | Inspect packaged asset files and one temp-directory install per runtime after Phase 11 execution |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
