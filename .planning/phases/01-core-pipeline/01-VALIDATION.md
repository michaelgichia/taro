---
phase: 1
slug: core-pipeline
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
updated: 2026-03-07T11:02:29Z
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript build + controlled Vitest/RTL harness |
| **Config file** | `package.json` scripts plus `/tmp/tayo-phase7-gen04-harness/vitest.config.ts` |
| **Quick run command** | `npm run build` |
| **Full suite command** | `node /Users/michaelgichia/workspace/tayo/dist/index.js generate /tmp/tayo-phase7-gen04-recording.json --output /tmp/tayo-phase7-gen04-harness/generated.test.tsx --force && cd /tmp/tayo-phase7-gen04-harness && npx vitest run generated.test.tsx --environment jsdom` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run the full suite command
- **Before `$gsd-verify-work`:** Build plus generated-test proof path must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | foundation | build | `npm run build` | ✅ | ✅ green |
| 01-03-01 | 03 | 1 | INPT-01, INPT-02 | integration | `node /Users/michaelgichia/workspace/tayo/dist/index.js generate /tmp/tayo-phase7-gen04-recording.json --dry-run` | ✅ | ✅ green |
| 01-04-01 | 04 | 2 | INPT-03 | integration | `node /Users/michaelgichia/workspace/tayo/dist/index.js generate /tmp/tayo-phase7-invalid-recording.json --dry-run` | ✅ | ✅ green |
| 01-05-01 | 05 | 2 | GEN-01, GEN-02, GEN-03, GEN-04 | integration | `node /Users/michaelgichia/workspace/tayo/dist/index.js generate /tmp/tayo-phase7-gen04-recording.json --output /tmp/tayo-phase7-gen04-harness/generated.test.tsx --force && cd /tmp/tayo-phase7-gen04-harness && npx vitest run generated.test.tsx --environment jsdom` | ✅ | ✅ green |
| 01-06-01 | 06 | 3 | GEN-05 | integration | `node /Users/michaelgichia/workspace/tayo/dist/index.js generate /tmp/tayo-phase7-gen04-recording.json --output /tmp/tayo-phase7-gen04-harness/generated.test.tsx --force` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None. Phase 1 created the base CLI, parser, generator, and writer infrastructure directly during execution rather than depending on a separate scaffolding wave.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated selectors match a real app's DOM semantics | GEN-02, GEN-04 | Requires the target application and its DOM structure | Run `tayo generate` on a real Chrome Recorder export from the target app and verify the emitted queries map to the intended rendered elements |

---

## Validation Sign-Off

- [x] All tasks have automated verification coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No extra Wave 0 scaffolding required
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-07
