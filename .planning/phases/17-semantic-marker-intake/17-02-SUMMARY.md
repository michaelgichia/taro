# Phase 17-02 Summary

## What changed

- Added shared marker-analysis contracts in `src/types/recording.ts` for:
  - qualified marker links (`SemanticMarkerLink`)
  - explicit unresolved markers (`UnresolvedSemanticMarker`)
  - additive step/analyzed-recording fields that carry marker linkage without changing JSON callers
- Refactored `src/core/recording-intelligence.ts` so JS `dblClick` gestures are annotated before click-cluster cleanup:
  - qualifying proof subjects are limited to headings, visible messages, and concrete values
  - field labels stay excluded from marker qualification in this phase
  - selector-only proof-like targets remain explicit unresolved markers instead of being fabricated into linked assertions
  - qualified markers link to the nearest prior major transition step, ignoring only sync URL/title assertions
- Made same-target click cleanup marker-aware:
  - preserved marker steps are no longer counted as removed dblClick noise
  - JS marker-like `dblClick` + `click` pairs only keep the trailing click when the target is actually interactive
  - non-interactive proof targets now drop the trailing click instead of surviving as ordinary user actions
- Extended diagnostics with `preservedSemanticMarkers` and `unresolvedSemanticMarkers` so they are distinguishable from removed dblClick noise.

## Tests run

- `npm run build`
- `npm run test:run -- src/core/recording-intelligence.test.ts`

## Coverage added

- Qualified marker preservation and anchor linkage to the nearest prior major transition
- Explicit unresolved markers when proof-like JS evidence has no valid anchor
- Field-label exclusion from qualification
- Same-target `dblClick` + `click` handling for non-interactive proof targets
- Same-target `dblClick` + `click` handling for interactive controls
- Unchanged JSON cleanup behavior

## Follow-up risks

- Major-transition detection is still heuristic and text-driven in this phase; unusual state-changing labels may remain unresolved until later refinement.
- Interactive-target detection currently relies on recovered query roles, so selector-only evidence stays unresolved by design.
