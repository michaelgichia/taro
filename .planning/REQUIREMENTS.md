# Requirements: Taro

**Defined:** 2026-03-06
**Core Value:** Reduce the effort to write and maintain tests by automatically generating high-quality, codebase-aware React Testing Library tests from browser recordings, so developers spend less time testing and more time building.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Input Processing

- [ ] **INPT-01**: Parse Chrome DevTools Recorder JSON exports
- [ ] **INPT-02**: Handle all step types (click, fill, select, scroll, assert)
- [ ] **INPT-03**: Validate input JSON schema

### Test Generation

- [ ] **GEN-01**: Generate valid React Testing Library tests
- [ ] **GEN-02**: Generate getByRole, getByText, getByLabelText queries (not CSS selectors)
- [ ] **GEN-03**: Generate proper describe/it blocks with imports
- [ ] **GEN-04**: Jest/Vitest compatibility — generate runnable tests
- [ ] **GEN-05**: Write test files to filesystem

### Context Awareness

- [ ] **CTX-01**: Read codebase conventions before generation
- [ ] **CTX-02**: Analyze existing test patterns
- [ ] **CTX-03**: Detect folder structure and naming conventions
- [ ] **CTX-04**: Analyze shared mocks
- [ ] **CTX-05**: Update internal state after each run

### Recording Intelligence

- [ ] **REC-01**: Filter redundant clicks
- [ ] **REC-02**: Filter dblClick noise
- [ ] **REC-03**: Filter cursor wandering
- [ ] **REC-04**: Identify actual user intent behind sequences

### Visual Intelligence

- [ ] **VIS-01**: Use Playwright to screenshot UI states when needed
- [ ] **VIS-02**: Understand multi-step dialog states

### Mock Intelligence

- [ ] **MOCK-01**: Detect repeated mock targets across codebase
- [ ] **MOCK-02**: Decide whether to inline or extract mocks
- [ ] **MOCK-03**: Identify mutation lifecycle reimplementation
- [ ] **MOCK-04**: Detect mock instance stability issues

### Query Intelligence

- [ ] **QRY-01**: Classify queries for brittleness
- [ ] **QRY-02**: Resolve ambiguous element targeting using DOM scoping
- [ ] **QRY-03**: Flag accessibility gaps when no clean resolution exists

### Test Design Intelligence

- [ ] **TEST-01**: Distribute concerns across test cases
- [ ] **TEST-02**: Keep helpers assertion-free
- [ ] **TEST-03**: Enforce meaningful matchers

### Self-Scoring

- [x] **SCR-01**: Score output against quality criteria before committing
- [x] **SCR-02**: Run pre-write audit checkpoint
- [x] **SCR-03**: Run post-write verification checkpoint

### Convention Learning

- [x] **CNV-01**: Derive project conventions from observation
- [x] **CNV-02**: Persist learned conventions for subsequent runs
- [x] **CNV-03**: Reduce discovery time on subsequent runs

### CLI Interface

- [x] **CLI-01**: Single command invocation from project root
- [x] **CLI-02**: Accept recording file as argument

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

- **EXEC-01**: Execute generated tests (optional)
- **MAIN-02**: Watch for component changes and update tests
- **E2E-01**: Generate Playwright tests (optional output)
- **FRAME-01**: Support Vue.js
- **FRAME-02**: Support Svelte

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Test execution | Taro generates tests only; users run them with their own test runner |
| Component modification | Taro reads components; does not modify them |
| Accessibility remediation | Taro flags gaps but does not fix components |
| E2E test generation | Taro outputs RTL only; Playwright is internal only |
| Live recording | Taro consumes exports; Chrome Recorder handles recording |
| Test maintenance | Taro generates on demand; no automatic updates |
| Mock server setup | Taro mocks at hook/module boundary only |
| Non-RTL paradigms | Taro is opinionated about RTL; Enzyme/Cypress out of scope |
| Cross-framework | React only for v1 |
| Quality guarantees | Taro scores output but final judgment belongs to engineer |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INPT-01 | Phase 1 | Pending |
| INPT-02 | Phase 1 | Pending |
| INPT-03 | Phase 1 | Pending |
| GEN-01 | Phase 1 | Pending |
| GEN-02 | Phase 1 | Pending |
| GEN-03 | Phase 1 | Pending |
| GEN-04 | Phase 1 | Pending |
| GEN-05 | Phase 1 | Pending |
| CLI-01 | Phase 1 | Complete |
| CLI-02 | Phase 1 | Complete |
| REC-01 | Phase 2 | Pending |
| REC-02 | Phase 2 | Pending |
| REC-03 | Phase 2 | Pending |
| REC-04 | Phase 2 | Pending |
| VIS-01 | Phase 2 | Pending |
| VIS-02 | Phase 2 | Pending |
| MOCK-01 | Phase 2 | Pending |
| MOCK-02 | Phase 2 | Pending |
| MOCK-03 | Phase 2 | Pending |
| MOCK-04 | Phase 2 | Pending |
| CTX-01 | Phase 3 | Pending |
| CTX-02 | Phase 3 | Pending |
| CTX-03 | Phase 3 | Pending |
| CTX-04 | Phase 3 | Pending |
| CTX-05 | Phase 3 | Pending |
| QRY-01 | Phase 3 | Pending |
| QRY-02 | Phase 3 | Pending |
| QRY-03 | Phase 3 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 3 | Pending |
| SCR-01 | Phase 4 | Complete |
| SCR-02 | Phase 4 | Complete |
| SCR-03 | Phase 4 | Complete |
| CNV-01 | Phase 4 | Complete |
| CNV-02 | Phase 4 | Complete |
| CNV-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37 ✓
- Deferred to v2: 5 (EXEC-01, MAIN-02, E2E-01, FRAME-01, FRAME-02)

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-07 after Phase 4 completion*
