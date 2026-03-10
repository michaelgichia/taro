---
phase: 13-js-input-contract-ast-recovery
verified: 2026-03-10T06:20:00Z
updated: 2026-03-10T06:20:00Z
status: verified
score: 4/4 must-haves verified
gaps: []
human_verification: []
---

# Phase 13: JS Input Contract & AST Recovery Verification Report

**Phase Goal:** Users can feed recorder JS exports into the normal generation flow and have Tayo recover baseline intent instead of replaying raw transcript code.

**Verified:** 2026-03-10T06:20:00Z
**Status:** verified
**Score:** 4/4 must-haves verified

## Runtime Verification

- `npm run build`
- `npm run test:run -- src/core/input-loader.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/cli/commands/generate.test.ts`
- `node /Users/michaelgichia/workspace/tayo/dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run`

Results on 2026-03-10:

- TypeScript build passed for the shared loader, JS parser, normalizer, analyzer, and shipped `generate` command.
- Focused regression coverage for the Phase 13 boundary passed across the current shared-input loader, AST parser, grouping analysis, and public CLI flow.
- The built CLI dry-run still accepts the shipped Add Sale recorder JS fixture through `tayo generate`, produces project-shaped RTL output instead of replaying recorder transcript code, and preserves recovered recorder evidence as the baseline for later phases.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Recorder JS and Chrome Recorder JSON enter Tayo through one shared parsed-input boundary with stable step IDs and source discrimination | ✓ VERIFIED | `src/core/input-loader.ts`, `src/core/input-loader.test.ts`, and Phase 13-01 summary prove the discriminated `ParsedInput` envelope and shared loader path. |
| 2 | Recorder JS is parsed structurally, so nested `userEvent(...)`, recovered Testing Library queries, `expect(...)` assertions, recorded URLs, and raw selectors survive as baseline metadata | ✓ VERIFIED | `src/core/js-parser.ts`, `src/core/js-parser.test.ts`, and the Add Sale sample fixture assertions prove AST-derived recovery instead of fake `"click"` or `"type"` targets. |
| 3 | The shipped `tayo generate <recording.js>` flow routes through the shared loader and generates project-test-shaped RTL output rather than copying the executable recorder transcript through unchanged | ✓ VERIFIED | `src/cli/commands/generate.ts`, `src/cli/commands/generate.test.ts`, and the built CLI dry-run against `sample/sample-rest-recordingextension-output.js` prove the public JS path. |
| 4 | Accessible query intent already present in recorder JS is preserved, while raw selector evidence stays explicit instead of being prematurely strengthened into invented accessible queries | ✓ VERIFIED | `src/core/js-parser.test.ts`, `src/core/recording-intelligence.test.ts`, and Phase 13-04 boundary assertions show preserved `getByRole` / `getByText` evidence plus explicit selector-only evidence. |

**Score:** 4/4 truths verified

### Requirements Coverage

| Requirement | Status | Details |
|-------------|--------|---------|
| INPUT-01 | ✓ SATISFIED | `loadInput()` accepts recorder `.js` and `.json`, and `src/cli/commands/generate.test.ts` proves the public `--dry-run`, `--output`, and `--force` flow for recorder JS. |
| INPUT-02 | ✓ SATISFIED | The built CLI dry-run and `src/cli/commands/generate.test.ts` show generated RTL test output with Tayo-owned structure, scoring, and warnings rather than transcript replay. |
| INPUT-03 | ✓ SATISFIED | `src/core/js-parser.test.ts` and `src/core/input-loader.test.ts` cover stable recovery of nested queries, assertions, environment URLs, and fallback selectors into baseline metadata. |
| QUERY-01 | ✓ SATISFIED | `src/core/js-parser.test.ts` proves preserved accessible query intent for role/name and text queries from recorder JS, while later phases can strengthen selectors without losing this baseline truth. |

### Residual Caveats

- Phase 13 intentionally stopped before selector strengthening. Raw `document.querySelector(...)` evidence remains preserved baseline input, and Phase 14 owns truthful strengthening or unresolved-selector checkpoints.
- Phase 15 and Phase 16 add repo-aware generation, draft-quality messaging, and broader verification, but those later improvements do not change the fact that Phase 13’s baseline input contract is now audit-ready and reproducible.

---

_Verified: 2026-03-10T06:20:00Z_
_Verifier: Codex_
