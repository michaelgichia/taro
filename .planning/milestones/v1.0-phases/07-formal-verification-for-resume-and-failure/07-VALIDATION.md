---
phase: 7
slug: formal-verification-for-resume-and-failure
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 7 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `package.json` scripts plus Vitest defaults |
| **Quick run command** | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target.test.ts` |
| **Full suite command** | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target.test.ts` |
| **Estimated runtime** | ~10 seconds |

## Sampling Rate

- **After every task commit:** Run the quick command
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | RGEX-03 | verification | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts` | ✅ | ✅ green |
| 7-01-02 | 01 | 1 | RGEX-02 | verification | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target.test.ts` | ✅ | ✅ green |
| 7-01-03 | 01 | 1 | RGEX-02 | docs | `pnpm exec vitest run src/cli/commands/tests/regrade.test.ts src/cli/commands/tests/target.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All Phase 7 behaviors are automated document and evidence backfill.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-31
