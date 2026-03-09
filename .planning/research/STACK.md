# Stack Research

**Domain:** local-first Testing Library Recorder JS baseline ingestion and RTL generation
**Researched:** 2026-03-09
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.7.x | Define the richer parse artifact and generator contracts across `src/core/*` | Already the repo language, and this milestone is mostly about improving data shape fidelity rather than changing platforms |
| `@babel/parser` | 7.29.x | Parse Recorder JS and, when needed, TS/TSX convention files without executing them | Already shipped in the runtime path and well-suited to the CommonJS Testing Library Recorder export format |
| `@babel/traverse` | 7.29.x | Recover nested `userEvent`, `screen.getBy*`, `expect(...)`, and `document.querySelector(...)` semantics | Already present and is the correct seam for replacing today’s shallow call extraction in `src/core/js-parser.ts` |
| `@babel/types` | 7.29.x | Add safe node guards/builders for reusable AST extractors | This is the missing Babel utility that will let `js-parser.ts` stop leaning on `any` and start emitting stable structured metadata |
| `zod` | 3.24.x | Validate the parsed JS baseline artifact before generation | Already present in the repo and appropriate for enforcing a truthful boundary between AST recovery and code generation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `playwright` | 1.58.x | Resolve raw CSS selectors into accessible RTL queries and capture visual context | Use only when Recorder JS falls back to `document.querySelector(...)` and the export includes a runnable URL |
| Repo-local convention and mock analyzers (`src/core/scanner.ts`, `src/core/mock-intelligence.ts`) | current repo | Recover import style, mock style, helper shape, and mutation lifecycle hints from the target codebase | Run before final codegen so JS baseline output can move toward `sample/sample-add-sale-test.ts` instead of staying a flat transcript |
| `vitest` | 3.0.x | Fixture-based verification of the JS parse artifact and generated output | Use paired fixtures for `sample/sample-rest-recordingextension-output.js` and `sample/sample-add-sale-test.ts`, plus negative cases |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsc` plus existing `verifySyntax` | Catch broken generated TS/TSX before reporting success | Keep the current post-write verification path; no formatter-only runtime dependency is needed |
| Golden fixtures under `sample/` | Lock the baseline JS input and expected structured RTL output | Prefer explicit fixture comparisons over loose snapshots for this milestone |
| `taro generate --dry-run` smoke runs | Keep CLI help, docs, and `.js` behavior truthful | Needed because current CLI copy still describes generation as Chrome Recorder-only in some surfaces |

## Pipeline Integration Points

- `src/core/js-parser.ts`: keep this as the JS entrypoint, but change it from a flat `NormalizedStep[]` extractor into a baseline-artifact extractor that recovers query descriptors, assertion descriptors, action payloads, and flow boundaries from nested AST call trees.
- `src/types/recording.ts`: add explicit types for recovered JS metadata, such as `QueryDescriptor`, `AssertionDescriptor`, `ActionTarget`, and `JsBaselineArtifact`. Keep `NormalizedStep` as the downstream lingua franca only after intent recovery, not as the raw parse result.
- `src/core/recording-intelligence.ts`: reuse the existing cleanup/grouping pass, but feed it richer step metadata so double-click noise, dialog boundaries, and review/save transitions are inferred from recovered intent instead of lossy string targets.
- `src/core/resolver.ts`: keep Playwright as the fallback resolver for unresolved CSS selectors. Do not route already-accessible `screen.getBy*` queries through browser inspection.
- `src/core/generator.ts` and `src/templates/test-template.ts`: add a structured generation path that can emit helper functions, separated test cases, scoped `within(...)` queries, and matcher selection. The current multi-`it()` path is reusable, but it is not enough on its own to reach the sample quality bar.
- `src/core/scanner.ts` and `src/types/conventions.ts`: expand conventions beyond import style and mock style. The generator needs to learn helper segregation, `userEvent.setup()` placement, `within` usage, mock file locations, and whether assertion-free helpers are preferred.
- `src/cli/commands/generate.ts` and `README.md`: update descriptions/help text so `.js` is described as a baseline artifact that Taro interprets and upgrades, not as a finished RTL test input.

## Installation

```bash
# Required addition for v1.3
npm install @babel/types

# Keep using the existing runtime stack
npm install @babel/parser @babel/traverse playwright zod

