---
phase: 03-query-test-design-intelligence
verified: 2026-03-06T18:15:00Z
updated: 2026-03-07T00:00:00Z
status: verified
score: 11/11 must-haves verified
gaps: []
---

# Phase 3: Query & Test Design Intelligence Verification Report

**Phase Goal:** Generated tests use optimal queries and follow best test design patterns

**Verified:** 2026-03-06T18:15:00Z
**Status:** gaps_found
**Score:** 10/11 must-haves verified

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Queries are classified for brittleness — Generated tests prefer robust queries (getByRole) over fragile ones | ✓ VERIFIED | `QUERY_QUALITY_MAP` in js-parser.ts lines 16-25 classifies getByRole as 'excellent', getByText as 'good', getByTestId as 'fragile'. `emitQuerySummary()` in generator.ts prints quality counts. |
| 2 | Ambiguous elements are resolved — When multiple matches exist, DOM scoping identifies the correct target | ✓ VERIFIED | `inspectElements()` in resolver.ts (lines 193-251) uses Playwright to inspect elements at runtime. Called in generate.ts lines 102-120. |
| 3 | Accessibility gaps are flagged — When no clean query exists, a warning is logged with suggestions | ✓ VERIFIED | `emitQry03Warning()` in resolver.ts (lines 259-264) logs warnings with actionable suggestions. Called in generate.ts line 117 when quality === 'fragile'. |
| 4 | Concerns are distributed across tests — Related assertions are grouped logically, not all in one test | ✓ VERIFIED | `segmentIntoItGroups()` in js-parser.ts (lines 64-119) segments steps by modal boundaries. `generateTestFromGroups()` in generator.ts creates multiple `it()` blocks. Each it block has own render() + userEvent.setup(). |
| 5 | Helpers are assertion-free — Helper functions contain setup only, no expect statements | ✓ VERIFIED | `detectHelperWithExpect()` in scanner.ts (lines 109-122) detects helpers with expect(). `scanConventions()` logs TEST-02 warnings (lines 293-305) when found. |
| 6 | Matchers are meaningful — Generated tests use specific matchers (toBeInTheDocument, toHaveValue) rather than generic ones | ✓ VERIFIED | `selectMatcher()` called in generate.ts after buildQuery(), matcher stored in QueryResult, passed through generateTestFromGroups() → stepTemplate() for assert steps. Plan 07 (2026-03-07). |

