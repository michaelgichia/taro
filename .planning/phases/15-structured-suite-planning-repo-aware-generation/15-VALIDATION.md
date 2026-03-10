---
phase: 15
slug: structured-suite-planning-repo-aware-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none |
| **Quick run command** | `npm run build && npm run test:run -- src/core/suite-planner.test.ts src/core/boundary-intelligence.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/suite-planner.test.ts src/core/boundary-intelligence.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run test:run -- src/core/suite-planner.test.ts src/core/boundary-intelligence.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts`
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/suite-planner.test.ts src/core/boundary-intelligence.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SUITE-01 | unit | `npm run build && npm run test:run -- src/core/suite-planner.test.ts` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | SUITE-02 | unit | `npm run build && npm run test:run -- src/core/suite-planner.test.ts` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 2 | SUITE-03 | integration | `npm run build && npm run test:run -- src/core/generator.test.ts src/cli/commands/generate.test.ts` | ✅ | ⬜ pending |
| 15-02-02 | 02 | 2 | SUITE-04 | integration | `npm run build && npm run test:run -- src/core/generator.test.ts src/cli/commands/generate.test.ts src/core/boundary-intelligence.test.ts` | ✅ | ⬜ pending |
| 15-03-01 | 03 | 3 | SUITE-01 | regression | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/boundary-intelligence.test.ts` | ✅ | ⬜ pending |
| 15-03-02 | 03 | 3 | SUITE-03 | regression | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/generator.test.ts` | ✅ | ⬜ pending |
| 15-03-03 | 03 | 3 | SUITE-04 | regression | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/boundary-intelligence.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors should have automated verification through planner, generator, boundary, and CLI regression tests.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
