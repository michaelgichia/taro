# Milestones

## v1.4 Assertion Marker (Shipped: 2026-03-10)

**Phases completed:** 3 phases, 10 plans, 20 tasks

**Key accomplishments:**
- Added semantic marker intake contracts so recorder `dblClick` verification gestures preserve step identity, source context, and proof evidence.
- Hardened marker-to-action attachment by broadening anchor detection and scanning past non-anchor review steps.
- Introduced truthful marker assertion resolution with locked proof order and strict unresolved handling for ambiguous or weak evidence.
- Emitted marker-derived assertions in scenario bodies with helper-aware placement and strongest-proof deduplication.
- Added canonical marker coverage accounting and explicit QUAL-02 PASS/FAIL semantics in scorer and CLI output.
- Added deterministic MKR-03 unresolved-marker warnings with recorder-line traceability and regression coverage.

---

## v1.0 Tayo v1.0 (Shipped: 2026-03-07)

**Phases completed:** 7 phases, 28 plans, 22 tasks

**Key accomplishments:**
- Built the core CLI pipeline for parsing recorder exports and writing React Testing Library tests
- Added JS AST parsing, DOM-aware query resolution, grouped test generation, and matcher-aware assertions
- Added self-scoring, post-write verification, and convention learning via local `.tayo/` state
- Recovered recording intelligence to filter noisy input and infer user intent before generation
- Recovered visual and mock intelligence for dialog-aware capture and mock recommendations
- Reconciled milestone traceability, validation, and audit readiness so v1.0 can archive cleanly

---