**Score:** 5/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/js-parser.ts` | Babel AST parser for JS recordings | ✓ VERIFIED | 299 lines, parses screen.getBy*, document.querySelector, userEvent.* calls |
| `src/core/resolver.ts` | Playwright DOM inspection + query building | ✓ VERIFIED | 265 lines, inspectElements(), buildQuery(), selectMatcher(), emitQry03Warning() |
| `src/core/scanner.ts` | Convention scanner | ✓ VERIFIED | 332 lines, findTestFiles(), analyzeTestFile(), scanConventions(), persistConventions() |
| `src/core/generator.ts` | Multi-it test generation | ✓ VERIFIED | 199 lines, generateTestFromGroups(), emitQuerySummary() |
| `src/cli/commands/generate.ts` | CLI pipeline integration | ✓ VERIFIED | 230 lines, wires JS parser, resolver, scanner, generator together |
| `src/templates/test-template.ts` | Test code templates | ✓ VERIFIED | 127 lines, describeBlockMultiIt() supports multiple it() blocks |
| `src/types/recording.ts` | Type definitions | ✓ VERIFIED | 93 lines, QueryQuality, ElementInfo, QueryResult, ItGroup types |
| `src/types/conventions.ts` | Convention types | ✓ VERIFIED | 34 lines, ConventionsSchema, ConventionFile types |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| generate.ts | js-parser.ts | parseJsRecording() | ✓ WIRED | Called at line 82, receives JsParseResult with itGroups |
| generate.ts | scanner.ts | readConventions(), scanConventions() | ✓ WIRED | Called at lines 73-77, conventions passed to generator |
| generate.ts | resolver.ts | inspectElements(), buildQuery() | ✓ WIRED | Called at lines 102-120, queryResults passed to generator |
| generator.ts | test-template.ts | describeBlockMultiIt() | ✓ WIRED | Called at line 189, generates multi-it test code |
| resolver.ts | generate.ts | emitQry03Warning() | ✓ WIRED | Called at line 117 when quality === 'fragile' |
| scanner.ts | .taro/conventions.json | persistConventions() | ✓ WIRED | Creates .taro directory, writes conventions.json |

### Requirements Coverage

| Requirement | Status | Details |
|-------------|--------|---------|
| QRY-01: Classify queries for brittleness | ✓ SATISFIED | QUERY_QUALITY_MAP + classifyQuery() + emitQuerySummary() all implemented |
| QRY-02: Resolve ambiguous element targeting | ✓ SATISFIED | inspectElements() uses Playwright to resolve CSS selectors to accessible queries |
| QRY-03: Flag accessibility gaps | ✓ SATISFIED | emitQry03Warning() logs actionable warnings when getByTestId fallback used |
| TEST-01: Distribute concerns across tests | ✓ SATISFIED | segmentIntoItGroups() segments by modal boundaries, each it has own setup |
| TEST-02: Keep helpers assertion-free | ✓ SATISFIED | detectHelperWithExpect() + TEST-02 warnings implemented |
| TEST-03: Meaningful matchers | ✓ SATISFIED | selectMatcher() wired: generate.ts → QueryResult.matcher → generateTestFromGroups → stepTemplate (Plan 07) |
| CTX-01: Read codebase conventions | ✓ SATISFIED | scanConventions() scans test files on first run |
| CTX-02: Analyze existing test patterns | ✓ SATISFIED | analyzeTestFile() detects import style, describe blocks, mock patterns |
| CTX-03: Detect folder structure | ✓ SATISFIED | detectFolderPattern() identifies colocated vs __tests__ vs mixed |
| CTX-04: Analyze shared mocks | ✓ SATISFIED | mockPattern detection (vi.mock, jest.mock) in analyzeTestFile() |
| CTX-05: Update internal state | ✓ SATISFIED | persistConventions() writes to .taro/conventions.json |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/core/generator.ts | 78 | TODO comment in fallback code | ℹ️ Info | Not a blocker - placeholder comment in legacy selectorToQuery (not used by JS pipeline) |
| src/templates/test-template.ts | 79 | TODO comment for unsupported steps | ℹ️ Info | Not a blocker - handles edge case gracefully |

### Human Verification Required

None - all requirements can be verified programmatically.

### Gaps Summary

**1 gap blocking full goal achievement:**

**TEST-03 (Meaningful Matchers):** The `selectMatcher()` function exists in `resolver.ts` (lines 103-126) with a complete implementation that returns:
- `.toHaveValue('...')` for fill actions on inputs with values
- `.toBeChecked()` for checkboxes  
- `.toHaveTextContent('...')` for assert actions with innerText
- `.toBeVisible()` for dialogs
- `.toBeInTheDocument()` as default

However, this function is **never called** in the generation pipeline. In `generate.ts`:
- Line 109-118: Calls `buildQuery()` which returns QueryResult with quality
- Line 138: Calls `emitQuerySummary()` to print quality counts
- **Missing:** Call to `selectMatcher()` to select the appropriate matcher

The test-template.ts also uses hardcoded `toBeInTheDocument()` for assert actions (line 69), not the context-aware matcher.

**To close this gap:**
1. In `generate.ts`, after calling `buildQuery()`, also call `selectMatcher(info, action)` to get the appropriate matcher
2. Pass the matcher to the step generation
3. Update `stepTemplate()` in test-template.ts to accept a matcher parameter

---

_Verified: 2026-03-06T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
