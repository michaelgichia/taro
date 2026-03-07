---
phase: 3
slug: query-test-design-intelligence
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-06
updated: 2026-03-07T10:56:40Z
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 + TypeScript build |
| **Config file** | `package.json` scripts (`build`, `test:run`) |
| **Quick run command** | `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | QRY-01, QRY-02, QRY-03, TEST-01, TEST-02, TEST-03, CTX-01, CTX-02, CTX-03, CTX-04, CTX-05 | scaffold | `npm run build` | ✅ | ✅ green |
| 03-02-01 | 02 | 1 | QRY-01, TEST-01 | unit | `npm run test:run -- src/core/js-parser.test.ts` | ✅ | ✅ green |
| 03-03-01 | 03 | 1 | QRY-02, QRY-03 | unit | `npm run test:run -- src/core/resolver.test.ts` | ✅ | ✅ green |
| 03-04-01 | 04 | 2 | CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, TEST-02 | unit/integration | `npm run test:run -- src/core/scanner.test.ts` | ✅ | ✅ green |
| 03-05-01 | 05 | 2 | QRY-01, TEST-01 | unit/integration | `npm run test:run -- src/core/generator.test.ts src/core/js-parser.test.ts` | ✅ | ✅ green |
| 03-06-01 | 06 | 3 | CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, QRY-01, QRY-02, QRY-03, TEST-01, TEST-02 | integration | `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts` | ✅ | ✅ green |
| 03-07-01 | 07 | 4 | TEST-03 | regression | `npm run test:run -- src/core/resolver.test.ts src/core/generator.test.ts && npm run build` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/core/js-parser.test.ts` — covers QRY-01 and TEST-01 parsing/grouping behavior
- [x] `src/core/resolver.test.ts` — covers QRY-02, QRY-03, and matcher selection foundations with mocked Playwright behavior
- [x] `src/core/scanner.test.ts` — covers CTX-01 through CTX-05 plus TEST-02 convention scanning

---

## Manual-Only Verifications

None. The reconciliation pass relies on deterministic Vitest coverage plus a TypeScript build; no additional manual gate is required for the Phase 3 artifact set.

---

## Validation Sign-Off

- [x] All tasks have automated verification coverage or completed scaffold evidence
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 references are satisfied by real test files on disk
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
