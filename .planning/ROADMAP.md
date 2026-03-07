# Roadmap: Taro

**Project:** Taro - Chrome Recorder to React Testing Library Test Generator
**Depth:** Standard
**Created:** 2026-03-06

## Overview

Taro transforms Chrome DevTools Recorder exports into production-quality React Testing Library tests. This roadmap delivers a working CLI that parses recordings, generates valid RTL tests, and learns from the codebase to improve quality over time.

---

## Phase 1: Core Pipeline

**Goal:** Users can invoke Taro from CLI and generate valid RTL tests from Chrome Recorder exports

**Dependencies:** None (foundation)

**Requirements:**
- CLI-01, CLI-02 (CLI Interface)
- INPT-01, INPT-02, INPT-03 (Core Input Processing)
- GEN-01, GEN-02, GEN-03, GEN-04, GEN-05 (Test Generation)

**Success Criteria:**

1. **User can invoke Taro from project root** — Running `taro generate ./recording.json` executes without errors
2. **Taro parses Chrome Recorder JSON correctly** — All step types (click, fill, select, scroll, assert) are recognized and normalized
3. **Taro validates input schema** — Invalid JSON files produce clear error messages
4. **Taro generates valid RTL test code** — Output uses getByRole, getByText, getByLabelText queries (not CSS selectors)
5. **Taro writes test files to filesystem** — Test files are created in correct locations with proper imports and structure

**Plans:**
6/6 plans complete
- [ ] 01-02-PLAN.md — CLI interface (commander setup, generate command)
- [ ] 01-03-PLAN.md — Chrome Recorder JSON parsing
- [ ] 01-04-PLAN.md — Input schema validation (Zod)
- [ ] 01-05-PLAN.md — RTL test code generation
- [ ] 01-06-PLAN.md — Test file writing (complete pipeline)

**Phase Verification:** User provides a Chrome Recorder export, runs `taro generate <file>`, and receives a runnable .test.js file

---

## Phase 2: Intelligence Layers

**Goal:** Generated tests are smarter — filtered for noise, enhanced with mocks, visually aware

**Dependencies:** Phase 1 (requires working pipeline)

**Requirements:**
- REC-01, REC-02, REC-03, REC-04 (Recording Intelligence)
- VIS-01, VIS-02 (Visual Intelligence)
- MOCK-01, MOCK-02, MOCK-03, MOCK-04 (Mock Intelligence)

**Success Criteria:**

1. **Redundant clicks are filtered** — Multiple rapid clicks on same element are consolidated to single action
2. **Noise events are ignored** — dblClick, cursor wandering, and unintended scroll events are removed from output
3. **Taro uses Playwright for UI inspection** — Complex UI states are captured via screenshot when needed
4. **Taro handles multi-step dialogs** — Dialog open/close flows are understood as logical units
5. **Mock patterns are detected** — Common mock targets (fetch, API calls) are identified and handled appropriately
6. **Mock decisions are intentional** — Taro decides to inline vs extract mocks based on usage patterns

**Phase Verification:** User runs Taro on recordings with noise/mocks, output is cleaner and more accurate than Phase 1

---

## Phase 3: Query & Test Design Intelligence

**Goal:** Generated tests use optimal queries and follow best test design patterns

**Dependencies:** Phase 1 (requires working generation)

**Requirements:**
- QRY-01, QRY-02, QRY-03 (Query Intelligence)
- TEST-01, TEST-02, TEST-03 (Test Design Intelligence)
- CTX-01, CTX-02, CTX-03, CTX-04, CTX-05 (Context Awareness)

**Success Criteria:**

1. **Queries are classified for brittleness** — Generated tests prefer robust queries (getByRole) over fragile ones
2. **Ambiguous elements are resolved** — When multiple matches exist, DOM scoping identifies the correct target
3. **Accessibility gaps are flagged** — When no clean query exists, a warning is logged with suggestions
4. **Concerns are distributed across tests** — Related assertions are grouped logically, not all in one test
5. **Helpers are assertion-free** — Helper functions contain setup only, no expect statements
6. **Matchers are meaningful** — Generated tests use specific matchers (toBeInTheDocument, toHaveValue) rather than generic ones

**Plans:** 7 plans
- [ ] 03-01-PLAN.md — Type contracts + Wave 0 test stubs (foundation)
- [ ] 03-02-PLAN.md — JS/AST parser for Testing Library Recorder output (QRY-01, TEST-01)
- [ ] 03-03-PLAN.md — Playwright DOM resolver for querySelector fallbacks (QRY-02, QRY-03, TEST-03)
- [ ] 03-04-PLAN.md — Codebase convention scanner + .taro/conventions.json persistence (CTX-01–05, TEST-02)
- [ ] 03-05-PLAN.md — Multi-it() template and generator extensions (TEST-01, QRY-01)
- [ ] 03-06-PLAN.md — CLI pipeline wiring + end-to-end integration (all requirements)
- [ ] 03-07-PLAN.md — Gap closure: wire selectMatcher() into pipeline (TEST-03)

**Phase Verification:** Generated tests pass query priority rules and follow RTL best practices

---

## Phase 4: Self-Scoring & Convention Learning

**Goal:** Taro evaluates its own output quality and learns project conventions over time

**Dependencies:** Phase 3 (requires quality generation to score)

**Requirements:**
- SCR-01, SCR-02, SCR-03 (Self-Scoring)
- CNV-01, CNV-02, CNV-03 (Convention Learning)

**Success Criteria:**

