---
phase: 12
slug: verification-updates-release-docs
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
updated: 2026-03-07T18:15:13Z
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + temp-directory filesystem and package smoke checks |
| **Config file** | none |
| **Quick run command** | `npm run build && npm run test:run -- src/install/write-execution.test.ts src/cli/commands/install.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/install/*.test.ts src/cli/commands/*.test.ts` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific installer/doc verification command
- **After every plan wave:** Run `npm run build && npm run test:run -- src/install/*.test.ts src/cli/commands/*.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | DIST-02 | integration | `npm run build && npm run test:run -- src/install/write-execution.test.ts src/cli/commands/install.test.ts` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 2 | DIST-03 | integration/package | `npm run build && npm run test:run -- src/install/verification.test.ts src/cli/commands/install.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 3 | DIST-04 | docs/package | `npm run build && npm pack --dry-run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/install/verification.test.ts` — runtime verification helper coverage for DIST-03
- [ ] package smoke command using `npm pack` — tarball proof for DIST-03 and DIST-04
- [ ] README install sections updated and aligned with actual CLI output — docs proof for DIST-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README reads coherently as installer-first onboarding | DIST-04 | Flow quality and terminology consistency are easiest to catch by inspection | Read Getting Started, Staying Updated, non-interactive install, and development install sections after Phase 12 changes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
