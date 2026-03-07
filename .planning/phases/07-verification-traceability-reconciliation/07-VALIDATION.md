---
phase: 7
slug: verification-traceability-reconciliation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
updated: 2026-03-07T11:09:51Z
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 + local CLI/runtime verification |
| **Config file** | none (vitest reads from package.json scripts) |
| **Quick run command** | `npm run build && npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/core/generator.test.ts` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific quick command or documented verification command
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green and milestone audit must be rerun
- **Max feedback latency:** 30 seconds plus any explicit manual verification step

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | INPT-01..GEN-05 | integration/doc | `npm run build` | ✅ | ✅ green |
| 07-02-01 | 02 | 1 | CTX-01..CTX-05 | unit/doc | `npm run test:run -- src/core/scanner.test.ts && npm run build` | ✅ | ✅ green |
| 07-02-02 | 02 | 1 | QRY-01..TEST-03 | unit/doc | `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/generator.test.ts && npm run build` | ✅ | ✅ green |
| 07-03-01 | 03 | 1 | SCR-01..CNV-03 | integration/doc | `npm run build` | ✅ | ✅ green |
| 07-04-01 | 04 | 2 | INPT-01..CNV-03 | integration | `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/core/generator.test.ts` | ✅ | ✅ green |
| 07-04-02 | 04 | 2 | INPT-01..CNV-03 | audit/manual | `$gsd-audit-milestone` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs will be finalized once the phase plans are created.*

---

## Wave 0 Requirements

None — Phase 7 uses existing repo test infrastructure. Legacy validation gaps are handled directly by Plan 01 (`01-VALIDATION.md`) and Plan 03 (`04-VALIDATION.md`), not by a new Wave 0 scaffold.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated Phase 1 output is runnable in a real test harness | GEN-04 | Requires executing a generated test against a minimal React/Vitest harness, not just syntax parsing | Create `/tmp/taro-phase7-gen04-recording.json`, generate to `/tmp/taro-phase7-gen04-harness/generated.test.tsx`, install the minimal Vitest/RTL dependencies in `/tmp/taro-phase7-gen04-harness`, run `npx vitest run generated.test.tsx --environment jsdom`, and record the exact result plus any residual caveat in `01-VERIFICATION.md` |
| Final milestone audit is archive-ready | INPT-01..CNV-03 | Requires inspection of the regenerated audit report and any residual caveats | Rerun the milestone audit after all phase-local reconciliation work, inspect `v1.0-MILESTONE-AUDIT.md`, and confirm no stale partial/orphaned Phase 1/3/4 gaps remain |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a tightly scoped manual verification
- [x] Sampling continuity: no 3 consecutive tasks without an execution check
- [x] No additional Wave 0 scaffold is required for this phase
- [x] No watch-mode flags
- [x] Feedback latency < 30s for automated loops
- [x] `nyquist_compliant: true` set in frontmatter before phase completion

**Approval:** approved 2026-03-07
