---
phase: 8
slug: formal-verification-for-runtime-guidance-and-reaudit
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 8 — Validation Strategy

## Test Infrastructure

| Property | Value |
| --- | --- |
| **Framework** | vitest |
| **Config file** | `package.json` scripts plus Vitest defaults |
| **Quick run command** | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` |
| **Full suite command** | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` |
| **Estimated runtime** | ~15 seconds |

## Sampling Rate

- **After every task commit:** Run the quick command
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8-01-01 | 01 | 1 | RGUX-01 | verification | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 8-01-02 | 01 | 1 | RGUX-01 | audit | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 8-01-03 | 01 | 1 | RGUX-01 | milestone | `pnpm exec vitest run src/install/tests/codex-runtime.test.ts src/install/tests/prompt-runtimes.test.ts src/install/tests/verification.test.ts src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All Phase 8 behaviors are automated document, audit, and archive preparation work.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-31
