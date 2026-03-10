---
phase: 16-verification-json-parity-product-surface
plan: "01"
subsystem: testing
tags: [scoring, cli, trust-contract, rtl]
requires:
  - phase: 15-structured-suite-planning-repo-aware-generation
    provides: repo-aware boundary signals and helper-oriented JS generation
provides:
  - explainable low-confidence scoring signals and reasons
  - advisory CLI draft banner with blocker summaries
affects: [verification, docs, generate-command]
tech-stack:
  added: []
  patterns: [explainable-score-metadata, advisory-draft-banner]
key-files:
  created:
    - .planning/phases/16-verification-json-parity-product-surface/16-01-SUMMARY.md
  modified:
    - src/core/scorer.ts
    - src/types/score.ts
    - src/core/scorer.test.ts
    - src/cli/commands/generate.ts
    - src/cli/commands/generate.test.ts
key-decisions:
  - "Keep the existing score line and grade surface, then layer reasons, signals, blockers, and requiresReview on top."
  - "Treat C-or-below output as advisory draft mode in the CLI instead of blocking writes."
patterns-established:
  - "ScoreResult carries machine-readable reasons and blockers derived from real code evidence."
  - "Generate emits one draft-quality banner plus top blockers in both dry-run and write flows."
requirements-completed: [VERIFY-01]
duration: 25min
completed: 2026-03-10
---

# Phase 16 Plan 01 Summary

**Explainable low-confidence scoring and an advisory CLI draft banner now make weak generated output reviewable instead of opaque.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-03-10
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added deterministic score signals, reasons, blockers, and review classification without replacing the existing score line.
- Penalized draft-quality evidence such as unresolved query checkpoints, placeholder render targets, and lingering boundary warnings.
- Surfaced a single advisory manual-review banner with top blockers in both dry-run and write-mode generate flows.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the score contract with deterministic low-confidence reasons and signals** - `7a91c16` (feat)
2. **Task 2: Emit the stronger low-confidence banner and top blockers in the CLI** - `d9bcc6a` (test)

**Plan metadata:** Captured in the Phase 16 verification and closeout artifacts.

## Files Created/Modified

- `.planning/phases/16-verification-json-parity-product-surface/16-01-SUMMARY.md` - Captures the scoring and CLI trust-contract upgrade.
- `src/core/scorer.ts` - Computes explainable reasons, signals, blockers, and advisory draft classification.
- `src/types/score.ts` - Extends the public score contract with explainability fields.
- `src/core/scorer.test.ts` - Locks draft-mode and stable-output scoring behavior with deterministic expectations.
- `src/cli/commands/generate.ts` - Emits the low-confidence banner and top blockers.
- `src/cli/commands/generate.test.ts` - Verifies the CLI shows advisory draft messaging in dry-run and write flows.

## Decisions Made

- Kept low-confidence messaging advisory so weak output remains inspectable and writable when needed.
- Derived blockers from sorted negative reasons so the banner stays grounded in actual score evidence.

## Deviations from Plan

None.

## Issues Encountered

- `src/core/scorer.test.ts` needed a quick repair after an accidental template-string break during editing. The final test file passed the focused Wave 1 verification suite.

## User Setup Required

None.

## Next Phase Readiness

Wave 1 leaves the generate command with a stable trust surface that Wave 2 JSON parity tests and Wave 3 docs can reference directly.
