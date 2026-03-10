---
phase: 14-truthful-selector-recovery
plan: "02"
subsystem: cli
tags: [js-generation, selector-recovery, generator, testing]
requires:
  - phase: 14-truthful-selector-recovery
    provides: selector-resolution outcomes keyed by step ID plus truthful resolver behavior
provides:
  - JS generation that consumes step-aware selector-resolution outcomes
  - explicit unresolved-selector checkpoint comments in emitted tests
  - generator coverage for preserved-query precedence and unresolved selector rendering
affects: [14-truthful-selector-recovery, cli, generator, phase-16-verification]
tech-stack:
  added: []
  patterns:
    - step-aware selector-resolution metadata is rehydrated onto grouped JS steps before emission
    - unresolved JS selectors render checkpoint comments instead of executable placeholder queries
key-files:
  created: []
  modified:
    - src/cli/commands/generate.ts
    - src/core/generator.ts
    - src/templates/test-template.ts
    - src/core/generator.test.ts
key-decisions:
  - "Treat unresolved JS selectors as explicit checkpoint comments so generated output stays truthful and syntactically valid."
  - "Preserve recorder-derived query evidence ahead of selector fallback so weaker CSS evidence cannot overwrite stronger baseline truth."
patterns-established:
  - "JS generation resolves selector outcomes per step, then rehydrates planned it-groups before rendering code."
  - "Checkpoint markers use tayo-query-checkpoint comments for unresolved selector review without fabricating RTL queries."
requirements-completed: [QUERY-02, QUERY-03]
duration: 7m
completed: 2026-03-10
---

# Phase 14 Plan 02: Truthful JS Generation Summary

**JS generation now carries truthful selector-resolution outcomes into emitted RTL code, preserving strong recorder queries and surfacing unresolved selectors as reviewable checkpoints.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-10T04:30:25Z
- **Completed:** 2026-03-10T04:37:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Updated the JS generate command to resolve selector outcomes per step, reuse preserved recorder queries, and emit CLI warnings for unresolved selectors without inventing fake `getByTestId(...)` output.
- Updated the generator and template path so unresolved JS selectors render explicit `tayo-query-checkpoint` comments while valid recovered queries still render executable RTL code.
- Added generator-level coverage proving unresolved selector checkpoints remain syntactically valid and that preserved recorder query evidence still wins over raw selector fallback logic.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread truthful selector outcomes through JS generation** - `3d0a043` (feat)
2. **Task 2: Lock generator behavior with unresolved-selector tests** - `5af3dd6` (test)

## Files Created/Modified

- `src/cli/commands/generate.ts` - threads selector-resolution outcomes into JS generation, updates step metadata, and emits unresolved-selector warnings
- `src/core/generator.ts` - reconstructs only truthful JS queries and renders checkpoints when selector evidence stays unresolved
- `src/templates/test-template.ts` - adds stable checkpoint comment rendering for unresolved selector steps
- `src/core/generator.test.ts` - covers unresolved checkpoint rendering and preserved-query precedence

## Decisions Made

- Use unresolved selector checkpoint comments rather than executable placeholder queries so dry-run previews and written files show the same truthful degradation.
- Keep preserved recorder query descriptors as the strongest source of JS query truth and only add live-DOM recovered queries when they are actually resolved.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A type check in `src/core/generator.ts` still assumed every reconstructed query was defined; this was tightened before rerunning the plan verification command.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14-03 can now exercise URL-backed enrichment and dry-run/write parity against the shipped checkpoint markers rather than fake fallback queries.
- Phase 16 scoring and verification work now has machine-detectable `tayo-query-checkpoint` markers to account for low-confidence JS output explicitly.

## Self-Check: PASSED

- Verified `.planning/phases/14-truthful-selector-recovery/14-02-SUMMARY.md` exists.
- Verified task commit `3d0a043` exists in git history.
- Verified task commit `5af3dd6` exists in git history.
