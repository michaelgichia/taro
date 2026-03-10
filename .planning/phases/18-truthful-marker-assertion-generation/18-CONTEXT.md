# Phase 18: Truthful Marker Assertion Generation - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn resolved semantic assertion markers into explicit, truthful RTL assertions in the correct generated scenario block. This phase owns how marker-derived assertions read in the final test output, where they appear relative to helpers and scenarios, and how label-or-placeholder fallback stays bounded to real form context.

This phase does not expand marker authoring, JSON marker parity, coverage scoring, or unresolved-marker reporting beyond what is needed to avoid fabricated assertions.

</domain>

<decisions>
## Implementation Decisions

### Assertion placement
- Emit each marker-derived assertion immediately after the user action it verifies.
- If the verified action lives inside a helper, place the assertion immediately after the helper call in the scenario body.
- Helper functions remain assertion-free; marker-derived expectations belong only in scenario bodies.
- If multiple markers attach to the same anchor action, keep only one marker-derived proof in the generated output.
- Choose that single proof by strongest evidence order: role plus name first, then visible text or concrete value, then form-context fallback.
- Existing synchronization steps such as `findByRole` do not count as the real assertion; marker intent should still become an explicit expectation in the scenario body.

### Form-context fallback
- Label-or-placeholder fallback is allowed only for real form controls such as textbox, textarea, combobox, spinbutton, checkbox, and radio-style inputs.
- A marker on visible label text may convert only when that label maps unambiguously to one specific control.
- Within this fallback, prefer label-based queries before placeholder-based queries.
- If field association is weak or multiple controls could match, leave the marker unresolved rather than guessing.
- Read-only review rows, wrappers, and generic field-adjacent layout should not use form-context fallback.

### Assertion style
- Marker-derived assertions should read as visible proof, not mere existence checks.
- When a marker resolves through visible text or a concrete value, use the exact recorded proof text or value unless stronger role-and-name evidence already won.
- When a marker uses form-context fallback, prove that the control is visible; do not infer extra value assertions from surrounding user actions.
- When the verified UI can appear asynchronously after the anchor action, the generated assertion should wait for that proof to appear before checking visibility.

### Claude's Discretion
- Exact helper/scenario code shape used to keep marker assertions out of helpers while still placing them right after helper calls.
- Exact mechanism for choosing the strongest marker when multiple markers attach to the same anchor, as long as it follows the locked evidence order.
- Exact matcher and async utility combination (`findBy*`, `waitFor`, or equivalent) so long as the generated output reads as explicit visible proof.

</decisions>

<specifics>
## Specific Ideas

- The sample Add Sale flow remains the reference behavior: dialog and review markers should become explicit assertions tied to the opener or continue action rather than replayed `dblClick` noise.
- When one anchor action has several proof markers, the output should show the single best proof, not a cluster of repetitive expectations.
- Synchronization-only waits in helpers are acceptable for flow control, but the user-marked proof still needs an explicit scenario-level assertion.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/recording-intelligence.ts`: already qualifies marker candidates, attaches `anchorStepId`, and preserves unresolved markers; Phase 18 consumes that linkage rather than re-deriving it.
- `src/core/suite-planner.ts`: already enriches planned steps with `semanticMarkerAnchorStep` metadata and keeps helpers `sync-only`; this is the main placement seam for scenario-body assertions after helper calls.
- `src/core/generator.ts`: already owns helper emission and scenario body generation; this is the primary output seam where marker clicks stop rendering as interactions and become explicit expectations.
- `src/core/js-parser.ts` and `src/types/recording.ts`: already preserve proof subject, recovered query evidence, and field-label-like candidates that Phase 18 must gate tightly before converting.
- `src/core/resolver.ts`: existing query-priority and matcher patterns provide the baseline for role/name, label, placeholder, and visibility-oriented output.

### Established Patterns
- Tayo prefers truthful visible-user evidence over hidden implementation assertions or guessed selectors.
- Helpers are navigation utilities with synchronization only; meaningful assertions are expected to live in test bodies.
- Existing generated output already distinguishes synchronization from meaningful checks, so marker assertions should strengthen the scenario without hiding inside helpers.
- Prior milestone decisions require ambiguity to stay explicit; weak form-context associations must remain unresolved instead of silently selecting a control.

### Integration Points
- `src/core/suite-planner.ts` and related tests: attach marker-derived assertion intent to the correct scenario block and helper boundary.
- `src/core/generator.ts` and `src/templates/test-template.ts`: emit explicit marker expectations in scenario bodies and suppress replay of marker gestures as user actions.
- `src/core/generator.test.ts` and `src/cli/commands/generate.test.ts`: verify the final generated code shows single strongest proofs, visible assertions, and no helper-owned marker expectations.
- `src/core/scorer.ts`: Phase 18 may need assertion-shape compatibility, while Phase 19 still owns coverage counting and zero-conversion quality-gate behavior.

</code_context>

<deferred>
## Deferred Ideas

- Marker coverage counts, zero-conversion quality-gate failures, and unresolved-marker warning surfaces remain Phase 19 work.
- Extending semantic marker conversion beyond the JS marker path remains out of scope for this phase.
- Supporting additional recorder marker gestures beyond `dblClick` remains deferred.

</deferred>

---

*Phase: 18-truthful-marker-assertion-generation*
*Context gathered: 2026-03-10*
