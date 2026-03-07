---
phase: 4
slug: self-scoring-convention-learning
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
updated: 2026-03-07T10:54:00Z
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript build + CLI runtime verification |
| **Config file** | `package.json` scripts (`build`, `test:run`) |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.json --output /tmp/taro-phase4-verify/sample-json.test.tsx --force && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.js --output /tmp/taro-phase4-verify/sample-js.test.tsx --force` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Full suite must be green and `.taro/history.json` plus `.taro/conventions.json` must be updated
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SCR-01 | build | `npm run build` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | SCR-03 | build | `npm run build` | ✅ | ✅ green |
| 04-03-01 | 03 | 2 | CNV-01, CNV-02 | unit/integration | `npm run build && npm run test:run -- src/core/scanner.test.ts src/core/resolver.test.ts src/core/js-parser.test.ts` | ✅ | ✅ green |
| 04-04-01 | 04 | 3 | SCR-01, SCR-02, SCR-03 | integration | `npm run build && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.json --output /tmp/taro-phase4-verify/sample-json.test.tsx --force && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.js --output /tmp/taro-phase4-verify/sample-js.test.tsx --force` | ✅ | ✅ green |
| 04-04-02 | 04 | 3 | CNV-01, CNV-02, CNV-03 | integration | `npm run build && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.json --output /tmp/taro-phase4-verify/sample-json.test.tsx --force && node /Users/michaelgichia/workspace/taro/dist/index.js generate /tmp/taro-phase4-verify/sample-recording.js --output /tmp/taro-phase4-verify/sample-js.test.tsx --force` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — Phase 4 used the existing build pipeline and Phase 3 test surface. No extra scaffolding phase was required.

---

## Manual-Only Verifications

None — all Phase 4 behaviors were verified through build and controlled CLI runtime checks.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] No additional Wave 0 scaffolding required
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
