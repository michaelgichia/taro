# Project Research Summary

**Project:** Tayo
**Domain:** Testing Library Recorder JS baseline transformation for React Testing Library
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

Tayo already advertises `.js` input support, but the current implementation is still transcript-shaped rather than baseline-aware. The repo now has enough evidence to treat `v1.3 JS Baseline` as a fidelity milestone, not a greenfield parser effort: `src/core/js-parser.ts` exists, `generate.ts` already branches for `.js`, and the current dry run of `sample/sample-rest-recordingextension-output.js` shows the exact quality gaps to close.

The recommended approach is to keep the work on the existing `src/core/*` and `src/cli/commands/generate.ts` path, add only `@babel/types` to strengthen AST handling, and introduce a clearer internal pipeline: dual-source ingestion, richer JS baseline artifacts, semantic recording intelligence, step-anchored selector recovery, then suite planning before code emission. That architecture preserves JSON support while giving the JS path enough structure to produce output closer to `sample/sample-add-sale-test.ts`.

The main risks are false confidence and fake precision: flattening nested RTL queries into meaningless actions, over-splitting one flow into dozens of impossible `it()` blocks, inventing `getByTestId()` fallbacks when browser inspection fails, and logging mock/context intelligence without letting it shape the generated suite. The roadmap should therefore front-load AST normalization and truthful query recovery before touching helper-rich generation and public docs.

## Key Findings

### Recommended Stack

Reuse the existing runtime stack and keep this milestone narrow. The current repo already has `@babel/parser`, `@babel/traverse`, `playwright`, `zod`, `vitest`, and the local convention/mock analyzers needed for v1.3. The only new runtime dependency research recommends is `@babel/types`, so `js-parser.ts` can stop relying on loose `any` traversal and emit safer structured metadata.

**Core technologies:**
- `TypeScript`: define richer JS baseline and suite-plan contracts without changing the product platform
- `@babel/parser` / `@babel/traverse` / `@babel/types`: recover nested recorder JS intent without executing the export
- `playwright`: optional selector rescue for `document.querySelector(...)` fallbacks when a live URL exists
- `zod`: validate the JS baseline artifact before generation

### Expected Features

The table stakes are straightforward: `tayo generate ./recording.js` must be a truthful, primary flow; AST parsing must preserve nested query/action/assertion intent; weak selectors must be upgraded or warned honestly; and the output must look like maintainable RTL instead of recorder replay. The differentiator is not "accept JS" by itself, but turning richer recorder JS structure into codebase-aware helpers, explicit assertions, and focused tests.

**Must have (table stakes):**
- First-class `.js` input parity with the existing `generate` command surface
- Nested AST recovery for actions, queries, assertions, and environment metadata
- Truthful selector recovery for CSS fallbacks without invented test IDs
- Maintainable suite output with helpers, grouping, assertions, and convention/mock parity
- Accurate CLI/help/docs wording for `.js` as a baseline artifact, not a shippable final test

**Should have (competitive):**
- Intent-based grouping and helper extraction that reflect component flows rather than raw click chronology
- Optional live DOM enrichment for unresolved selectors when a usable recorded URL exists
- Better use of repo conventions and mock intelligence to shape output structure

**Defer (v2+):**
- Direct extension integrations beyond file-based input
- Non-React or browser-E2E output targets
- Interactive approval tooling for generated tests

### Architecture Approach

The strongest architectural recommendation is to stop generating directly from raw JS steps. Instead, Tayo should parse JSON and recorder JS through a shared input loader, normalize JS baselines into the common recording contract with richer metadata, run recording intelligence and selector recovery on that shared structure, then add a new suite-planning layer before `generator.ts` renders code.

**Major components:**
1. `input-loader.ts` and a richer `js-parser.ts` — unify source detection and recover nested query/assertion metadata
2. `baseline-normalizer.ts` plus modified `recording-intelligence.ts` and `resolver.ts` — turn baselines into semantic, truthful steps
3. `suite-planner.ts` plus modified `generator.ts` and `test-template.ts` — emit helper-oriented, sample-quality RTL instead of raw transcripts

### Critical Pitfalls

