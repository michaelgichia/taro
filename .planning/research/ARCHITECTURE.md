# Architecture Research

**Domain:** Tayo v1.3 JS baseline ingestion and RTL generation architecture
**Researched:** 2026-03-09
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                               CLI / ENTRY                                 │
├────────────────────────────────────────────────────────────────────────────┤
│  generate.ts [M]  scanner.ts [E]  writer.ts [E]                           │
├────────────────────────────────────────────────────────────────────────────┤
│                           SOURCE INGESTION                                │
├────────────────────────────────────────────────────────────────────────────┤
│  input-loader.ts [N]                                                      │
│      ├── parser.ts [E/M]      Chrome Recorder JSON                        │
│      └── js-parser.ts [M]     Recorder JS AST extraction                  │
│               ↓                                                            │
│        baseline-normalizer.ts [N]                                         │
├────────────────────────────────────────────────────────────────────────────┤
│                              INTELLIGENCE                                 │
├────────────────────────────────────────────────────────────────────────────┤
│  recording-intelligence.ts [M]   resolver.ts [M]   mock-intelligence.ts [M]│
├────────────────────────────────────────────────────────────────────────────┤
│                        SUITE PLANNING / EMISSION                           │
├────────────────────────────────────────────────────────────────────────────┤
│  suite-planner.ts [N]  →  generator.ts [M]  →  test-template.ts [M]       │
├────────────────────────────────────────────────────────────────────────────┤
│                           QUALITY / OUTPUT                                │
├────────────────────────────────────────────────────────────────────────────┤
│  scorer.ts [E]  verifier.ts [E]  conventions merge [E]  history.json [E]  │
└────────────────────────────────────────────────────────────────────────────┘

Legend: [N] new in v1.3, [M] modified in v1.3, [E] existing and reused
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `generate` command | Own the shipped pipeline and keep CLI/help truthful for `.json` and recorder `.js` inputs | Thin Commander action that delegates to source loading, enrichment, generation, and write/verify steps |
| `input-loader` | Detect input format once and return a unified envelope so JS/JSON branching does not leak across the CLI | New small module that dispatches to `parseRecording()` or `parseJsRecording()` |
| `js-parser` | Recover recorder JS structure from Babel AST, including nested user events, assertions, and fallback selectors | Modified AST walker that emits a richer JS baseline artifact instead of flat string-only steps |
| `baseline-normalizer` | Convert JS baseline artifacts into the shared `NormalizedRecording` plus JS-only metadata for later stages | New translation layer between AST parsing and shared intelligence |
| `recording-intelligence` | Remove recorder noise and segment user intent using semantic step metadata rather than raw string matching alone | Modified heuristics that understand dialog opens, form edits, step transitions, and assertion anchors |
| `resolver` | Harden weak selectors into stable RTL queries and matchers, keyed to the specific JS step that needs them | Modified Playwright-backed resolver with per-step resolution results instead of loose arrays |
| `mock-intelligence` | Surface conventions, repeated mock targets, and mutation lifecycle cues that can shape generated helpers and assertions | Modified analysis output that remains read-only but becomes generator-facing |
| `suite-planner` | Turn analyzed steps, resolved queries, conventions, and mock context into helper blocks and focused `it()` cases | New planning layer that bridges from baseline transcript to `sample/sample-add-sale-test.ts`-style output |
| `generator` + templates | Render deterministic test files from a suite plan instead of directly from raw steps | Modified emitter that supports helpers, scoped queries, richer imports, and multiple tests |

## Recommended Project Structure

```text
src/
├── cli/
│   └── commands/
│       └── generate.ts                 # [modified] keep one shipped orchestration path
├── core/
│   ├── parser.ts                       # [modified] stays JSON-specific but plugs into shared loader
│   ├── js-parser.ts                    # [modified] AST -> rich JS baseline artifact
│   ├── input-loader.ts                 # [new] source detection + unified parsed envelope
│   ├── baseline-normalizer.ts          # [new] JS artifact -> NormalizedRecording + metadata
│   ├── recording-intelligence.ts       # [modified] semantic grouping and cleanup
│   ├── resolver.ts                     # [modified] step-anchored query/matcher hardening
│   ├── mock-intelligence.ts            # [modified] generation-facing mock summary
│   ├── suite-planner.ts                # [new] helper/test plan builder
│   ├── generator.ts                    # [modified] render from suite plans
│   ├── scorer.ts                       # [existing] quality scoring
│   ├── verifier.ts                     # [existing] syntax verification
│   └── writer.ts                       # [existing] file write behavior
├── templates/
│   └── test-template.ts                # [modified] helper functions, richer imports, scoped flows
└── types/
    └── recording.ts                    # [modified] JS baseline metadata and plan types
```

