# Phase 13 Research: JS Input Contract & AST Recovery

## Phase Scope

**Goal:** users can feed recorder JS exports into the normal generation flow and have Tayo recover baseline intent instead of replaying raw transcript code.

**This phase must satisfy:**
- `INPUT-01`: `.js` input works through the same `tayo generate <file>` flow and flags as JSON.
- `INPUT-02`: output is regenerated RTL-shaped code, not a copied-through recorder transcript.
- `INPUT-03`: supported recorder JS patterns become stable baseline metadata.
- `QUERY-01`: accessible query intent is preserved when the recorder export already contains it.

**This phase should not absorb later work:**
- Do not solve truthful selector strengthening policy here. Phase 14 owns when and how raw CSS selectors become stronger queries.
- Do not solve final suite planning, render-target resolution, or repo-aware helper extraction here. Phase 15 owns that.
- Do not treat live browser inspection as required for baseline usefulness. Phase 13 should be useful offline from AST recovery alone.

## What The Plan Must Lock In

1. There must be one shipped input contract for `.json` and `.js`, even if the parse step differs.
2. JS parsing must emit a richer intermediate artifact than `NormalizedStep[]`.
3. Nested recorder expressions must be recovered structurally, not via string slicing.
4. Accessible query evidence must survive parsing and normalization with enough fidelity for later phases to reuse.
5. Phase 13 must preserve future-phase hooks now: stable step IDs, query/assertion descriptors, fallback selector evidence, and recorded URL metadata.

## Current Repo Reality

### The CLI already accepts JS, but through a separate branch

`src/cli/commands/generate.ts` branches on `.js` or `@jest-environment-options` (`isJsFormat`) and runs a JS-specific path before the JSON pipeline (`src/cli/commands/generate.ts:342`). That branch already honors `--dry-run`, `--output`, and `--force`, which is a good base for `INPUT-01`, but it is still architecturally separate from the JSON flow.

Why this matters for planning:
- Phase 13 does not need a new command surface.
- Phase 13 does need a shared loader/envelope so source-specific branching stops leaking through the rest of the pipeline.

### The current JS parser loses recorder intent

`src/core/js-parser.ts` currently walks `CallExpression`s and emits flat `NormalizedStep`s:
- every `screen.getBy*` call becomes an `assert` step (`src/core/js-parser.ts:211`)
- every `userEvent.*` target is extracted only if the first argument is a raw string/template literal (`src/core/js-parser.ts:247`)
- `document.querySelector(...)` is stored separately as `querySelectorCalls` (`src/core/js-parser.ts:233`)
- `expect(...)` assertions are not recovered at all
- title extraction relies on a doc-comment regex instead of the real `test(...)` title (`src/core/js-parser.ts:188`)

This is the core Phase 13 gap. Real recorder JS uses nested expressions like:
- `await userEvent.click(screen.getByRole(...))`
- `await userEvent.type(screen.getByText(...), '1')`
- `await userEvent.click(document.querySelector(...))`
- `expect(location.href).toBe(...)`
- `expect(document.title).toBe(...)`

The current parser collapses those into shallow steps and drops the relation between action, target, and assertion context.

### The normalized types are too flat for JS baseline recovery

`src/types/recording.ts` is built around `NormalizedStep` with `target`, `value`, `selector`, and `metadata` (`src/types/recording.ts:66`). That is enough for JSON step normalization, but not enough to faithfully represent:
- query method plus options
- accessible role/name pairs
- placeholder/text intent
- whether a query was used as an action target or as an assertion subject
- fallback selector evidence
- recorded URL/title assertions

Planning implication: Phase 13 should not keep forcing JS AST output directly into `NormalizedStep`.

### Downstream grouping currently amplifies parser mistakes

`src/core/recording-intelligence.ts` flushes intent groups on every `assert` (`src/core/recording-intelligence.ts:142`). Because the JS parser currently turns every `screen.getBy*` call into an `assert`, parser errors become grouping errors. This is why Phase 13 needs truthful recovery before later phases attempt better suite structure.

### Current test coverage is too toy-level

