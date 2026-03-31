---
phase: 1
slug: regrade-directory-discovery-and-tracker-shape
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `package.json` scripts plus Vitest defaults |
| **Quick run command** | `pnpm test -- --run src/cli/commands/tests/target-directory-tracker.test.ts src/cli/commands/tests/regrade.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10-30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run src/cli/commands/tests/target-directory-tracker.test.ts src/cli/commands/tests/regrade.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | RGTRK-01 | unit | `pnpm test -- --run src/cli/commands/tests/target-directory-tracker.test.ts` | ✅ | ✅ green |
| 1-01-02 | 01 | 1 | RGTRK-02 | unit | `pnpm test -- --run src/cli/commands/tests/target-directory-tracker.test.ts` | ✅ | ✅ green |
| 1-01-03 | 01 | 1 | RGTRK-03 | unit | `pnpm test -- --run src/cli/commands/tests/target-directory-tracker.test.ts src/cli/commands/tests/target.test.ts` | ✅ | ✅ green |
| 1-02-01 | 02 | 2 | RGDIR-01 | unit | `pnpm test -- --run src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 1-02-02 | 02 | 2 | RGDIR-02 | unit | `pnpm test -- --run src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 1-02-03 | 02 | 2 | RGDIR-03 | unit | `pnpm test -- --run src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-31