### Module Change Plan

| Module | Status | Why it changes in v1.3 |
|--------|--------|------------------------|
| `src/cli/commands/generate.ts` | Modified | Current shipping path contains hard-coded JS/JSON branching and console-only enrichment; it should orchestrate a shared pipeline |
| `src/core/js-parser.ts` | Modified | Current parser treats every `screen.getBy*` call as an `assert` and loses nested query context inside `userEvent.*` calls |
| `src/core/parser.ts` | Modified | Needs to participate in a shared input contract so downstream stages can stop caring about source format |
| `src/core/recording-intelligence.ts` | Modified | Current grouping is step-string based; JS baseline support needs semantic boundaries derived from AST/context |
| `src/core/resolver.ts` | Modified | Current query resolution is selector-list oriented; JS baseline support needs per-step resolution and matcher output |
| `src/core/mock-intelligence.ts` | Modified | Today it only summarizes repo patterns for logs; the suite planner needs structured signals for helper extraction and mutation assertions |
| `src/core/generator.ts` | Modified | Current generator emits direct step code and hard-codes `render(<App />)`; sample quality requires plan-driven helpers and multiple test cases |
| `src/templates/test-template.ts` | Modified | Templates need imports for `within`, `waitFor`, hooks, and helper bodies rather than only step lists |
| `src/types/recording.ts` | Modified | Existing `NormalizedStep` cannot represent nested query candidates, assertion intent, or suite-plan nodes cleanly |
| `src/core/input-loader.ts` | New | Prevents CLI branching from duplicating parse/setup logic |
| `src/core/baseline-normalizer.ts` | New | Gives JS baseline handling a dedicated place without polluting the JSON parser |
| `src/core/suite-planner.ts` | New | Separates architectural decisions from string emission, which the current generator cannot do well |

### Structure Rationale

- **`input-loader.ts`:** keep file-type detection and shared parse setup out of `generate.ts` so `.json` and `.js` stay symmetric.
- **`baseline-normalizer.ts`:** isolate JS-baseline-only translation from the stable JSON parser path.
- **`suite-planner.ts`:** make helper extraction and test splitting explicit instead of burying those choices in templates.
- **`core/orchestrator.ts`:** do not route v1.3 work through this older path; the active product surface is `src/cli/commands/generate.ts`.
- **`src/analyzer/mocks/*` and `src/generator/mocks/*`:** keep these as future-facing experiments unless a specific v1.3 requirement needs them; the active CLI already integrates `core/mock-intelligence.ts`.

## Architectural Patterns

### Pattern 1: Dual-Source Ingestion, Single Normalized Contract

**What:** parse JSON and recorder JS differently up front, then converge into a shared recording contract plus optional JS-specific artifacts.
**When to use:** always for v1.3, because JSON must not regress while JS becomes first-class.
**Trade-offs:** adds a small envelope type, but keeps the rest of the pipeline from turning into source-specific `if` ladders.

**Example:**
```typescript
type ParsedInput =
  | { source: 'json'; recording: NormalizedRecording }
  | {
      source: 'js'
      recording: NormalizedRecording
      baseline: JsBaselineArtifacts
    }

const parsed = await loadInput(filePath, rawContent)
const analyzed = analyzeRecording(parsed.recording, parsed.source === 'js' ? parsed.baseline : undefined)
```

### Pattern 2: Parser -> Intelligence -> Suite Plan -> Emitter

**What:** insert an explicit planning layer between enrichment and string generation.
**When to use:** whenever the target output needs helpers, separate tests, or scoped assertions like `sample/sample-add-sale-test.ts`.
**Trade-offs:** more internal types to maintain, but much easier to test than trying to teach `generator.ts` to infer structure from raw step arrays.

**Example:**
```typescript
const suitePlan = buildSuitePlan({
  analyzedRecording,
  resolvedQueries,
  mockAnalysis,
  conventions,
})

const generated = generateTestFromPlan(suitePlan, { outputPath })
```