# No new test runner is required
npm install -D vitest typescript
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Babel runtime AST stack (`@babel/parser` + `@babel/traverse` + `@babel/types`) | `@typescript-eslint/typescript-estree` at runtime | Only if a later milestone needs ESTree-compatible transforms across arbitrary TSX source files; v1.3 only needs Recorder JS ingestion and lightweight convention reads |
| Structured IR plus the current string/template generator | Recast or jscodeshift code-mod pipeline | Only if Taro starts editing existing user tests instead of generating new files from scratch |
| Existing Playwright selector inspection | `jsdom` or `happy-dom` execution layer | Only if a future offline mode must inspect DOM fixtures without a live URL; not needed for the current live-selector fallback |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Executing recorder JS with Vitest, Jest, or `node:vm` | The milestone goal is to treat Recorder JS as a baseline artifact, not as shippable RTL. Execution would preserve recorder noise and wrong structure. | Parse AST into a validated intermediate artifact, then regenerate project-style RTL |
| Adding a second parser/code-mod stack (`acorn`, `esprima`, `recast`, `jscodeshift`, `ts-morph`) | Duplicates parsing concepts, increases package size, and splits maintenance away from the existing `src/core/js-parser.ts` path | Stay on Babel for runtime parsing and extraction |
| Promoting `@typescript-eslint/typescript-estree` to a runtime dependency for this milestone | The repo already ships Babel runtime deps; adding another runtime parser is unnecessary for CommonJS Recorder JS | Keep `typescript-estree` dev-only unless a future TSX-analysis milestone proves it necessary |
| Formatting-only runtime deps such as Prettier or Biome in the generation path | Adds install weight but does not solve the actual fidelity problem | Emit deterministic templates and keep `verifySyntax` plus fixture tests as the quality gate |
| Full browser replay of every recorder step | Slow, flaky, and turns generation into pseudo-E2E execution | Use Playwright only for selector and visual inspection on unresolved DOM targets |

## Stack Patterns by Variant

**If the recorder step already uses `screen.getBy*` or `within(...).getBy*`:**
- Recover the query descriptor directly from AST
- Because accessible queries are already present and should bypass Playwright and CSS fallback logic

**If the recorder step uses `document.querySelector(...)`:**
- Keep the current Playwright resolver path and translate the selector into the best accessible query plus matcher
- Because this is the only part of the baseline that benefits from live DOM inspection

**If project tests look like `sample/sample-add-sale-test.ts`:**
- Extend convention scanning to learn helper shape, mock placement, and `within(...)` scoping from local TS/TSX tests
- Because the milestone target is codebase-aware structured RTL, not generic recorder replay output

**If no strong project conventions are found:**
- Fall back to the current generator defaults and emit focused TODOs for component import paths or fragile queries
- Because the generator must stay usable in repos with little or no existing test surface

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@babel/parser@7.29.x` | `@babel/traverse@7.29.x`, `@babel/types@7.29.x` | Keep Babel packages on the same minor to avoid AST type drift |
| `playwright@1.58.x` | `node>=18` | Matches the current resolver implementation and repo engine floor |
| `zod@3.24.x` | `typescript@5.7.x` | Good fit for runtime boundary validation without changing the repo’s type system |
| `vitest@3.0.x` | generated TS/TSX fixture tests | Enough for fixture/golden verification; no Jest addition is needed |

## Sources

- `/Users/michaelgichia/workspace/taro/.planning/PROJECT.md` — v1.3 goal, scope, and current/required behavior
- `/Users/michaelgichia/workspace/taro/src/core/js-parser.ts` — current JS ingestion collapses nested calls into shallow steps and records `document.querySelector` strings separately
- `/Users/michaelgichia/workspace/taro/src/cli/commands/generate.ts` — current JS pipeline entrypoint, Playwright selector resolution, and CLI/help text surface
- `/Users/michaelgichia/workspace/taro/src/core/generator.ts` and `/Users/michaelgichia/workspace/taro/src/templates/test-template.ts` — current generation remains linear and placeholder-based (`render(<App />)`), below the sample quality bar
- `/Users/michaelgichia/workspace/taro/src/core/scanner.ts` and `/Users/michaelgichia/workspace/taro/src/types/conventions.ts` — current conventions learning is useful but too shallow for helper and mocking structure
- `/Users/michaelgichia/workspace/taro/sample/sample-rest-recordingextension-output.js` and `/Users/michaelgichia/workspace/taro/sample/sample-add-sale-test.ts` — concrete baseline input and output quality target for this milestone
- `/Users/michaelgichia/workspace/taro/package.json` — existing dependency versions; confirms Babel parser/traverse, Playwright, Zod, Vitest, and TypeScript are already in the repo

---
*Stack research for: local-first Testing Library Recorder JS baseline ingestion and RTL generation*
*Researched: 2026-03-09*
