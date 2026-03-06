# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** Reduce the effort to write and maintain tests by automatically generating high-quality, codebase-aware React Testing Library tests from browser recordings
**Current focus:** Phase 4 complete - Convention learning with persistence

## Current Position

Phase: 4 of 4 (Self-Scoring & Convention Learning)
Plan: 4 of [total in phase]
Status: Complete
Last activity: 2026-03-06 — Completed 04-04-PLAN.md (Convention Persistence)

Progress: [████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 7 min/plan
- Total execution time: 35 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Core Pipeline | TBD | - | - |
| 2 - Intelligence Layers | 4/4 complete | 4 | 7 min |
| 3 - Query & Test Design | TBD | - | - |
| 4 - Self-Scoring & Learning | 4/4 complete | 4 | 7 min |

**Recent Trend:**
- Phase 4 complete - all 4 plans finished

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 4 phases derived from requirements (Core Pipeline → Intelligence → Quality → Learning)
- Phase 1 scope: CLI + input parsing + basic test generation (10 requirements)
- Coverage: 37/42 v1 requirements mapped (5 deferred to v2)
- Phase 2-02: Used Playwright over Puppeteer for cross-browser support
- Phase 2-02: Visual inspection is opt-in via --visual flag for performance
- Phase 2-02: Query priority order based on Testing Library best practices
- Phase 2-03: Mock detection integrated into pipeline with --no-mocks flag
- Phase 2-03: Supports MSW, jest.fn, sinon, nock, fetch-mock, undici
- Phase 2-04: Dialog detection with 30s time window grouping
- Phase 2-04: Supports modal, drawer, popover, confirm, form dialog types
- Phase 4-01: Used @typescript-eslint/typescript-estree for AST parsing
- Phase 4-01: Weighted scoring: structure 25%, queries 25%, matchers 30%, noFragility 20%
- Phase 4-02: Pre-write audit runs quality gates + structural checks before file creation
- Phase 4-02: Post-write verification validates syntax, imports, and common issues
- Phase 4-02: Blocking issues prevent file creation, warnings logged but don't block
- Phase 4-03: Convention analyzer extracts naming, queries, matchers, imports via AST analysis
- Phase 4-03: Naming pattern detection: camelCase, kebab-case, snake_case from describe block names
- Phase 4-03: Convention merging: OR logic for structure, union for queries/matchers/imports

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

None yet.

## Session Continuity

Last session: 2026-03-06
Stopped at: Completed 04-03-PLAN.md (Convention Learning Module)
Resume file: None
