# Project Milestones: Taro

## v1.0 Regrade a test directory (Shipped: 2026-03-31)

**Delivered:** Batch regrade support for test directories with resumable tracker state, preserved score history semantics, runtime guidance, and formal verification closure.

**Phases completed:** 1-8 (12 plans total)

**Key accomplishments:**

- Added `regrade --directory-loop` discovery and tracker bootstrap for eligible `*.test.*` and `*.spec.*` files.
- Reused single-file regrade history semantics while processing directory runs sequentially and recording updated thresholds plus follow-up comments.
- Hardened resume and failure behavior so completed rows are skipped and the active row is safely retried after interruption.
- Published batch regrade guidance across README, user docs, Codex help, and packaged runtime assets.
- Closed all audit blockers with formal verification backfill and approved Nyquist sign-off across Phases 1-8.

**Stats:**

- 8 phases, 12 plans, 36 tasks
- 79,354 lines of TypeScript in the current repo snapshot
- Same-day milestone from kickoff to ship on 2026-03-31

**Git range:** `46070e6` → `v1.0`

**What's next:** Start the next milestone and define fresh requirements with `$gsd-new-milestone`.

---
