---
phase: 14
slug: truthful-selector-recovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none |
| **Quick run command** | `npm run build && npm run test:run -- src/core/resolver.test.ts src/cli/commands/generate.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/resolver.test.ts src/cli/commands/generate.test.ts` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run test:run -- src/core/resolver.test.ts src/cli/commands/generate.test.ts`
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/resolver.test.ts src/cli/commands/generate.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | QUERY-02 | unit | `npm run build && npm run test:run -- src/core/resolver.test.ts` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | QUERY-03 | unit | `npm run build && npm run test:run -- src/core/resolver.test.ts` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 2 | QUERY-02 | integration | `npm run build && npm run test:run -- src/core/generator.test.ts` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | QUERY-03 | integration | `npm run build && npm run test:run -- src/core/generator.test.ts` | ✅ | ⬜ pending |
| 14-03-01 | 03 | 3 | QUERY-02 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/resolver.test.ts` | ✅ | ⬜ pending |
| 14-03-02 | 03 | 3 | QUERY-03 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts` | ✅ | ⬜ pending |
| 14-03-03 | 03 | 3 | QUERY-04 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/resolver.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser launch policy under constrained hosts | QUERY-04 | CI/unit mocks will not prove every host policy failure mode | Run `node dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run` in an environment without Playwright browser access and confirm explicit warnings/checkpoints instead of fake fallback queries. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
