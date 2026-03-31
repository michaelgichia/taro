---
phase: 4
slug: runtime-guidance-and-regression-coverage
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `package.json` scripts plus Vitest defaults |
| **Quick run command** | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` |
| **Full phase command** | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` |
| **Estimated runtime** | ~5-20 seconds for scoped checks |

---

## Sampling Rate

- **After every task commit:** Run the task’s scoped `pnpm exec vitest run ...` command
- **After every plan wave:** Run `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/cli/commands/tests/regrade.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | RGUX-01 | review | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | RGUX-01 | review | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | RGUX-01 | docs | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 2 | RGUX-01 | integration | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 2 | RGUX-01 | integration | `pnpm exec vitest run src/install/tests/verification.test.ts src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts` | ✅ | ⬜ pending |
| 4-02-03 | 02 | 2 | RGUX-01 | smoke | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

- Review `README.md` and `docs/USER-GUIDE.md` for wording parity after the automated checks pass.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
