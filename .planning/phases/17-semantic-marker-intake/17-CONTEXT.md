# Phase 17: Semantic Marker Intake - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect semantic assertion-marker intent in recorder JS input and preserve the evidence needed for later conversion. This phase is intake only: it decides which `dblClick` gestures count as markers, which earlier action they attach to, and what metadata survives downstream. It does not generate assertions yet.

</domain>

<decisions>
## Implementation Decisions

### Marker qualification
- Preserve semantic markers only on the JS input path in Phase 17. Chrome Recorder JSON support must remain non-regressing, but marker intake does not expand there yet.
- Treat a `dblClick` as a semantic marker only when it is strict visible proof immediately following a significant UI change.
- Valid proof subjects for Phase 17 are headings, user-facing messages, and concrete visible values.
- Field labels such as form section labels or field names do not count as valid proof subjects in this phase.

### Action linkage
- Attach each preserved marker to the nearest prior major transition that plausibly changed the UI.
- Valid anchor actions are major transitions only: open, continue, submit, save, and similar state-changing steps.
- Routine field edits and ordinary selections are not valid anchors in Phase 17.
- If a proof-like marker has no clear valid anchor, preserve it as an unresolved marker candidate rather than dropping it.

### Recorder pair handling
- When a proof-like `dblClick` is followed immediately by a same-target `click`, preserve the marker intent instead of collapsing it as noise.
- Keep the trailing same-target click as a real interaction only when the target is an actually interactive control.
- For non-interactive proof targets, the trailing same-target click should not survive as a real user interaction step.

### Claude's Discretion
- Exact metadata shape for preserved marker intent, linkage, and unresolved-state bookkeeping.
- Exact heuristics for identifying "similar state-changing steps" beyond the explicit major-transition examples above.
- Exact handling of borderline interactive targets, as long as it stays consistent with the rule that only truly interactive controls keep the trailing click.

</decisions>

<specifics>
## Specific Ideas

- The sample recorder export is the reference shape for this phase: proof-like `dblClick` steps often appear immediately after a major action and are commonly followed by a same-target `click`.
- The desired user experience is that non-technical recorder users can signal "verify this" with a `dblClick` on visible proof without opening advanced assertion settings.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/js-parser.ts`: already preserves `originalType`, source line, recovered query evidence, and selector evidence for JS steps; this is the main intake seam for marker preservation.
- `src/core/input-loader.ts`: already separates JS and JSON sources, which supports a JS-first rollout for marker semantics without breaking JSON ingestion.
- `src/types/recording.ts`: existing step metadata and descriptor types provide the place to carry marker state downstream.

### Established Patterns
- `dblClick` is currently normalized to click-like behavior and then treated as removable noise in the current pipeline, so Phase 17 must deliberately override that assumption for semantic markers.
- The pipeline is staged and immutable: load/parse -> analyze -> resolve -> generate. Marker intake should stay in the early parse/analyze stages so later phases can consume preserved evidence instead of reconstructing intent.
- Prior milestone decisions require truthful behavior: unresolved evidence should stay explicit rather than being silently converted into fabricated stronger signals.

### Integration Points
- `src/core/recording-intelligence.ts`: current click-cluster cleanup removes `doubleClick` noise and will need a marker-aware intake path.
- `src/parser/steps/noise-filter.ts` and related JSON parser flow: currently filters `doubleClick` as noise; this remains unchanged behavior for JSON in Phase 17.
- `src/cli/commands/generate.ts`: current diagnostics already report removed `dblClick` noise, so any preserved markers will need compatible diagnostics later in the pipeline.

</code_context>

<deferred>
## Deferred Ideas

- Extending semantic marker intake to Chrome Recorder JSON parity.
- Converting preserved markers into concrete RTL assertions.
- Coverage scoring, unresolved-marker warnings, and other reporting behaviors beyond intake.

</deferred>

---

*Phase: 17-semantic-marker-intake*
*Context gathered: 2026-03-10*
