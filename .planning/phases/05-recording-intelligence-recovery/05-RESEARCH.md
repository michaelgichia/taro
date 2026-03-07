# Phase 5: Recording Intelligence Recovery - Research

**Researched:** 2026-03-07
**Domain:** Chrome Recorder noise reduction, intent inference heuristics, pre-generation analysis pipeline
**Confidence:** HIGH

<user_constraints>
## User Constraints

### Locked Decisions

**Phase Goal**
- Restore the missing recording-intelligence layer so Taro filters noisy recorder input and infers user intent before query generation
- This phase closes REC-01, REC-02, REC-03, and REC-04 from the milestone audit

**Audit-Derived Scope**
- The original Phase 2 recording-intelligence scope was never implemented
- The current milestone audit identifies the broken flow as preprocessing between raw recording ingestion and generation
- Gap closure must be honest: requirements should only be marked complete once filtering and intent reduction are implemented and verified

**Current Codebase Constraints**
- `src/core/parser.ts` converts Chrome Recorder steps directly into `NormalizedStep[]`
- `src/core/parser.ts` maps `doubleClick` to `click`, which loses the distinction needed to filter dblClick noise intentionally
- `src/types/recording.ts` currently drops recorder metadata needed for noise heuristics: offsets, coordinates, asserted events, and selector variants are not preserved in `NormalizedStep`
- `src/cli/commands/generate.ts` has two input paths:
  - JSON export path using `parseRecording()` and `generateTest()`
  - JS recorder path using `parseJsRecording()` and `generateTestFromGroups()`
- Phase 5 must not regress either path while adding a shared place for recording cleanup before generation

### Claude's Discretion
- Exact type names for richer recorder metadata
- Whether the analysis layer mutates `NormalizedRecording` or returns a new analyzed recording shape
- Console reporting format for filtered-step summaries
- Whether JSON and JS inputs share one analyzer implementation or a shared interface with source-specific adapters

### Deferred Ideas
- Screenshot-based validation of ambiguous steps belongs to Phase 6, not this phase
- Mock extraction and mock lifecycle reasoning belong to Phase 6, not this phase
- Perfect semantic intent understanding is not required; deterministic heuristics that improve noisy recordings are sufficient for v1 gap closure
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REC-01 | Filter redundant clicks | Requires preserving enough target identity and adjacency context to consolidate repeated clicks on the same element |
| REC-02 | Filter dblClick noise | Requires distinguishing intentional double-clicks from recorder duplication and avoiding the current unconditional `doubleClick -> click` collapse |
| REC-03 | Filter cursor wandering | Requires preserving coordinate/offset metadata long enough to identify pointer movement noise and non-semantic scroll churn |
| REC-04 | Identify actual user intent behind sequences | Requires a deterministic post-filter grouping layer that collapses low-level step bursts into higher-level intent-oriented action groups before generation |
</phase_requirements>

---

## Summary

Phase 5 needs a **new analysis layer between parsing and generation**. The current parser normalizes too early: it turns raw Chrome Recorder events into a small `NormalizedStep` shape and drops the recorder metadata that makes noise filtering possible. Because of that, REC-01 through REC-03 cannot be solved cleanly inside `generate.ts` or `generator.ts`; they need a dedicated recording-intelligence module that runs immediately after parsing.

The current code already shows the right insertion point. Both CLI flows converge on "parsed recording -> generated test". Phase 5 should change that to "parsed recording -> analyzed recording -> generated test". For Chrome Recorder JSON input, the analyzer must preserve and inspect raw event details such as step type, target, coordinates, offsets, and asserted events. For JS recorder input, the analyzer can operate on a reduced signal set, but the phase should define the same interface so future phases can reuse it without branching the pipeline again.

The highest-risk design issue is **data loss at normalization time**. Today, `normalizeStep()` maps `doubleClick` to `click` and omits spatial metadata entirely. That means Phase 5 either has to enrich `NormalizedStep` with recorder metadata or introduce a richer "analyzable step" type that wraps normalized actions with raw step evidence. The second option is cleaner because it keeps generation-oriented consumers simple while allowing the intelligence layer to reason from source data.

