---
phase: 16
slug: verification-json-parity-product-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + built CLI smoke verification |
| **Config file** | none |
| **Quick run command** | `npm run build && npm run test:run -- src/core/scorer.test.ts src/core/input-loader.test.ts src/cli/commands/generate.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/scorer.test.ts src/core/input-loader.test.ts src/core/parser.test.ts src/core/recording-intelligence.test.ts src/cli/commands/generate.test.ts` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run test:run -- src/core/scorer.test.ts src/core/input-loader.test.ts src/cli/commands/generate.test.ts`
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/scorer.test.ts src/core/input-loader.test.ts src/core/parser.test.ts src/core/recording-intelligence.test.ts src/cli/commands/generate.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | VERIFY-01 | unit | `npm run build && npm run test:run -- src/core/scorer.test.ts` | ✅ | ⬜ pending |
| 16-01-02 | 01 | 1 | VERIFY-01 | integration | `npm run build && npm run test:run -- src/core/scorer.test.ts src/cli/commands/generate.test.ts` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | VERIFY-02 | integration | `npm run build && npm run test:run -- src/core/input-loader.test.ts src/core/parser.test.ts src/core/recording-intelligence.test.ts` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | VERIFY-02 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/input-loader.test.ts` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | VERIFY-03 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/scorer.test.ts src/core/input-loader.test.ts` | ✅ | ⬜ pending |
| 16-03-02 | 03 | 3 | VERIFY-03 | docs/manual | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README and help surface show dual-input support truthfully | VERIFY-03 | The product-surface contract is easier to review from the rendered docs/help than from grep-only assertions | Review `README.md` and `taro generate --help`; confirm installer-first onboarding remains intact, both `.js` and `.json` support are visible, and one draft-quality example documents truthful degraded output. |
| Built CLI smoke proof for both JS and JSON representative flows | VERIFY-01, VERIFY-02 | Milestone closeout requires real public-path proof beyond mocked tests | Run `node dist/index.js generate <js-sample> --dry-run` and `node dist/index.js generate <json-sample> --dry-run`; confirm score/trust messaging and public JSON behavior match the automated expectations. |
| Phase 13 verification artifact closes the audit gap with cited evidence | VERIFY-03 | Audit readiness depends on the artifact’s narrative quality and traceability, not only file existence | Review `.planning/phases/13-js-input-contract-ast-recovery/13-VERIFICATION.md`; confirm it cites real commands/artifacts that satisfy `INPUT-01`, `INPUT-02`, `INPUT-03`, and `QUERY-01`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
