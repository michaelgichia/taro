---
phase: 13
slug: js-input-contract-ast-recovery
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-09
updated: 2026-03-09T06:55:00Z
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + TypeScript build verification |
| **Config file** | none |
| **Quick run command** | `npm run build && npm run test:run -- src/core/js-parser.test.ts src/core/recording-intelligence.test.ts` |
| **Full suite command** | `npm run build && npm run test:run -- src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/cli/commands/generate.test.ts src/core/input-loader.test.ts` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific parser or CLI verification command
- **After every plan wave:** Run `npm run build && npm run test:run -- src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/cli/commands/generate.test.ts src/core/input-loader.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | INPUT-01 | unit/integration | `npm run build && npm run test:run -- src/core/input-loader.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | INPUT-03 | unit | `npm run build && npm run test:run -- src/core/js-parser.test.ts` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 3 | INPUT-02, QUERY-01 | integration | `npm run build && npm run test:run -- src/cli/commands/generate.test.ts src/core/recording-intelligence.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 4 | INPUT-01, INPUT-02, INPUT-03, QUERY-01 | integration/golden | `npm run build && npm run test:run -- src/core/js-parser.test.ts src/cli/commands/generate.test.ts` | ⚠️ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/core/input-loader.test.ts` — source detection and shared parsed-input envelope coverage
- [ ] `src/cli/commands/generate.test.ts` — `.js` input parity coverage for `--dry-run`, `--output`, and `--force`
- [ ] Golden parser fixture assertions based on `sample/sample-rest-recordingextension-output.js` inside `src/core/js-parser.test.ts`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dry-run output reads like truthful baseline recovery rather than transcript replay | INPUT-02, QUERY-01 | The quality bar is semantic and easier to judge from the generated preview than from one assertion alone | Run `node dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run` and confirm the title, step intent, and query semantics are recovered without fake `"click"`/`"type"` targets |
| Phase 13 stays inside its boundary and does not pre-solve selector strengthening policy | INPUT-03 | Overlap with Phase 14 is a planning/design concern rather than a pure test assertion | Review parser/normalizer output and confirm fallback CSS selectors are preserved as evidence, not upgraded into invented accessible queries |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-09
