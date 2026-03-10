---
phase: 6
slug: visual-mock-intelligence-recovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | none (vitest reads from package.json scripts) |
| **Quick run command** | `npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts`
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-??-01 | TBD | 1 | VIS-01 | unit | `npm run test:run -- src/core/resolver.test.ts` | ✅ | ⬜ pending |
| 06-??-02 | TBD | 2 | VIS-02 | unit | `npm run test:run -- src/core/resolver.test.ts` | ✅ | ⬜ pending |
| 06-??-03 | TBD | 3 | MOCK-01 | unit | `npm run test:run -- src/core/mock-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 06-??-04 | TBD | 3 | MOCK-02 | unit | `npm run test:run -- src/core/mock-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 06-??-05 | TBD | 4 | MOCK-03 | unit | `npm run test:run -- src/core/mock-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 06-??-06 | TBD | 4 | MOCK-04 | unit | `npm run test:run -- src/core/mock-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 06-??-07 | TBD | 4 | VIS-01–MOCK-04 | integration | `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs will be finalized once the phase plans are created.*

---

## Wave 0 Requirements

- [ ] `src/core/mock-intelligence.test.ts` — stubs for repeated target detection, inline/extract decisions, mutation lifecycle detection, and stability warnings
- [ ] `src/core/resolver.test.ts` — extended coverage for screenshot/state capture and dialog-aware visual snapshots

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screenshot/state capture is triggered for dialog-heavy or ambiguous UI states | VIS-01, VIS-02 | Requires inspecting saved output and browser-derived state summary | Run `tayo generate` on a dialog-heavy recording and confirm the CLI reports a visual-state capture with dialog-aware grouping |
| Mock-aware generation emits stable recommendations without breaking output | MOCK-01, MOCK-02, MOCK-03, MOCK-04 | Requires end-to-end inspection of generated output and logged advice | Run generation against a fixture/project with repeated mocks and mutation patterns, then confirm mock recommendations and post-write verification both appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
