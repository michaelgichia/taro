# Requirements: Tayo

**Defined:** 2026-03-10
**Core Value:** Put high-quality RTL test generation inside Claude Code, OpenCode, Gemini CLI, and Codex with near-zero setup friction

## v1 Requirements

Requirements for milestone v1.4 Assertion Marker. Each maps to roadmap phases.

### Marker Detection

- [x] **MARK-01**: Recorder `dblClick` steps on visible, meaningful targets are detected as semantic assertion markers instead of ordinary interaction steps
- [x] **MARK-02**: Marker detection keeps the original recorder step context so conversion can stay attached to the UI action the user intended to verify

### Assertion Resolution

- [x] **ASSERT-01**: Marker conversion resolves to role-and-name assertions when accessible role evidence and an accessible name are present
- [x] **ASSERT-02**: Marker conversion resolves to visible-text assertions when text evidence is present and no stronger role-and-name evidence exists
- [x] **ASSERT-03**: Marker conversion resolves to label-or-placeholder assertions for form inputs when explicit field context exists and stronger evidence is absent
- [x] **ASSERT-04**: Marker-derived assertions are emitted in the nearest relevant generated test block rather than leaving the `dblClick` marker as a user interaction

### Quality and Reporting

- [x] **QUAL-01**: Tayo counts every semantic marker detected in the parsed recording and every assertion produced from those markers
- [x] **QUAL-02**: Tayo marks assertion strength as a quality-gate failure when semantic markers are present but zero marker-derived assertions are generated
- [x] **QUAL-03**: Tayo reports unresolved markers with warnings that cite the original recording line number when conversion cannot be completed truthfully

### Guardrails

- [x] **SAFE-01**: Marker assertions remain additive and do not replace required happy-path, validation, or failure coverage in generated tests
- [x] **SAFE-02**: Tayo never generates marker assertions from screenshots, hidden implementation details, generic containers, icon-only targets, or dynamic CSS-only selectors

## v2 Requirements

Deferred beyond milestone v1.4.

### Marker Authoring

- **AUTHOR-01**: User can choose alternative lightweight recorder gestures beyond `dblClick` for assertion marking
- **AUTHOR-02**: User can review and edit marker conversions interactively before Tayo writes the final test file

### Recorder Workflow

- **FLOW-01**: Recorder exports can carry marker intent through a tighter import flow than manual file export
- **FLOW-02**: Marker guidance suggests source-component remediation when accessibility gaps block truthful conversion

## Out of Scope

Explicitly excluded from milestone v1.4 Assertion Marker.

| Feature | Reason |
|---------|--------|
| Playwright screenshot-derived assertions | Marker conversion must stay grounded in recorder evidence, not visual heuristics |
| Silent CSS-selector fallback assertions | CSS-only evidence is too weak and must remain unresolved with warnings |
| Generic modal-wrapper, table-row, or icon target conversion | These are ambiguous markers and should not produce fabricated assertions |
| Broader recorder authoring UX beyond assertion markers | Keep the milestone focused on the marker convention and its quality guarantees |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MARK-01 | Phase 17 | Complete |
| MARK-02 | Phase 17 | Complete |
| ASSERT-01 | Phase 18 | Complete |
| ASSERT-02 | Phase 18 | Complete |
| ASSERT-03 | Phase 18 | Complete |
| ASSERT-04 | Phase 18 | Complete |
| QUAL-01 | Phase 19 | Complete |
| QUAL-02 | Phase 19 | Complete |
| QUAL-03 | Phase 19 | Complete |
| SAFE-01 | Phase 18 | Complete |
| SAFE-02 | Phase 18 | Complete |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after Phase 18 completion*