1. **Output is scored before writing** — Generated tests are evaluated against quality criteria before file creation
2. **Pre-write audit passes** — Internal validation confirms test structure is sound
3. **Post-write verification runs** — Generated tests are checked for syntax and import validity
4. **Taro derives conventions from observation** — Existing test patterns are analyzed and replicated
5. **Conventions persist across runs** — Learned patterns are stored in `.taro/` and reused
6. **Subsequent runs are faster** — Discovery time is reduced by cached convention data

**Phase Verification:** Taro produces progressively better tests on subsequent runs, matching project style

**Plans:** 4/4 plans complete
- [x] 04-01-PLAN.md — Score types and scorer implementation
- [x] 04-02-PLAN.md — Post-write verifier using @babel/parser
- [x] 04-03-PLAN.md — Scanner exports for convention learning
- [x] 04-04-PLAN.md — Pipeline integration (pre-write audit, post-write verification, history, conventions)

---

## Phase 5: Recording Intelligence Recovery

**Goal:** Restore the missing recording-intelligence layer so Taro filters noisy recorder input and infers user intent before query generation.

**Dependencies:** Phase 1 (requires working pipeline)

**Requirements:**
- REC-01, REC-02, REC-03, REC-04 (Recording Intelligence)

**Gap Closure:** Closes the missing Phase 2 recording-intelligence scope and the broken noisy-recording cleanup flow identified in `v1.0-MILESTONE-AUDIT.md`.

**Plans:** 3 plans
- [x] 05-01-PLAN.md — Recorder metadata preservation and noise filtering foundation
- [x] 05-02-PLAN.md — Intent inference and analyzed recording diagnostics
- [x] 05-03-PLAN.md — Generate pipeline integration for recording cleanup

---

## Phase 6: Visual & Mock Intelligence Recovery

**Goal:** Add the missing visual- and mock-intelligence layer so generation can reason about UI states and mock strategy instead of skipping those concerns entirely.

**Dependencies:** Phase 5 (restores the missing intelligence layer in order)

**Requirements:**
- VIS-01, VIS-02 (Visual Intelligence)
- MOCK-01, MOCK-02, MOCK-03, MOCK-04 (Mock Intelligence)

**Gap Closure:** Closes the missing Phase 2 visual/mock scope and the broken mock-aware generation flow identified in `v1.0-MILESTONE-AUDIT.md`.

**Plans:** 4/4 plans complete
- [x] 06-01-PLAN.md — Visual-state capture foundation in the Playwright resolver
- [x] 06-02-PLAN.md — Dialog-state understanding and visual-intelligence integration
- [x] 06-03-PLAN.md — Mock-analysis foundation for repeated targets and inline/extract decisions
- [x] 06-04-PLAN.md — Mock lifecycle/stability reasoning and generate pipeline integration

---

## Phase 7: Verification & Traceability Reconciliation

**Goal:** Reconcile milestone verification artifacts, Nyquist coverage, and requirement traceability so implemented behavior is audit-clean and the milestone can be archived honestly.

**Dependencies:** Phase 6 (cleanup after implementation gaps are closed)

**Requirements:**
- INPT-01, INPT-02, INPT-03 (Core Input Processing)
- GEN-01, GEN-02, GEN-03, GEN-04, GEN-05 (Test Generation)
- CTX-01, CTX-02, CTX-03, CTX-04, CTX-05 (Context Awareness)
- QRY-01, QRY-02, QRY-03 (Query Intelligence)
- TEST-01, TEST-02, TEST-03 (Test Design Intelligence)
- SCR-01, SCR-02, SCR-03 (Self-Scoring)
- CNV-01, CNV-02, CNV-03 (Convention Learning)

**Gap Closure:** Closes the milestone audit's partial-requirement traceability gaps, missing validation artifacts, and planning-state inconsistencies.

**Plans:** 4 plans in 2 waves
- [ ] 07-01-PLAN.md — Reconcile Phase 1 verification, validation, and INPT/GEN traceability
- [ ] 07-02-PLAN.md — Reconcile Phase 3 verification, validation, and CTX/QRY/TEST traceability
- [ ] 07-03-PLAN.md — Reconcile Phase 4 validation and SCR/CNV summary traceability
- [ ] 07-04-PLAN.md — Sync root traceability, rerun milestone audit, and verify Phase 7

---

## Progress

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 1 - Core Pipeline | CLI, parsing, and generation foundation | 10 | Complete (2026-03-06) |
| 2 - Intelligence Layers | Noise filtering, visual/mock awareness | 10 | Pending |
| 3 - Query & Test Design | Optimal queries, best practices | 11 | Complete (2026-03-07) |
| 4 - Self-Scoring & Learning | Quality evaluation, convention learning | 6 | Complete (2026-03-07) |
| 5 - Recording Intelligence Recovery | Restore missing REC-* scope | 4 | Complete (2026-03-07) |
| 6 - Visual & Mock Intelligence Recovery | Restore missing VIS-* / MOCK-* scope | 6 | Complete (2026-03-07) |
| 7 - Verification & Traceability Reconciliation | Close audit and validation gaps | 25 | Pending |

**Coverage:** 37/42 requirements mapped

**Unmapped (explicitly deferred to v2):**
- EXEC-01: Execute generated tests
- MAIN-02: Watch for component changes
- E2E-01: Generate Playwright tests
- FRAME-01/02: Vue/Svelte support
- Requirements marked out of scope in REQUIREMENTS.md

---

## Notes

- Phases 1-4 reflect the original milestone execution order; Phases 5-7 were added after the milestone audit to close uncovered scope and verification gaps
- Gap-closure work now proceeds in dependency order: recording recovery → visual/mock recovery → verification reconciliation
- Original Phase 2 remains historically documented, but its missing scope is now being recovered through Phases 5 and 6
- v2 requirements tracked separately; not in current roadmap

---

*Last updated: 2026-03-07*