The implementation should be split into three responsibilities:

1. **Recorder analysis types and step enrichment**
   - Preserve source metadata needed for heuristics.
   - Keep normalized generation fields available.
   - Expose analysis diagnostics so later phases can reuse them.

2. **Noise filtering**
   - Consolidate duplicate or rapid repeated clicks on the same target.
   - Treat `doubleClick` and related multi-click bursts intentionally rather than flattening them blindly.
   - Remove pointer wandering and other non-semantic movement events before generation.

3. **Intent reduction**
   - Collapse cleaned step sequences into intent-aware groups such as "open dialog", "fill field", "submit form", "confirm visible state".
   - Preserve enough traceability that generated tests can still emit stable low-level actions while the planner and verifier can prove higher-level intent inference happened.

**Primary recommendation:** add a dedicated `src/core/recording-intelligence.ts` module plus supporting types and tests, then wire that module into `src/cli/commands/generate.ts` for both JSON and JS paths. Keep parser modules focused on parsing, and keep generator modules focused on code emission.

---

## Current-State Findings

### Finding 1: Normalization currently destroys analysis signals

`src/core/parser.ts` converts raw `ChromeStep` input directly to:

- `action`
- `target`
- `value`
- `originalType`

That is sufficient for code generation, but insufficient for:

- duplicate-click consolidation
- distinguishing `click` vs `doubleClick`
- tracking cursor motion noise
- understanding whether an assertion finalizes a user-intent sequence

### Finding 2: The JSON path is where REC gaps are most visible

The JSON parser is the only place that currently has access to:

- recorder coordinates (`x`, `y`)
- offsets (`offsetX`, `offsetY`)
- viewport-like metadata (`width`, `height`, `deviceScaleFactor`)
- asserted events

If Phase 5 does not preserve these signals before normalization completes, REC-02 and REC-03 will remain unimplementable.

### Finding 3: The JS path should share the interface even if heuristics are lighter

The JS parser already turns `dblClick` and `tripleClick` into click-like actions, and it lacks geometry data. That means Phase 5 cannot deliver the exact same heuristics for JS input. Still, the CLI should call the same analysis stage for both inputs so:

- the pipeline stays uniform
- analysis summaries can be emitted consistently
- future visual/mock intelligence can attach to the same analyzed recording contract

### Finding 4: Verification should be mostly automated

The project already has fast Vitest coverage and phase-specific module tests. Phase 5 should add a dedicated `src/core/recording-intelligence.test.ts` suite and keep CLI integration verification to a minimal manual pass using a synthetic noisy recording fixture.

---

## Recommended Architecture

### Project Structure Extension

```text
src/
├── cli/
│   └── commands/
│       └── generate.ts                # Integrate analyzeRecording() before generation
├── core/
│   ├── parser.ts                      # Preserve richer metadata for JSON recordings
│   ├── js-parser.ts                   # Optionally tag source metadata for JS recordings
│   ├── recording-intelligence.ts      # NEW: filtering + intent reduction
│   ├── generator.ts                   # Consume cleaned steps without owning heuristics
│   └── ...
├── types/
│   └── recording.ts                   # Extend with analyzable/intelligence-aware step types
└── ...
```

### Pattern 1: Separate "parsed" from "analyzed"

Recommended model:

- `parseRecording()` / `parseJsRecording()` produce an analyzable recording with raw evidence preserved
- `analyzeRecording()` produces:
  - cleaned steps for generation
  - diagnostics about removed or consolidated steps
  - intent groups or annotations for REC-04

This separation prevents parser logic from becoming a heuristic dumping ground and gives Phase 7 a clean verification seam.

### Pattern 2: Deterministic, rule-based heuristics

Use explicit heuristics rather than probabilistic inference:

- same target + adjacent clicks + no intervening semantic action => redundant click cluster
- `doubleClick` / `dblClick` => separate multi-click cluster classification, not automatic flattening
- coordinate-bearing steps with no semantic DOM target change => candidate cursor wandering
- click/fill/assert bursts that end in an assertion or submit action => intent boundary