`src/core/js-parser.test.ts` only proves:
- query quality classification
- simple group splitting
- parsing of a toy JS snippet with `userEvent.click('Save')` and `screen.getByText('Saved')`

It does not cover the real recorder shapes present in `sample/sample-rest-recordingextension-output.js`.

## Recorder Shapes Phase 13 Must Recover

From `sample/sample-rest-recordingextension-output.js`, the baseline parser needs to handle these categories:

### 1. File-level metadata
- `@jest-environment-options` URL comment
- CommonJS import style from recorder exports
- actual `test('...')` title

### 2. Action expressions
- `userEvent.click(...)`
- `userEvent.dblClick(...)`
- `userEvent.type(..., value)`
- repeated clicks on the same element

### 3. Accessible query targets
- `screen.getByRole('button', { name: 'Add Sale (Invoice)' })`
- `screen.getByText('Enter quantity')`
- other `screen.getBy*` variants already classified by `classifyQuery()`

### 4. Fallback selector targets
- `document.querySelector('div.css-19bb58m')`
- deeper CSS selectors for spinner/input/cart rows

### 5. Assertion context
- `expect(location.href).toBe(...)`
- `expect(document.title).toBe(...)`
- future-friendly support for `expect(screen.getBy...)).matcher(...)` even if the sample does not yet use it heavily

## Recommended Architecture For Phase 13

### 1. Introduce a shared parsed-input envelope

Add a small loader module, likely `src/core/input-loader.ts`, that detects source type once and returns a unified result.

Recommended shape:

```ts
type ParsedInput =
  | {
      source: 'json'
      recording: NormalizedRecording
    }
  | {
      source: 'js'
      recording: NormalizedRecording
      baseline: JsBaselineArtifact
    }
```

Why this is the right Phase 13 move:
- keeps `generate.ts` on the active shipped path
- preserves JSON behavior
- prevents downstream `if (isJsFormat)` branching from spreading further
- gives Phase 14 a stable place to consume JS-only selector evidence

### 2. Add a JS-specific baseline artifact instead of overloading `NormalizedStep`

Preferred approach: parse JS into a dedicated artifact, then normalize it into the shared recording shape.

Recommended artifact concepts:
- `JsBaselineArtifact`
- `JsRecoveredStep`
- `QueryDescriptor`
- `AssertionDescriptor`
- `ActionTarget`

Minimum fields the plan should require:
- stable `id` per recovered step
- `line` for traceability
- `kind`: action, assertion, navigation, sync, unknown
- `action`: click, fill, select, navigate, keyDown, assert
- `target`: structured target, not just a string
- `query`: method, quality, primary text, role, accessible name, placeholder, raw options
- `selector`: original CSS selector when fallback evidence exists
- `assertion`: subject + matcher + expected value when present
- `source`: `'js'`
- `rawExpression` or equivalent debug payload for diagnostics

Planning stance:
- keep `NormalizedRecording` as the downstream lingua franca
- do not force the JSON parser to understand AST-specific details
- preserve JS-only metadata alongside or inside normalization output for later phases

### 3. Recover nested AST context explicitly

Phase 13 should treat nested call recovery as the main implementation problem.

Recommended recovery rules:
- `userEvent.click(screen.getByRole(...))`
  - recover one action step
  - action = `click`
  - target.query = `{ method: 'getByRole', role: 'button', name: 'Add Sale (Invoice)' }`
- `userEvent.type(screen.getByText('Enter quantity'), '1')`
  - recover one fill step
  - target.query = `{ method: 'getByText', text: 'Enter quantity' }`
  - value = `'1'`
- `userEvent.click(document.querySelector('...'))`
  - recover one action step
  - target.selector = original CSS selector
  - do not strengthen it in Phase 13
- `expect(location.href).toBe(url)`
  - recover one assertion step or assertion descriptor
  - classify as environment/navigation context
- `expect(document.title).toBe(title)`
  - recover one assertion step or assertion descriptor
  - keep it distinct from visible UI assertions

Implementation note:
- `@babel/types` is the missing dependency that makes this recovery safer and easier to test.

### 4. Normalize JS artifact into the shared recording contract

