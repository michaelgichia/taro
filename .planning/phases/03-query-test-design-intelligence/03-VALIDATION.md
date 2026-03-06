---
phase: 3
slug: query-test-design-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 |
| **Config file** | none (vitest reads from package.json "test" script) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-??-01 | TBD | 0 | QRY-01 | unit | `npm run test:run -- src/core/js-parser.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-02 | TBD | 0 | TEST-01 | unit | `npm run test:run -- src/core/js-parser.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-03 | TBD | 0 | QRY-02 | unit (mock Playwright) | `npm run test:run -- src/core/resolver.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-04 | TBD | 0 | QRY-03 | unit | `npm run test:run -- src/core/resolver.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-05 | TBD | 0 | TEST-03 | unit | `npm run test:run -- src/core/resolver.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-06 | TBD | 0 | CTX-01–04 | unit | `npm run test:run -- src/core/scanner.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-07 | TBD | 0 | CTX-05 | integration | `npm run test:run -- src/core/scanner.test.ts` | ❌ W0 | ⬜ pending |
| 03-??-08 | TBD | 0 | TEST-02 | unit | `npm run test:run -- src/core/scanner.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs will be filled in by planner once plans are created.*

---

## Wave 0 Requirements

- [ ] `src/core/js-parser.test.ts` — stubs for QRY-01, TEST-01 (parse JS file, classify calls, segment groups)
- [ ] `src/core/resolver.test.ts` — stubs for QRY-02, QRY-03, TEST-03 (Playwright inspection mocked with vi.mock)
- [ ] `src/core/scanner.test.ts` — stubs for CTX-01–CTX-05, TEST-02 (file scanning, convention extraction, JSON persistence)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Playwright resolves live Radix UI element to accessible query | QRY-02 | Requires running app at URL | Start dev server, run `taro generate <recording.js>`, confirm `getByRole` output for `#radix-*` selectors |
| Query quality summary output in console | QRY-01 | Console output inspection | Run generation, check terminal for quality summary line |
| Modal boundary split produces separate `it()` blocks | TEST-01 | Visual review of output | Run with a recording containing modal interactions, inspect generated test file |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
