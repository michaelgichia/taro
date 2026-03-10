# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Tayo v1.0

**Shipped:** 2026-03-07
**Phases:** 7 | **Plans:** 28 | **Sessions:** 2

### What Was Built
- Core CLI pipeline for parsing Chrome Recorder exports and generating RTL tests
- Query/test-design intelligence with JS AST parsing, DOM-aware query upgrades, grouped tests, and meaningful matchers
- Scoring, post-write verification, and convention learning with `.tayo/` state
- Recording, visual, and mock intelligence recovery plus final traceability reconciliation

### What Worked
- Wave-based execution with atomic commits kept recovery work traceable
- Phase-local verification before root reconciliation prevented silent archive drift

### What Was Inefficient
- The original roadmap missed an entire REC/VIS/MOCK intelligence layer and required recovery phases
- Milestone closure took extra time because validation and verification artifacts were not treated as first-class deliverables earlier

### Patterns Established
- Missing roadmap scope can be recovered with additive phases instead of rewriting project history
- Reconciliation phases should explicitly own validation, verification, and traceability cleanup together

### Key Lessons
1. Validation and verification artifacts need to ship with implementation, not as a separate cleanup pass.
2. Historical placeholder phases must be marked as recovered or superseded explicitly to avoid archive and audit confusion.

### Cost Observations
- Model mix: quality profile dominated by main-agent execution with targeted helper agents
- Sessions: 2
- Notable: milestone close-out accelerated once phase-local evidence and root truth tables were reconciled in the same pass

---

## Milestone: v1.4 — Assertion Marker

**Shipped:** 2026-03-10
**Phases:** 3 | **Plans:** 10 | **Sessions:** 1

### What Was Built
- Semantic marker intake now preserves recorder `dblClick` verification intent, anchor context, and unresolved-marker state.
- Truthful marker assertion resolution and generation now emits explicit role/text/form-context assertions while suppressing marker gesture replay.
- Marker coverage accounting and QUAL-02 zero-conversion enforcement now surface deterministic PASS/FAIL outcomes in CLI scoring output.
- Unresolved marker reporting now emits deterministic MKR-03 warnings with recorder-line traceability for repair.

### What Worked
- Phase boundaries were clean: intake contracts, generation behavior, and quality/reporting each landed in isolated waves.
- Focused suite selection (`recording-intelligence`, `resolver`, `suite-planner`, `generator`, `scorer`, `generate`) kept verification fast and trustworthy.
- Summary files with frontmatter decisions made milestone audit and completion extraction straightforward.

### What Was Inefficient
- Milestone completion automation archived files but left root docs partially stale, requiring manual normalization.
- One accidental `milestone complete --help` invocation produced transient archive artifacts that needed cleanup.
- Missing Nyquist validation artifacts for phases 17-19 remained as avoidable debt at close-out.

### Patterns Established
- Recorder authoring conventions can ship incrementally when each phase locks explicit contracts between analysis, planner, generator, and scorer.
- Coverage gates are most reliable when computed once in generate and consumed downstream, not recomputed per layer.
- Deterministic warning formats reduce ambiguity for CI and manual debugging.

### Key Lessons
1. Milestone closure should include deterministic post-archive normalization checks for root planning docs.
2. Validation artifacts should be generated during phase execution, not deferred to audit-time discovery.
3. Structured marker diagnostics should evolve from console-only output to machine-readable artifacts in the next milestone.

### Cost Observations
- Model mix: quality profile with targeted helper use for milestone audit/integration checks
- Sessions: 1
- Notable: all v1.4 phases executed and verified in one day, with audit confirming no critical blockers

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 2 | 7 | Introduced additive recovery phases and explicit reconciliation work before archival |
| v1.4 | 1 | 3 | Established semantic-marker contract chain from intake through scoring and unresolved reporting |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 35 targeted tests in final verification sweep | Not formally tracked | 0 |
| v1.4 | 78 tests in milestone audit regression suite (6 files) | Focused phase and integration coverage; no full E2E artifact export yet | 0 |

### Top Lessons (Verified Across Milestones)

1. Phase-local verification and explicit summary artifacts reduce archival ambiguity and speed milestone closure.
2. Contract-first feature slicing improves reliability when cross-layer behavior must remain truthful.