Add a dedicated normalizer, likely `src/core/baseline-normalizer.ts`, responsible for translating `JsBaselineArtifact` into `NormalizedRecording` plus preserved JS metadata.

That normalizer should:
- map recovered action/assertion/navigation steps into `NormalizedStep`
- assign stable `id`s used later by resolver/scorer
- preserve accessible query intent in metadata instead of flattening to `target: string`
- carry through fallback selector evidence without pretending it is already a strong RTL query
- preserve recorded URL metadata

This is the cleanest way to satisfy `INPUT-02` and `INPUT-03` without polluting `src/core/parser.ts`.

### 5. Keep scope disciplined around Phase 13 boundaries

Phase 13 should prepare later work, not pre-implement it.

Do now:
- truthful AST recovery
- stable normalized contract
- preserved accessible query/assertion evidence
- CLI integration parity with JSON flow
- validation for real recorder exports

Do later:
- selector strengthening from CSS to accessible queries
- browser-backed fallback resolution policy
- final suite splitting and helper extraction
- score/write gating changes

## Concrete Repo Seams

### `src/cli/commands/generate.ts`

Plan to refactor this file so:
- file detection and parsing move behind a shared loader
- JS and JSON both feed a common orchestration path
- JS-specific enrichment hooks consume `baseline` metadata rather than raw `querySelectorCalls`

Important current seam details:
- command description still says “Chrome Recorder export” and argument text still says “JSON export file”
- JS branch currently runs from `isJsFormat` through an early `return`
- selector resolution is currently keyed off `querySelectorCalls` only
- parser-computed `itGroups` are not the real control seam today because the CLI rebuilds groups from `analyzeRecording()`

### `src/core/js-parser.ts`

This is the main Phase 13 implementation site.

Expected changes:
- replace `any`-heavy node inspection with `@babel/types` guards
- parse `test(...)` title directly
- recover nested query operands from `userEvent.*`
- recover `expect(...)` assertions
- distinguish action targets from assertion subjects
- return a richer artifact than `steps + querySelectorCalls + itGroups`

### `src/core/parser.ts`

Leave JSON parsing narrow. The only planned change should be participation in the shared loader/envelope contract. Do not mix AST-specific logic into the JSON parser.

### `src/types/recording.ts`

This file needs new types for:
- JS baseline artifacts
- structured query descriptors
- structured assertion descriptors
- stable step IDs that both JS and JSON can share downstream

### `src/core/recording-intelligence.ts`

Phase 13 should touch this only enough to ensure recovered JS assertions and sync steps do not explode grouping again. The main fix is upstream truthfulness; grouping heuristics should remain mostly unchanged until Phase 15.

### `src/core/js-parser.test.ts`

This test file should stop being toy-only. It should become the primary regression harness for real recorder JS AST recovery.

### `sample/sample-rest-recordingextension-output.js`

Use this as the canonical golden fixture for Phase 13. It already contains the important pattern mix:
- accessible queries
- repeated user events
- fallback selectors
- environment URL
- assertion context

## Recommended Plan Slices

### Slice 1: Shared input contract and type additions

Deliverables:
- parsed-input envelope
- JS baseline types
- stable step IDs
- JSON path still normalizes unchanged

Why first:
- every later slice depends on agreed contracts
- this is where scope can be kept clean between Phases 13, 14, and 15

### Slice 2: AST recovery for recorder JS

Deliverables:
- nested `userEvent(...)` target recovery
- `screen.getBy*` descriptor extraction
- `document.querySelector(...)` fallback capture
- `expect(...)` assertion recovery
- title and environment URL recovery

Why second:
- this is the actual `INPUT-03` and `QUERY-01` work
- it removes the main source of false downstream grouping

### Slice 3: Normalization and CLI integration

Deliverables:
- JS artifact normalized into `NormalizedRecording`
- `generate.ts` uses shared loader path
- `.js` stays compatible with `--dry-run`, `--output`, `--force`
- baseline metadata is available to later selector/generation phases

Why third:
- this is where `INPUT-01` and `INPUT-02` become true in the shipped flow

### Slice 4: Golden fixtures and regression coverage

