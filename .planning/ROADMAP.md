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
- [ ] 01-01-PLAN.md — Project setup (package.json, tsconfig, directory structure)
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

**Plans:**
- [ ] 02-01-PLAN.md — Recording noise filtering (deduplication, noise removal)
- [ ] 02-02-PLAN.md — Visual intelligence (Playwright inspection)
- [ ] 02-03-PLAN.md — Mock intelligence (API detection, mock generation)
- [ ] 02-04-PLAN.md — Dialog flow detection (multi-step grouping)

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

**Plans:**
- [x] 04-01-PLAN.md — Scorer infrastructure (SCR-01)
- [x] 04-02-PLAN.md — Pre-write audit and post-write verification (SCR-02, SCR-03)
- [x] 04-03-PLAN.md — Convention analyzer (CNV-01)
- [x] 04-04-PLAN.md — Convention persistence with SQLite (CNV-02, CNV-03)

---

## Progress

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 1 - Core Pipeline | CLI + basic test generation | 10 | ✓ Complete |
| 2 - Intelligence Layers | Noise filtering, visual/mock awareness | 10 | ✓ Complete |
| 3 - Query & Test Design | Optimal queries, best practices | 11 | Pending |
| 4 - Self-Scoring & Learning | Quality evaluation, convention learning | 6 | ✓ Planned |

**Coverage:** 37/42 requirements mapped

**Unmapped (explicitly deferred to v2):**
- EXEC-01: Execute generated tests
- MAIN-02: Watch for component changes
- E2E-01: Generate Playwright tests
- FRAME-01/02: Vue/Svelte support
- Requirements marked out of scope in REQUIREMENTS.md

---

## Notes

- Phase ordering follows research recommendations: pipeline → intelligence → quality → learning
- Critical path runs through Phase 2 (selector transformation) as the highest-risk area
- Phase 4 self-scoring validates all prior work, so it depends on having quality to score
- v2 requirements tracked separately; not in current roadmap

---

*Last updated: 2026-03-06*
