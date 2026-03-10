# Phase 17-04 Summary

## What changed

- Updated `src/core/recording-intelligence.ts` to broaden truthful anchor recognition for semantic markers without promoting routine edits:
  - added `add` to the transition verb heuristic so opener actions like `Add Sale (Invoice)` qualify
  - treated known state-changing control roles (`button`, `link`, `menuitem*`, `switch`, `tab`) as valid anchors even when their label is not in the verb list
  - kept known non-control query roles from becoming anchors just because their text contains words like `review`
  - excluded recorder `dblClick` semantic-marker gestures themselves from anchor candidacy
  - changed backward anchor search to keep scanning past intervening non-anchor steps until it finds the nearest earlier valid transition or exhausts the flow
- Expanded `src/core/recording-intelligence.test.ts` with representative regressions:
  - the sample `Add Sale (Invoice)` heading marker now attaches to the triggering opener click (`js-step-3` / `js-step-4`)
  - the sample phone and email proof markers now scan back past intervening non-anchor review steps and attach to the prior `Continue` transition
  - a negative case with only fill/select/label-click steps still remains unresolved with `missing-anchor`

## Tests run

- `npm run build`
- `npm run test:run -- src/core/recording-intelligence.test.ts`

## Follow-up risks

- `analyzeRecording()` still reports marker links against original step ids even when cleanup removes the ordinary same-target click from the filtered `steps` array. That is consistent with current behavior and test coverage, but downstream consumers must continue resolving anchors by `anchorStepId`, not by assuming the anchor step survives filtering.
- This phase intentionally stopped at attachment heuristics and proof coverage. Assertion generation and downstream reporting remain deferred to later phases.
