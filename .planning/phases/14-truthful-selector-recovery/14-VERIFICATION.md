---
phase: 14-truthful-selector-recovery
verified: 2026-03-10T05:00:18Z
updated: 2026-03-10T05:00:18Z
status: verified
score: 3/3 must-haves verified
gaps: []
human_verification: []
---

# Phase 14: Truthful Selector Recovery Verification Report

**Phase Goal:** Users can trust JS-derived selectors because Taro only strengthens them when it has evidence and stays explicit when it does not.

**Verified:** 2026-03-10T05:00:18Z
**Status:** verified
**Score:** 3/3 must-haves verified

## Runtime Verification

- `npm run build`
- `npm run test:run -- src/core/resolver.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts`
- `perl -e 'alarm shift; exec @ARGV' 30 node /Users/michaelgichia/workspace/taro/dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run`

Results on 2026-03-10:
- TypeScript build passed for the shipped CLI and core generation pipeline.
- Focused resolver, generator, and CLI regression suites passed: 3 files, 26 tests.
- The built CLI dry-run against `sample/sample-rest-recordingextension-output.js` emitted explicit unresolved-selector warnings and `// taro-query-checkpoint:` comments instead of fabricating stronger queries.
- Optional Playwright-backed enrichment degraded truthfully on this host: browser launch failed with a macOS Mach/bootstrap permission error, Taro surfaced that failure, and generation continued with explicit unresolved-selector output.
- The Add Sale dry-run preview continued to avoid invented `getByTestId(...)` fallbacks while preserving recovered accessible queries where the recorder baseline already had them.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JS selector recovery produces stronger queries only when Taro has preserved recorder evidence or live-DOM proof | ✓ VERIFIED | `src/core/resolver.test.ts`, `src/core/generator.test.ts`, and `src/cli/commands/generate.test.ts` cover resolved outcomes, preserved query precedence, and CLI recovery wiring. |
| 2 | Unresolved CSS selector evidence is surfaced as explicit warnings/checkpoints instead of invented RTL queries | ✓ VERIFIED | `src/core/generator.test.ts` asserts checkpoint output for unresolved selector evidence, and the built CLI dry-run preview contains `// taro-query-checkpoint:` comments rather than fake `data-testid` fallbacks. |
| 3 | Live DOM enrichment is optional and failures degrade explicitly without blocking baseline usefulness | ✓ VERIFIED | Resolver regression tests cover per-selector and page-level inspection failure, while the built CLI dry-run continued after Playwright launch failure and reported unresolved selectors truthfully. |

**Score:** 3/3 truths verified

### Requirements Coverage

| Requirement | Status | Details |
|-------------|--------|---------|
| QUERY-02 | ✓ SATISFIED | Selector recovery now returns explicit resolved/unresolved outcomes and threads them through JS generation with step-specific warnings. |
| QUERY-03 | ✓ SATISFIED | JS generation no longer fabricates selector fallbacks such as fake `getByTestId(...)`; unresolved selectors become checkpoints and warnings. |
| QUERY-04 | ✓ SATISFIED | Recorded URL and optional live-DOM enrichment are used when available, and host/browser failures degrade cleanly without making selector recovery unusable. |

### Residual Caveats

- Phase 15 still owns render-target and suite-boundary quality; the dry-run remains a truthful boundary draft for the Add Sale flow.
- The current warning taxonomy reports `QRY-03` for several Playwright inspection failure states. That is explicit enough for truthful degradation, but code-specific warning refinement can still happen later if needed.

---

_Verified: 2026-03-10T05:00:18Z_  
_Verifier: Codex_
