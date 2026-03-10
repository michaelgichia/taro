# Roadmap: Taro

## Milestones

- ✅ **v1.0 Taro v1.0** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.0-ROADMAP.md), [requirements archive](./milestones/v1.0-REQUIREMENTS.md), and [audit](./milestones/v1.0-MILESTONE-AUDIT.md).
- ✅ **v1.1 Documentation & Deployment** — shipped 2026-03-07
- ✅ **v1.2 Runtime Installer Distribution** — shipped 2026-03-07. See [roadmap archive](./milestones/v1.2-ROADMAP.md) and [requirements archive](./milestones/v1.2-REQUIREMENTS.md).
- 🚧 **v1.3 JS Baseline** — Phases 13-16 (audit gaps mapped 2026-03-09)

## Overview

v1.3 focuses on turning Testing Library Recorder JS exports into a truthful baseline input that Taro can interpret, enrich, and transform into maintainable, repo-aware RTL suites without regressing the Chrome Recorder JSON path. The 2026-03-09 milestone audit confirmed that Phase 13 landed the baseline loader and AST work, while Phases 14-16 remain the required closure path for selector truthfulness, suite shaping, and shipped verification evidence. Phase numbering continues from 13 because v1.2 shipped through Phase 12.

## Phases

**Phase Numbering:**
- Integer phases (13, 14, 15, 16): planned milestone work
- Decimal phases (13.1, 13.2): urgent insertions if needed later

- [x] **Phase 13: JS Input Contract & AST Recovery** - JS recorder exports become first-class baseline inputs with stable semantic extraction
- [x] **Phase 14: Truthful Selector Recovery** - weak selector evidence is upgraded when justified and called out when it is not (completed 2026-03-10)
- [ ] **Phase 15: Structured Suite Planning & Repo-aware Generation** - generated output becomes scenario-based, helper-oriented, and grounded in repo context
- [ ] **Phase 16: Verification, JSON Parity & Product Surface** - scoring, regression proof, and docs match the shipped JS baseline behavior

## Phase Details

### Phase 13: JS Input Contract & AST Recovery
**Goal**: Users can feed recorder JS exports into the normal generation flow and have Taro recover baseline intent instead of replaying raw transcript code
**Depends on**: Phase 12
**Requirements**: INPUT-01, INPUT-02, INPUT-03, QUERY-01
**Success Criteria** (what must be TRUE):
  1. User can run `taro generate <recording.js>` with the same `--dry-run`, `--output`, and `--force` flow available for JSON input.
  2. User receives regenerated project-test-shaped output from recorder JS exports instead of a copied-through executable transcript.
  3. Supported recorder JS patterns, including nested `userEvent(...)`, Testing Library queries, assertions, recorded URLs, and fallback DOM selectors, are recovered into stable baseline metadata.
  4. Accessible query intent present in the recorder JS is preserved when role/name, text, placeholder, or assertion context semantics exist.
**Plans**: 4 plans

Plans:

- [x] 13-01: Shared input contract and loader boundary
- [x] 13-02: AST recovery for recorder JS baseline intent
- [x] 13-03: JS baseline normalization and shared CLI flow
- [x] 13-04: Regression proof, JSON parity, and phase-boundary assertions

**Details:**
- `taro generate` now accepts recorder `.js` and Chrome Recorder `.json` through the same loader boundary and public flag surface.
- Recorder JS is treated as a baseline artifact that Taro parses, normalizes, and transforms instead of replaying the exported transcript.
- AST recovery preserves accessible queries, URL/title assertions, and raw selector evidence without inventing stronger queries early.
- Regression coverage now protects the public CLI JS path, shared loader, intent grouping, and explicit JSON non-regression behavior.

### Phase 14: Truthful Selector Recovery
**Goal**: Users can trust JS-derived selectors because Taro only strengthens them when it has evidence and stays explicit when it does not
**Depends on**: Phase 13
**Requirements**: QUERY-02, QUERY-03, QUERY-04
**Gap Closure**: Closes the Phase 13 → 14 audit handoff and restores the broken "Recorder JS -> truthful selector recovery" flow
**Success Criteria** (what must be TRUE):
  1. User gets stronger queries recovered from `document.querySelector(...)` steps when Taro has trustworthy evidence, or explicit warnings/checkpoints when it does not.
  2. User never receives invented selector fallbacks such as fake `data-testid` queries when the recorder baseline or live DOM cannot justify them.
  3. User can benefit from recorded URL or live DOM enrichment when it is available, without making a running browser session a hard requirement for baseline usefulness.
**Plans**: 3 plans

Plans:

- [x] 14-01: Selector resolution contract and truthful resolver outcomes
- [x] 14-02: Truthful JS generation and unresolved-selector checkpoints
- [x] 14-03: Optional live DOM enrichment and sample-backed selector regression proof

### Phase 15: Structured Suite Planning & Repo-aware Generation
**Goal**: Users receive maintainable RTL suites that reflect meaningful scenarios, safe state boundaries, and real project context
**Depends on**: Phase 14
**Requirements**: SUITE-01, SUITE-02, SUITE-03, SUITE-04
**Gap Closure**: Closes the Phase 14 → 15 audit handoff and restores the broken "Recorder JS -> repo-aware module/test generation" flow
**Success Criteria** (what must be TRUE):
  1. User receives generated tests organized around meaningful scenario boundaries and helpers instead of a flat recorder transcript.
  2. User receives multi-test suites only when required state can be recreated or shared safely across those tests.
  3. User receives output that applies learned repo conventions for imports, `userEvent.setup()`, helper style, and query scoping when the codebase provides enough evidence.
  4. User receives suites that use project context and mock intelligence strongly enough to target a real module/test shape instead of placeholder `render(<App />)` output for supported flows.
**Plans**: 3 plans

Plans:

- [ ] 15-01: Structured suite-plan contract and state-safe scenario modeling
- [ ] 15-02: Repo-aware render target, helper, and import generation
- [ ] 15-03: Gold-standard sample regression and explicit-draft fallback proof

### Phase 16: Verification, JSON Parity & Product Surface
**Goal**: Users can trust the shipped JS baseline story because quality signals, regression proof, public guidance, and milestone verification evidence all match real behavior
**Depends on**: Phase 15
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03
**Gap Closure**: Closes the Phase 15 → 16 audit handoff, restores archive readiness, and backfills the missing Phase 13 verification proof required to retire partial milestone gaps
**Success Criteria** (what must be TRUE):
  1. User can trust JS generation quality signals because scoring and verification explicitly account for JS-derived weak queries, weak assertions, placeholder output, and low-confidence generation states.
  2. User can continue generating from Chrome Recorder JSON exports without regression while v1.3 improves JS baseline fidelity.
  3. User sees matching CLI help, README guidance, and examples for JSON and JS input support, including the fact that recorder JS is treated as a baseline artifact Taro transforms.
  4. The milestone has verification artifacts strong enough to mark Phase 13's implemented INPUT-01, INPUT-02, INPUT-03, and QUERY-01 requirements satisfied at audit time.
**Plans**: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 13 → 14 → 15 → 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. JS Input Contract & AST Recovery | v1.3 | 4/4 | Complete | 2026-03-09 |
| 14. Truthful Selector Recovery | v1.3 | 3/3 | Complete | 2026-03-10 |
| 15. Structured Suite Planning & Repo-aware Generation | v1.3 | 1/3 | In Progress | - |
| 16. Verification, JSON Parity & Product Surface | v1.3 | 0/TBD | Not started | - |
