# Roadmap: Taro v1.0 Regrade a test directory

**Created:** 2026-03-31
**Milestone Goal:** Add `regrade --directory-loop` so Taro can batch regrade every eligible test in a directory and track progress/results across the full loop.
**Phase numbering:** Starts at 1

## Phase 1: Regrade Directory Discovery and Tracker Shape

**Goal:** Define which files a regrade directory loop processes and extend the Markdown tracker format to represent test-oriented entries.

**Requirements:** `RGDIR-01`, `RGDIR-02`, `RGDIR-03`, `RGTRK-01`, `RGTRK-02`, `RGTRK-03`

**Implementation focus:**
- identify or create the reusable command surface for `regrade` directory targets
- discover eligible `*.test.*` and `*.spec.*` files while excluding non-test files
- adapt the directory-loop tracker model from component/output entries to test/score-oriented entries
- preserve canonical tracker placement under `.taro/directory-loop/`
- keep the single-active-entry invariant in tracker updates and Markdown round-tripping

**Verification:**
- unit tests for tracker rendering/parsing with prior-score fields
- command validation tests for directory input vs single-file input
- discovery tests proving non-test files are excluded

## Phase 2: Sequential Regrade Loop and History Persistence

**Goal:** Execute sequential batch regrades and persist the score movement for each completed test.

**Requirements:** `RGTRK-04`, `RGEX-01`, `RGST-01`, `RGST-02`, `RGST-03`

**Implementation focus:**
- introduce or extract a reusable single-file regrade engine that directory mode can call repeatedly
- load the latest stored `generatedTests` snapshot for each test when available
- append a fresh snapshot per completed test while preserving unrelated history and latest-5 trimming
- write updated score thresholds and follow-up comments back into the tracker after each regrade
- ensure directory-loop output remains explicit when a test still requires manual review

**Verification:**
- state-history tests for latest-match lookup and latest-5 trimming after repeated directory-loop runs
- integration tests proving each completed batch regrade appends the expected history entry
- tracker tests proving completed entries include updated score data and follow-up comments

## Phase 3: Resume, Retry, and Failure Semantics

**Goal:** Preserve safe restart behavior so interrupted batch regrade runs can continue without corrupting tracker/state state.

**Requirements:** `RGEX-02`, `RGEX-03`

**Implementation focus:**
- stop on the current test when a regrade fails or cannot produce a trustworthy result
- leave the active test `in-progress` and untouched remaining tests `pending`
- skip already completed tests on resume unless a documented gating rule requires requeueing
- align failure logging and exit codes with the existing directory-loop UX

**Verification:**
- resume tests that start from an existing tracker with `completed` and `in-progress` entries
- failure tests that confirm only the current test remains active after interruption
- regression tests that protect against double-processing already completed tests

## Phase 4: Runtime Guidance and Regression Coverage

**Goal:** Make the new batch regrade behavior discoverable and keep the runtime surfaces in sync.

**Requirements:** `RGUX-01`

**Implementation focus:**
- update runtime-facing help/skill content for `regrade --directory-loop`
- document tracker location and expected status transitions in README/runtime assets
- add end-to-end regression coverage around the user-facing command path

**Verification:**
- tests for installed runtime assets and help text
- README/help review against implemented tracker behavior
- end-to-end smoke coverage for the documented invocation path

## Dependencies and Risks

- Phase 2 depends on a stable tracker model from Phase 1.
- Phase 3 depends on the loop engine from Phase 2 exposing explicit success/failure signals.
- The biggest risk is splitting logic between runtime-skill `regrade` behavior and CLI batch orchestration without a shared implementation seam.
- A second risk is adding tracker metadata that drifts from `.taro/state.json` score history semantics.

## Delivery Notes

- Prefer extending the existing tracker utilities rather than creating a new batch-progress subsystem.
- Prefer extracting shared regrade logic into a reusable implementation boundary before adding directory orchestration.
- Keep milestone scope focused on batch regrading; leave configurable thresholds and parallelization for later milestones.

## Next Command

`$gsd-plan-phase 1`

---
*Roadmap created: 2026-03-31*
*Last updated: 2026-03-31 after milestone v1.0 definition*