Deliverables:
- parser fixtures based on the real sample export
- integration coverage for `tayo generate sample.js --dry-run`
- JSON regression coverage proving no breakage

Why fourth:
- Phase 13 is too parser-sensitive to trust only unit tests on helper functions

## Dependencies And Design Constraints

### Recommended dependency addition

- Add `@babel/types`

Rationale:
- the repo already has `@babel/parser` and `@babel/traverse`
- current AST handling relies on loose `any`
- nested operand recovery is much safer with explicit Babel node guards

### Existing dependencies to reuse

- `@babel/parser`
- `@babel/traverse`
- `zod` if the team wants a runtime validation boundary for `JsBaselineArtifact`

### Constraint to protect

Do not make Playwright, live URLs, or browser launch success part of Phase 13 baseline correctness. The parser must still recover truthful intent from a `.js` file on its own.

## Risks To Call Out In Planning

### Risk 1: Nested query flattening survives the refactor

If the plan only tweaks string extraction, the parser will still lose the relation between `userEvent.*` and nested query operands.

Mitigation:
- require AST helper functions that operate on node shape, not string values
- validate against the real sample export

### Risk 2: JSON and JS diverge further

If Phase 13 keeps the current JS-only orchestration branch, later phases will duplicate resolver, scorer, and generator work.

Mitigation:
- make shared input loading a first-class deliverable

### Risk 3: Phase 14 work leaks in early

It will be tempting to solve selector strengthening immediately once `document.querySelector(...)` is recovered.

Mitigation:
- Phase 13 should preserve fallback selector evidence truthfully and stop there

### Risk 4: Phase 15 work leaks in early

It will be tempting to “fix” bad output by changing suite planning and helper generation before AST recovery is correct.

Mitigation:
- keep this phase focused on baseline fidelity and contract quality
- let later phases consume better metadata

## Open Questions The Plan Should Resolve Early

1. Should `expect(location.href)` and `expect(document.title)` normalize into explicit `assert` steps, or remain as JS-only metadata consumed later by generation?
2. Where should JS-only metadata live after normalization: dedicated sidecar object on `ParsedInput`, or optional fields on `NormalizedStep.metadata`?
3. Do step IDs become mandatory for JSON too in Phase 13, or are they introduced only for JS and generalized later?
4. Is `zod` validation for `JsBaselineArtifact` worth adding now, or should compile-time types plus fixture tests be enough for this phase?

## Validation Architecture

### Unit validation

Add parser-focused tests around small AST cases for:
- `userEvent.click(screen.getByRole(...))`
- `userEvent.type(screen.getByText(...), '1')`
- `userEvent.click(document.querySelector(...))`
- `expect(location.href).toBe(...)`
- `expect(document.title).toBe(...)`
- title extraction from `test('...')`

Target file:
- `src/core/js-parser.test.ts`

### Golden fixture validation

Promote `sample/sample-rest-recordingextension-output.js` into a golden parser fixture.

Assertions should verify that the recovered baseline artifact preserves:
- action order
- query method and quality
- accessible name / text / placeholder evidence
- original fallback selectors
- environment URL
- assertion context

### Integration validation

Add integration coverage for the actual CLI path:
- `.js` input with `--dry-run`
- `.js` input with custom `--output`
- overwrite behavior with `--force`

The important assertion is not just “command succeeds”; it is that JS input goes through the same public flow shape as JSON.

### Regression validation

Keep JSON parity explicit:
- existing JSON parser tests stay green
- shared loader tests confirm source detection, not behavior drift
- JS support must not require Playwright for baseline parsing to pass

### Phase-boundary validation

Add explicit assertions that Phase 13 does **not** do Phase 14 work:
- `document.querySelector(...)` is preserved as fallback evidence
- unresolved selectors are not silently upgraded during AST recovery
- live DOM inspection is optional and outside parser correctness

## Bottom Line

Phase 13 should be planned as a contract-and-parser phase, not a generation polish phase. The critical success move is to recover truthful JS baseline structure into a stable shared input contract, then normalize it cleanly so later phases can handle selector truthfulness and suite quality without building on lossy data.
