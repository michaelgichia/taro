---
phase: 2
slug: sequential-regrade-loop-and-history-persistence
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
| --- | --- |
| **Framework** | vitest |
| **Config file** | `package.json` scripts plus Vitest defaults |
| **Quick run command** | `pnpm exec vitest run src/cli/commands/tests/regrade-runner.test.ts src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target-directory-tracker.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5-20 seconds for scoped checks |

---

## Sampling Rate

- **After every task commit:** Run the task’s scoped `pnpm exec vitest run ...` command
- **After every plan wave:** Run `pnpm exec vitest run src/cli/commands/tests/regrade-runner.test.ts src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target-directory-tracker.test.ts src/core/tests/state.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2-01-01 | 01 | 1 | RGST-02 | unit | `pnpm exec vitest run src/cli/commands/tests/regrade-runner.test.ts` | ✅ | ✅ green |
| 2-01-02 | 01 | 1 | RGST-01 | unit | `pnpm exec vitest run src/cli/commands/tests/regrade-runner.test.ts src/core/tests/state.test.ts` | ✅ | ✅ green |
| 2-01-03 | 01 | 1 | RGST-03 | unit | `pnpm exec vitest run src/cli/commands/tests/regrade-runner.test.ts src/core/tests/state.test.ts` | ✅ | ✅ green |
| 2-02-01 | 02 | 2 | RGTRK-04 | unit | `pnpm exec vitest run src/cli/commands/tests/target-directory-tracker.test.ts` | ✅ | ✅ green |
| 2-02-02 | 02 | 2 | RGEX-01 | integration | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 2-02-03 | 02 | 2 | RGTRK-04 | integration | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target-directory-tracker.test.ts` | ✅ | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All planned Phase 2 behaviors have automated coverage targets.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-31
