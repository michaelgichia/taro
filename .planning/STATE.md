# State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-31)

**Core value:** Taro should produce repo-aware, auditable RTL output and score history that make uncertainty explicit instead of hiding it.
**Current focus:** Milestone v1.0 requirements and roadmap for `regrade --directory-loop`

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-31 — Milestone v1.0 started

## Accumulated Context

- Existing batch-progress behavior already uses `.taro/directory-loop/*.md` trackers with resume and retry semantics.
- Existing `generatedTests` history keeps only the latest 5 snapshots per test file and feeds score-aware learning.
- No current tracker format records per-entry prior score, updated score, or follow-up comments.
- The milestone focus is extending the regrade surface to directories without changing the underlying scoring rubric.
