---
phase: 5
slug: recording-intelligence-recovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | none (vitest reads from package.json scripts) |
| **Quick run command** | `npm run test:run -- src/core/recording-intelligence.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/recording-intelligence.test.ts src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run -- src/core/recording-intelligence.test.ts`
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/recording-intelligence.test.ts src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-??-01 | TBD | 1 | REC-01 | unit | `npm run test:run -- src/core/recording-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 05-??-02 | TBD | 1 | REC-02 | unit | `npm run test:run -- src/core/recording-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 05-??-03 | TBD | 1 | REC-03 | unit | `npm run test:run -- src/core/recording-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 05-??-04 | TBD | 1 | REC-04 | unit | `npm run test:run -- src/core/recording-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 05-??-05 | TBD | 2 | REC-01–REC-04 | integration | `npm run build && npm run test:run -- src/core/recording-intelligence.test.ts src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs will be finalized once the phase plans are generated.*

---

## Wave 0 Requirements

- [ ] `src/core/recording-intelligence.test.ts` — unit expectations for redundant click filtering, dblClick handling, cursor wandering cleanup, and intent grouping

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI generation removes noisy recorder actions without breaking output | REC-01, REC-02, REC-03 | Requires end-to-end inspection of generated test file | Run `tayo generate <noisy-recording.json>` and confirm duplicate clicks and cursor-noise steps are absent from the emitted test |
| Intent reduction preserves the meaningful user flow | REC-04 | Requires reviewing generated flow semantics | Generate from a fixture with open/fill/submit/assert sequence and confirm the surviving steps still represent the intended user journey |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