Rule-based behavior is easier to test, easier to explain in summaries, and matches the repo's current deterministic style.

### Pattern 3: Diagnostics are first-class output

The analyzer should return structured diagnostics such as:

- `removedRedundantClicks`
- `removedDoubleClickNoise`
- `removedCursorWander`
- `intentGroups`

That gives:

- unit-testable evidence for REC requirements
- optional console summaries in `generate.ts`
- reusable inputs for future visual/mock intelligence

---

## Implementation Guidance

### Types

Recommended additions in `src/types/recording.ts`:

- a source enum or string literal for `json` vs `js`
- a richer step interface that preserves:
  - `selectors`
  - `assertedEvents`
  - `offsetX`, `offsetY`, `x`, `y`
  - optional line/source metadata for JS
- an analyzed recording result containing:
  - `title`
  - `rawStepCount`
  - `filteredStepCount`
  - `steps`
  - `diagnostics`
  - optional `intentGroups`

Avoid overloading the existing `NormalizedStep` with too many optional fields if it makes generation code ambiguous. A dedicated analyzed type is clearer.

### Parser changes

`src/core/parser.ts` should stop flattening away useful metadata. At minimum:

- preserve `doubleClick` as distinguishable source evidence
- carry selector and geometry metadata forward
- keep `NormalizedAction` stable for downstream generation

`src/core/js-parser.ts` should expose enough source metadata for interface compatibility, even if geometry stays unavailable.

### Recording-intelligence module

`src/core/recording-intelligence.ts` should likely export:

- `clusterRedundantClicks(...)`
- `filterNoiseSteps(...)`
- `inferIntentGroups(...)`
- `analyzeRecording(...)`

The public API should stay narrow. The CLI should call `analyzeRecording()`, while tests can exercise the lower-level helpers directly.

### CLI integration

`src/cli/commands/generate.ts` should:

1. parse the source input
2. analyze the parsed recording
3. log a brief cleanup summary when steps are removed or consolidated
4. pass analyzed steps to generation
5. preserve existing scoring and post-write verification behavior

That ordering keeps Phase 4 guarantees intact.

---

## Testing Strategy

### Automated

Add `src/core/recording-intelligence.test.ts` covering:

- REC-01: repeated click cluster on same target collapses to one semantic click
- REC-02: `doubleClick` or rapid duplicate multi-click noise is reduced intentionally
- REC-03: movement-only or coordinate-drift steps are dropped
- REC-04: cleaned step sequences are grouped into stable intent units
- diagnostics reflect removed and retained counts

Also extend existing parser or CLI tests if needed to prove metadata preservation and integration ordering.

### Manual

Run `taro generate` against a noisy JSON fixture and verify:

- output contains fewer meaningless clicks
- intent-critical actions remain present
- scoring/post-write verification still run

One manual pass is enough if unit coverage proves the heuristics.

---

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Over-filtering removes intentional actions | Generated tests could miss real user behavior | Keep heuristics adjacency-based and conservative; add explicit regression tests for retained clicks |
| Type churn leaks into generator code | Phase 5 could destabilize working generation | Introduce analyzed types that preserve current generation-friendly fields |
| JSON-only solution creates future branching debt | Later phases would need different pipelines | Use one analyzer interface for both JSON and JS, even if JS analysis is initially shallow |
| REC-04 becomes vague or subjective | Hard to verify requirement completion honestly | Define deterministic intent boundaries and diagnostics up front |

---

## Validation Architecture

Phase 5 should be Nyquist-compliant with **fast unit feedback after each task** and a **phase-level build + targeted test pass** after each wave.

Recommended verification contract:

- Quick loop: `npm run test:run -- src/core/recording-intelligence.test.ts`
- Parser/integration regression loop:
  - `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts`
- Build gate: `npm run build`

Wave 0 should create the new `recording-intelligence` tests first so every later task lands against executable expectations rather than manual reasoning.

Manual verification can be limited to one CLI run against a synthetic noisy recording fixture to confirm the pipeline order and summary output.

---

*Phase: 05-recording-intelligence-recovery*
*Research completed: 2026-03-07*
