# Phase 17-03 Summary

## What changed

- Rehydrated semantic marker state in `src/core/baseline-normalizer.ts` so rebuilt JS steps recover:
  - `semanticMarkerCandidate` from baseline candidate evidence
  - `semanticMarkerLink` from step metadata when downstream passes rebuilt steps back through normalization
  - `unresolvedSemanticMarker` from step metadata for the same rehydration path
- Updated `src/core/suite-planner.ts` to keep marker-to-action linkage available inside planned groups without changing scenario structure:
  - marker steps now carry `metadata.semanticMarkerAnchorStep` with the linked action snapshot
  - helper-to-scenario matching now uses stable step identity instead of object identity
- Updated `src/cli/commands/generate.ts` so the public JS path stays marker-aware but does not emit marker gestures as ordinary user actions:
  - cleanup output now reports preserved and unresolved semantic markers separately from removed `dblClick` noise
  - analyzed marker state is merged back onto the selector-recovery recording before rehydration
  - generation-only copies of `itGroups`, helpers, and scenarios strip preserved/unresolved marker gestures from emitted user steps while leaving the preserved metadata available downstream
- Added regressions in `src/core/suite-planner.test.ts` and `src/cli/commands/generate.test.ts` covering:
  - baseline normalization rehydration of marker linkage and unresolved state
  - helper/scenario planning retention of marker anchor context
  - public generate-path preservation of marker metadata while non-interactive proof clicks stay out of generated RTL actions

## Tests run

- `npm run build`
- `npm run test:run -- src/core/suite-planner.test.ts src/cli/commands/generate.test.ts`

## Follow-up risks

- `src/core/recording-intelligence.ts` still drops the leading ordinary click in some same-target click-marker-click clusters before this phase’s owned files run. That behavior was not changed here because it is outside the owned file set.
- Marker-derived assertions, unresolved-marker warnings, and coverage/scoring are still intentionally deferred to later phases.