### Pattern 3: Step-Anchored Query Resolution

**What:** every weak query candidate carries a stable step id, and resolver output is keyed by that id.
**When to use:** for `document.querySelector(...)`, generic `getByText(...)`, or nested query expressions that need hardening.
**Trade-offs:** extra metadata plumbing, but it removes fragile line-number and selector-order coupling.

**Example:**
```typescript
interface ResolvedQueryMap {
  [stepId: string]: {
    query: string
    matcher?: string
    quality: QueryQuality
  }
}
```

## Data Flow

### Request Flow

```text
[tayo generate baseline.js]
    ↓
[generate.ts]
    ↓
[input-loader.ts]
    ↓
[parseJsRecording() or parseRecording()]
    ↓
[baseline-normalizer.ts for JS only]
    ↓
[analyzeRecording()]
    ↓
[resolver + mock-intelligence + conventions scan]
    ↓
[suite-planner.ts]
    ↓
[generator.ts + test-template.ts]
    ↓
[score → verify → write → merge conventions]
```

### State Management

```text
[ParsedInput]
    ↓
[AnalyzedRecording]
    ↓ combine with
[ResolvedQueryMap] + [MockAnalysis] + [ConventionsSchema]
    ↓
[SuitePlan]
    ↓
[GeneratedTest]
    ↓
[ScoreResult] + [history.json] + [convention updates]
```

### Key Data Flows

1. **JS baseline ingestion:** Babel AST recovers nested `userEvent(screen.getBy...)`, `expect(...)`, `page.goto(...)`, and `document.querySelector(...)` usage into typed baseline artifacts instead of flat text.
2. **Intent recovery:** `baseline-normalizer.ts` and `recording-intelligence.ts` turn raw recorder order into modal/dialog transitions, field-entry phases, review/save boundaries, and assertion checkpoints.
3. **Query hardening:** `resolver.ts` upgrades weak CSS or generic text targets into stable RTL queries and matchers that the generator can trust.
4. **Mock-aware planning:** `mock-intelligence.ts` contributes repo-specific patterns so generated helpers and assertions match the local test style instead of acting as console-only hints.
5. **Structured emission:** `suite-planner.ts` chooses helpers and test boundaries before `generator.ts` renders code, bringing output closer to the sample quality bar.

## Build Order

1. **Types and shared contracts first.**
   Extend `src/types/recording.ts` with step ids, query candidates, assertion intent, source metadata, and suite-plan types. Add `src/core/input-loader.ts` so all later work targets one parsed-input shape.
2. **Fix JS parsing before touching generation.**
   Modify `src/core/js-parser.ts` so nested `screen.getBy*` inside `userEvent.*` are captured as action targets, direct assertions stay assertions, and `document.querySelector(...)` usage stays attached to the originating step. Keep `src/core/parser.ts` unchanged except for the shared loader contract.
3. **Add JS normalization and semantic recording intelligence.**
   Create `src/core/baseline-normalizer.ts`, then update `src/core/recording-intelligence.ts` to use the richer metadata for group boundaries and noise cleanup.
4. **Upgrade query resolution to be step-based.**
   Modify `src/core/resolver.ts` so it returns a map keyed by step id with hardened query strings and matcher hints. Wire the resolver after recording analysis, not directly off raw AST output.
5. **Introduce suite planning.**
   Add `src/core/suite-planner.ts` and keep it responsible for helper extraction, `it()` splitting, and mapping repo conventions onto the planned output.
6. **Refit generation and templates around the suite plan.**
   Modify `src/core/generator.ts` and `src/templates/test-template.ts` to emit helpers, `within(...)` scoping, `waitFor(...)`, and multiple focused tests. Only after this exists should the CLI switch JS generation to the new emitter path.
7. **Make mock analysis generation-facing.**
   Modify `src/core/mock-intelligence.ts` so its output can influence suite planning, especially mutation flow assertions and whether setup is shared or inline. Do not revive `src/generator/mocks/builder.ts` for v1.3 unless the milestone expands into actual mock file generation.
8. **Finish with CLI/help/docs/tests.**
   Update `src/cli/commands/generate.ts` descriptions and messaging so `.js` support is truthful, then expand `js-parser`, `resolver`, and `generator` tests with sample-based fixtures.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single recording in a small repo | Full convention scan plus one Playwright session per run is acceptable |
