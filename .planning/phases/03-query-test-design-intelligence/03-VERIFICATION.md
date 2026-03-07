---
phase: 03-query-test-design-intelligence
verified: 2026-03-07T10:56:40Z
updated: 2026-03-07T10:56:40Z
status: verified
score: 11/11 must-haves verified
gaps: []
---

# Phase 3: Query & Test Design Intelligence Verification Report

**Phase Goal:** Generated tests use optimal queries and follow best test design patterns.

**Verified:** 2026-03-07T10:56:40Z
**Status:** verified
**Score:** 11/11 must-haves verified

## Runtime Verification

- `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts`
- `npm run build`

Results on 2026-03-07:
- 4 test files passed
- 30 tests passed
- TypeScript build passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Queries are classified for brittleness | ✓ VERIFIED | `classifyQuery()` in `src/core/js-parser.ts` and `emitQuerySummary()` in `src/core/generator.ts` are both covered by the targeted Phase 3 test run. |
| 2 | Ambiguous elements are resolved into better RTL queries | ✓ VERIFIED | `buildQuery()` and `inspectElements()` in `src/core/resolver.ts` are exercised by `src/core/resolver.test.ts`. |
| 3 | Accessibility gaps are flagged when only fragile selectors remain | ✓ VERIFIED | `emitQry03Warning()` is exported from `src/core/resolver.ts` and wired through `src/cli/commands/generate.ts`. |
| 4 | Concerns are distributed across logical `it()` blocks | ✓ VERIFIED | `segmentIntoItGroups()` in `src/core/js-parser.ts` and `generateTestFromGroups()` in `src/core/generator.ts` produce grouped test output. |
| 5 | Helper scans detect assertion leakage | ✓ VERIFIED | `findTestFiles()` and `scanConventions()` in `src/core/scanner.ts` surface TEST-02 warnings and persist conventions. |
| 6 | Meaningful matchers flow all the way into generated assertions | ✓ VERIFIED | `selectMatcher()` in `src/core/resolver.ts` is consumed in `src/cli/commands/generate.ts`, stored on `QueryResult`, and rendered by `src/templates/test-template.ts`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/js-parser.ts` | Babel AST parser for JS recordings | ✓ VERIFIED | 305 lines; exports `classifyQuery()` and `segmentIntoItGroups()`. |
| `src/core/resolver.ts` | Playwright DOM inspection and query building | ✓ VERIFIED | 355 lines; exports `buildQuery()`, `selectMatcher()`, and `emitQry03Warning()`. |
| `src/core/scanner.ts` | Convention scanner and cache persistence | ✓ VERIFIED | 400 lines; exports `readConventions()`, `findTestFiles()`, and `scanConventions()`. |
| `src/core/generator.ts` | Multi-`it()` generation and query summaries | ✓ VERIFIED | 246 lines; exports `emitQuerySummary()` and `generateTestFromGroups()`. |
| `src/cli/commands/generate.ts` | CLI pipeline integration | ✓ VERIFIED | 560 lines; reads conventions, resolves selectors, and stores matcher metadata. |
| `src/templates/test-template.ts` | Matcher-aware test templates | ✓ VERIFIED | 128 lines; assert steps use the supplied matcher when present. |
| `src/types/recording.ts` | Query and grouping types | ✓ VERIFIED | 143 lines; `QueryResult` carries matcher metadata. |
| `src/types/conventions.ts` | Convention model types | ✓ VERIFIED | 64 lines; conventions schema supports cache persistence. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/cli/commands/generate.ts` | `src/core/js-parser.ts` | `parseJsRecording()` | ✓ WIRED | JS recordings are parsed before grouping and query analysis. |
| `src/cli/commands/generate.ts` | `src/core/scanner.ts` | `readConventions()` and `scanConventions()` | ✓ WIRED | Conventions are loaded or scanned before generation. |
| `src/cli/commands/generate.ts` | `src/core/resolver.ts` | `buildQuery()`, `inspectElements()`, `selectMatcher()` | ✓ WIRED | Resolver output now includes matcher selection for assert steps. |
| `src/core/generator.ts` | `src/templates/test-template.ts` | `generateTestFromGroups()` | ✓ WIRED | Grouped output renders matcher-aware assertions. |
| `src/core/resolver.ts` | `src/cli/commands/generate.ts` | `emitQry03Warning()` | ✓ WIRED | Fragile query fallback is surfaced during generation. |
| `src/core/scanner.ts` | `.taro/conventions.json` | `scanConventions()` persistence | ✓ WIRED | Convention data is cached for subsequent runs. |

### Requirements Coverage

| Requirement | Status | Details |
|-------------|--------|---------|
| QRY-01 | ✓ SATISFIED | Query methods are classified and summarized. |
| QRY-02 | ✓ SATISFIED | Resolver logic upgrades selector-based recordings to better RTL queries when possible. |
| QRY-03 | ✓ SATISFIED | Fragile fallbacks emit actionable warnings. |
| TEST-01 | ✓ SATISFIED | Modal and flow boundaries become separate `it()` groups. |
| TEST-02 | ✓ SATISFIED | Convention scanning flags helpers that contain `expect()`. |
| TEST-03 | ✓ SATISFIED | Matcher selection is fully wired from resolver output into rendered assertions. |
| CTX-01 | ✓ SATISFIED | Existing test conventions are read from the codebase. |
| CTX-02 | ✓ SATISFIED | Import style and mock patterns are derived from existing tests. |
| CTX-03 | ✓ SATISFIED | Folder patterns are detected during convention scanning. |
| CTX-04 | ✓ SATISFIED | Shared mock usage is inspected during convention scanning. |
| CTX-05 | ✓ SATISFIED | Learned conventions persist in `.taro/conventions.json`. |

### Human Verification Required

None. Phase 7 reconciliation is supported by deterministic tests plus a clean TypeScript build.

---

_Verified: 2026-03-07T10:56:40Z_  
_Verifier: Codex_
