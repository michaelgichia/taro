## GAPS FOUND

Status: `gaps_found`

Phase 17 does not fully achieve its goal. The codebase does recognize recorder `dblClick` proof gestures as semantic-marker candidates and preserves their recorder context, but the attachment logic is too narrow to keep several real markers attached to the user action they are meant to verify.

### Requirement Cross-Reference

- `17-01-PLAN.md` frontmatter lists `MARK-01` and `MARK-02`; both exist in `.planning/REQUIREMENTS.md` under Marker Detection.
- `17-02-PLAN.md` frontmatter lists `MARK-01` and `MARK-02`; both exist in `.planning/REQUIREMENTS.md`.
- `17-03-PLAN.md` frontmatter lists `MARK-02`; it exists in `.planning/REQUIREMENTS.md`.

### What Passed

- `MARK-01` is substantially implemented at intake.
  - JS parsing creates `semanticMarkerCandidate` metadata with `stepId`, source line, original gesture, proof subject, proof text, and recovered query/selector evidence in `src/core/js-parser.ts:507-529` and `src/core/js-parser.ts:588-629`.
  - Shared contracts and downstream envelopes exist in `src/types/recording.ts:205-252`, `src/core/baseline-normalizer.ts:89-158`, and `src/cli/commands/generate.ts:168-208`.
  - Marker-aware cleanup keeps preserved/unresolved markers distinct from ordinary dblClick noise in `src/core/recording-intelligence.ts:460-577`, and public reporting surfaces that distinction in `src/cli/commands/generate.ts:133-166`.

### Concrete Gaps

1. `MARK-02` is not achieved for important real markers because the anchor heuristic is too narrow.
   - `src/core/recording-intelligence.ts:150-180` only treats `navigate` and click targets matching `open|continue|submit|save|confirm|done|create|update|apply|next|finish|start|launch|proceed|review|checkout|complete` as valid major transitions.
   - The representative recorder sample contains `userEvent.click(screen.getByRole('button', {name: 'Add Sale (Invoice)'}))` followed by a heading marker for `Add Sale (Invoice)` in `sample/sample-rest-recordingextension-output.js:12-14`.
   - A direct runtime check against the built code on 2026-03-10 showed that marker `js-step-4` (`Add Sale (Invoice)`) remains `unresolved` with reason `missing-anchor` instead of attaching to the opening action. That is a failure of “stay attached to the user action they are meant to verify.”

2. `MARK-02` also fails for later proof markers because backward anchor search stops too early.
   - `findNearestPriorMajorTransitionStep()` stops scanning as soon as it hits the first prior non-sync step that is not itself a recognized major transition (`src/core/recording-intelligence.ts:162-180`).
   - In the same runtime check on the representative sample, later visible-value markers such as `+254710853300` (`js-step-67`) and `john.doe@namiri.tech` (`js-step-69`) also stayed `unresolved` with `missing-anchor`, even though they occur in the review flow after a state-changing transition.
   - This means the code preserves marker context, but not the required action attachment, for a meaningful portion of the intended recorder pattern.

3. Downstream preservation is faithful, but it preserves the missing attachment rather than repairing it.
   - `src/core/baseline-normalizer.ts:98-129` rehydrates marker metadata.
   - `src/core/suite-planner.ts:40-71` only enriches marker context when an `anchorStepId` already exists.
   - `src/cli/commands/generate.ts:168-208` merges analyzed marker state back into the JS flow, so unresolved markers stay unresolved end to end.
   - This is correct pipeline behavior, but it confirms the attachment gap is real and survives through the public generate path.

### Test Evidence

- Verified commands:
  - `npm run build`
  - `npm run test:run -- src/core/js-parser.test.ts src/core/input-loader.test.ts src/core/recording-intelligence.test.ts src/core/suite-planner.test.ts src/cli/commands/generate.test.ts`
- Result: all targeted tests passed (`5` files, `52` tests).
- However, the current automated coverage does not catch the failing sample-anchor behavior above. Existing anchor tests cover cases like `Continue`, `Open sale`, and `Save` in `src/core/recording-intelligence.test.ts:183-253` and `src/core/recording-intelligence.test.ts:307-380`, but they do not cover the sample’s `Add Sale (Invoice)` transition or the later review-detail marker sequence.

### Verification Decision

Phase 17 is **not** ready to be marked passed. `MARK-01` is largely in place, but `MARK-02` is incomplete in the live implementation because real recorder markers are still left unattached when the transition verb is outside the hard-coded heuristic or when a valid anchor is not the immediately preceding recognized major step.