| Repeated recordings in a medium repo | Cache conventions and mock summaries in `.tayo`, and dedupe selector inspection across steps sharing the same fallback selector |
| Large monorepo or CI batch usage | Add scan-root narrowing and avoid repeated browser launches; the planner/emitter split makes batch generation safer than a monolithic generator |

### Scaling Priorities

1. **First bottleneck:** repo scanning in `scanner.ts` and `mock-intelligence.ts`; fix with caching and narrowed scan roots before optimizing AST work.
2. **Second bottleneck:** repeated Playwright lookups for many weak selectors; fix by resolving unique selectors once per run and storing results by step id.

## Anti-Patterns

### Anti-Pattern 1: Treat Every `screen.getBy*` Call as an Assertion

**What people do:** flatten every `screen.getBy*` occurrence in recorder JS into `action: 'assert'`.
**Why it's wrong:** recorder exports use those queries as action targets inside `userEvent.click(...)`, `userEvent.type(...)`, and `expect(...)`; flattening loses the relation between action, target, and assertion.
**Do this instead:** keep a JS artifact that records the enclosing call context, then normalize it into shared steps with attached query metadata.

### Anti-Pattern 2: Generate Directly From Raw Steps

**What people do:** map `NormalizedStep[]` straight to `stepTemplate()` output and hope grouping heuristics will create maintainable tests.
**Why it's wrong:** the current output stays transcript-like, cannot express helpers cleanly, and cannot reach the structure shown in `sample/sample-add-sale-test.ts`.
**Do this instead:** build a `SuitePlan` first, then render code from that plan.

### Anti-Pattern 3: Build v1.3 On the Wrong Internal Branch

**What people do:** wire new JS work through `src/core/orchestrator.ts` or the dormant mock-builder pipeline because those modules look more ambitious.
**Why it's wrong:** the shipped CLI path is `src/cli/commands/generate.ts`, and diverging from it would create two architectures instead of improving the one users run.
**Do this instead:** keep v1.3 changes on the active `generate` path and only reuse dormant modules if they become directly necessary.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Testing Library Recorder JS export | Read file, parse with Babel AST, normalize to shared recording types | Must preserve nested `userEvent(...)` target queries and `@jest-environment-options` URL |
| Chrome Recorder JSON export | Existing `parseRecording()` path | Must remain behaviorally stable during v1.3 |
| Running local app at recorded URL | Optional Playwright inspection in `resolver.ts` and visual capture | Used to harden `document.querySelector(...)` fallbacks, not to execute the recorder transcript as a final test |
| Project test corpus | `scanner.ts` and `mock-intelligence.ts` filesystem scan | Supplies conventions, mock style, and mutation lifecycle signals |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `generate.ts` ↔ `input-loader.ts` | direct function call | CLI remains thin and truthful about supported inputs |
| `js-parser.ts` ↔ `baseline-normalizer.ts` | typed JS artifact | Keeps AST concerns out of shared recording intelligence |
| `baseline-normalizer.ts` ↔ `recording-intelligence.ts` | `NormalizedRecording` plus JS metadata | Shared cleanup should stay source-agnostic where possible |
| `recording-intelligence.ts` ↔ `resolver.ts` | step ids + weak query candidates | Resolution should improve specific steps, not global selector arrays |
| `mock-intelligence.ts` ↔ `suite-planner.ts` | structured mock summary | Planner decides how mock cues affect helper/test layout |
| `suite-planner.ts` ↔ `generator.ts` | suite plan AST | Generator should render, not infer architecture |

## Sources

- `.planning/PROJECT.md`
- `src/cli/commands/generate.ts`
- `src/core/parser.ts`
- `src/core/js-parser.ts`
- `src/core/recording-intelligence.ts`
- `src/core/resolver.ts`
- `src/core/mock-intelligence.ts`
- `src/core/generator.ts`
- `src/templates/test-template.ts`
- `src/core/js-parser.test.ts`
- `src/core/generator.test.ts`
- `sample/sample-rest-recordingextension-output.js`
- `sample/sample-add-sale-test.ts`

---
*Architecture research for: Tayo v1.3 JS baseline generation pipeline*
*Researched: 2026-03-09*