1. **Nested query flattening** — preserve enclosing AST context so `userEvent.click(screen.getByRole(...))` does not degrade into `click` plus a fake standalone assert
2. **Impossible multi-`it()` suites** — split only where state can be recreated safely; prefer helpers over fragmentation
3. **Invented selector fallbacks** — never turn unresolved CSS selectors into fictional `getByTestId()` queries
4. **False scoring confidence** — score JS-derived query quality and weak assertions explicitly instead of rewarding over-splitting
5. **Mock/context blindness** — feed repo-local conventions and mock intelligence into generation, not just console output

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 13: JS Input Contract & AST Recovery
**Rationale:** Nothing else is trustworthy until recorder JS is parsed as a real baseline artifact instead of a flat call list.
**Delivers:** Shared input loading, richer JS baseline metadata, and safer AST extraction
**Addresses:** First-class `.js` input parity, nested AST recovery
**Avoids:** Nested query flattening, early JSON/JS divergence

### Phase 14: Selector & Assertion Truthfulness
**Rationale:** Once the baseline is faithful, the next risk is fake precision from weak selectors and downgraded assertions.
**Delivers:** Step-anchored selector rescue, assertion intent recovery, and honest fallback behavior
**Uses:** Existing resolver/playwright path and JS metadata from Phase 13
**Avoids:** Invented `getByTestId()` fallbacks and false confidence

### Phase 15: Suite Planning & Structured Generation
**Rationale:** Maintainable output needs an explicit planning layer before code emission.
**Delivers:** Helper extraction, scenario grouping, real render-target planning, and generation closer to `sample/sample-add-sale-test.ts`
**Implements:** `suite-planner.ts`, generator/template updates, and generation-facing mock/convention integration

### Phase 16: Verification, Parity & Public Surface
**Rationale:** The milestone is only done when dry runs, scores, docs, and JSON parity all tell the same story.
**Delivers:** Golden fixture tests, score/write gates, truthful CLI/help/README copy, and JSON regression coverage
**Addresses:** Scoring blind spots, public-product drift, and release confidence

### Phase Ordering Rationale

- AST fidelity must come before selector hardening, because unresolved selectors and assertions need stable step metadata.
- Truthful recovery must come before suite planning, because helpers and `it()` splits should be built on semantic intent rather than fake targets.
- Verification and docs come last so they can describe and lock the actual shipped behavior, while also guarding the JSON path from regression.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 14:** recorded URL safety and host policy for optional Playwright inspection
- **Phase 15:** how far mock/context planning can go before requiring repo-specific manual checkpoints

Phases with standard patterns (skip research-phase):
- **Phase 13:** Babel AST extraction and shared input-contract work follows clear existing repo seams
- **Phase 16:** fixture-based regression, score gating, and CLI/docs alignment are standard once the behavior is known

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | The repo already contains nearly all required dependencies and the recommended addition is minimal |
| Features | HIGH | The user-provided baseline/output samples and current CLI/docs claims make the milestone scope concrete |
| Architecture | HIGH | The active `generate.ts` pipeline and the sample dry-run failure modes point clearly to the needed seams |
| Pitfalls | HIGH | Current repo behavior already demonstrates the major failure modes in practice |

**Overall confidence:** HIGH

### Gaps to Address

- **Render-target resolution:** the milestone needs a practical rule for when Tayo can identify the component/module under test versus when it must checkpoint honestly
- **Selector rescue policy:** optional browser inspection needs a safe host policy and a clear degraded mode when no trustworthy DOM is available

## Sources

### Primary (HIGH confidence)
- `/Users/michaelgichia/workspace/tayo/.planning/research/STACK.md` — stack and dependency guidance
- `/Users/michaelgichia/workspace/tayo/.planning/research/FEATURES.md` — feature landscape and scope boundaries
- `/Users/michaelgichia/workspace/tayo/.planning/research/ARCHITECTURE.md` — pipeline and module recommendations
- `/Users/michaelgichia/workspace/tayo/.planning/research/PITFALLS.md` — observed failure modes and verification evidence

### Secondary (MEDIUM confidence)
- `/Users/michaelgichia/workspace/tayo/src/cli/commands/generate.ts` — current JS branch behavior and public command surface
- `/Users/michaelgichia/workspace/tayo/src/core/js-parser.ts` — current AST extraction limits
- `/Users/michaelgichia/workspace/tayo/sample/sample-rest-recordingextension-output.js` — baseline recorder artifact
- `/Users/michaelgichia/workspace/tayo/sample/sample-add-sale-test.ts` — target quality bar

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
