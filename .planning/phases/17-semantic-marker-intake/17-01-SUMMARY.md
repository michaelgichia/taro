---
phase: 17-semantic-marker-intake
plan: "01"
subsystem: testing
tags: [testing-library, recorder-js, semantic-markers, parser]
requires:
  - phase: 13-js-input-contract-ast-recovery
    provides: recorder JS AST parsing and baseline metadata recovery
provides:
  - semantic marker candidate contract at the shared JS intake boundary
  - preserved unresolved dblClick marker candidates on parsed JS steps
  - shared loader baseline metadata for downstream marker qualification work
affects: [17-02-marker-qualification, 17-03-anchor-attachment, phase-18]
tech-stack:
  added: []
  patterns:
    - additive baseline metadata for JS-only semantic evidence
    - unresolved marker candidate preservation on normalized steps
key-files:
  created:
    - .planning/phases/17-semantic-marker-intake/17-01-SUMMARY.md
  modified:
    - src/types/recording.ts
    - src/core/js-parser.ts
    - src/core/js-parser.test.ts
    - src/core/input-loader.ts
    - src/core/input-loader.test.ts
key-decisions:
  - "Kept recorder dblClick actions normalized as click for compatibility and attached semanticMarkerCandidate metadata instead of changing action semantics."
  - "Used coarse intake-only proof-subject classification (heading, visible-message, concrete-value, field-label, selector-target, unknown) without adding qualification heuristics."
  - "Made JS baseline semanticMarkerCandidates additive and explicit, including an empty array when no candidates exist."
patterns-established:
  - "JS-only marker intent should be preserved in both step-level metadata and baseline arrays at intake."
  - "Later phases should read candidate.status and proofSubject instead of inferring missing markers from raw recorder gestures."
requirements-completed: [MARK-01, MARK-02]
duration: 20min
completed: 2026-03-10
---

# Phase 17-01 Summary

**Semantic marker intake now preserves recorder JS `dblClick` evidence as unresolved candidates with source context, proof-subject classification, and baseline propagation.**

## Accomplishments

- Added `SemanticMarkerCandidate` contracts and optional step/baseline fields so parsed JS steps can carry unresolved marker intent without breaking JSON or existing normalized-step consumers.
- Updated the Babel-based JS parser to preserve `dblClick` recorder gestures as semantic marker candidates, including step id, source line context, original gesture, proof text, and recovered query or selector evidence.
- Threaded semantic marker candidates through the shared input loader and added regressions covering headings, visible messages, concrete values, field labels, and unchanged JSON behavior.

## Verification

- `npm run build`
- `npm run test:run -- src/core/js-parser.test.ts src/core/input-loader.test.ts`

## Follow-up Risks

- Proof-subject classification is intentionally coarse in this plan; Phase 17-02 still needs to qualify or reject unresolved candidates truthfully.
- Selector-only `dblClick` candidates preserve raw evidence but still depend on later anchor/qualification work to become useful assertions.

## Files Changed

- `src/types/recording.ts`
- `src/core/js-parser.ts`
- `src/core/js-parser.test.ts`
- `src/core/input-loader.ts`
- `src/core/input-loader.test.ts`
- `.planning/phases/17-semantic-marker-intake/17-01-SUMMARY.md`
