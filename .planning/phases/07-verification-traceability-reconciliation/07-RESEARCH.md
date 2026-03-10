# Phase 7: Verification & Traceability Reconciliation - Research

**Researched:** 2026-03-07
**Domain:** milestone audit reconciliation, Nyquist validation backfill, requirement traceability normalization, verification evidence cleanup
**Confidence:** HIGH

<user_constraints>
## User Constraints

### Locked Decisions

**Phase Goal**
- Reconcile milestone verification artifacts, Nyquist coverage, and requirement traceability so implemented behavior is audit-clean and the milestone can be archived honestly
- This phase closes the audit-era partial evidence for INPT-*, GEN-*, CTX-*, QRY-*, TEST-*, SCR-*, and CNV-* requirements

**Audit-Derived Scope**
- The milestone audit identified three classes of remaining work:
  - stale verification documents whose body content does not match the current verified status
  - missing or draft Nyquist validation artifacts
  - incomplete requirement traceability caused by missing summary metadata and stale `REQUIREMENTS.md` checkboxes
- Phase 7 must use real evidence, not optimistic box-checking; every completed requirement needs current verification support

**Current Artifact Constraints**
- Phase 1 still has a passed frontmatter header in `01-VERIFICATION.md`, but the body retains stale `Status: gaps_found` language and unresolved historical narrative
- Phase 1 still lacks a `01-VALIDATION.md`, and the audit explicitly calls out GEN-04 as requiring stronger runnable-test proof
- Phase 3 has passed code and verification, but `03-VERIFICATION.md` still contains a stale TEST-03 gap section while `03-VALIDATION.md` remains draft / non-compliant
- Phase 4 has a clean verification report, but it lacks `04-VALIDATION.md` and its summaries do not carry requirement-completion metadata
- `REQUIREMENTS.md` is the milestone truth table, but it still leaves many already-verified requirements unchecked

### Claude's Discretion
- Exact summary-frontmatter schema used to backfill older plans, as long as it stays consistent with existing phase docs
- Whether GEN-04 proof is captured through a temporary harness, a repo-local fixture, or a narrowly scoped manual verification note
- Whether the final milestone audit rerun is performed via the audit skill or a local equivalent, provided the resulting report is authoritative

### Deferred Ideas
- New product features are out of scope; this phase is about evidence, traceability, and audit cleanliness
- Rewriting completed implementation phases is out of scope unless a documentation gap exposes a real verification defect
- v2 requirements remain deferred and should not be pulled into milestone-complete status
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INPT-01 | Parse Chrome DevTools Recorder JSON exports | Requires Phase 1 verification/traceability evidence to be restated consistently |
| INPT-02 | Handle all step types (click, fill, select, scroll, assert) | Requires Phase 1 evidence and requirement table updates |
| INPT-03 | Validate input JSON schema | Requires Phase 1 verification artifacts to align with the current passed state |
| GEN-01 | Generate valid React Testing Library tests | Requires reconciled Phase 1 verification and summary metadata |
| GEN-02 | Generate getByRole, getByText, getByLabelText queries (not CSS selectors) | Requires Phase 1 evidence to remain honest after later pipeline fixes |
| GEN-03 | Generate proper describe/it blocks with imports | Requires Phase 1 traceability backfill |
| GEN-04 | Jest/Vitest compatibility — generate runnable tests | Requires stronger runnable-test proof than the original audit could accept |
| GEN-05 | Write test files to filesystem | Requires Phase 1 traceability backfill |
| CTX-01..CTX-05 | Context-awareness requirements | Already implemented in Phase 3; needs verification/validation/traceability normalization |
| QRY-01..QRY-03 | Query-intelligence requirements | Already implemented in Phase 3; needs stale-gap cleanup and compliant validation |
| TEST-01..TEST-03 | Test-design requirements | Already implemented in Phase 3; needs summary/verification consistency |
| SCR-01..SCR-03 | Self-scoring requirements | Already implemented in Phase 4; needs validation + summary traceability |
| CNV-01..CNV-03 | Convention-learning requirements | Already implemented in Phase 4; needs validation + summary traceability |
</phase_requirements>

---

## Summary

Phase 7 should be executed as **artifact reconciliation in three parallel tracks plus one milestone consolidation plan**:

1. **Phase 1 reconciliation**
   - backfill summary metadata
   - author `01-VALIDATION.md`
   - rewrite `01-VERIFICATION.md` so body and frontmatter match
   - produce stronger GEN-04 runnable-output evidence

2. **Phase 3 reconciliation**
   - remove stale TEST-03 gap language
   - convert `03-VALIDATION.md` from draft placeholders into a compliant artifact
   - normalize summary metadata where it is incomplete or misleading

3. **Phase 4 reconciliation**
   - add `04-VALIDATION.md`
   - backfill summary metadata for SCR/CNV requirements
   - keep verification evidence aligned with the passed Phase 4 runtime checks

4. **Milestone consolidation**
   - update `REQUIREMENTS.md` using the reconciled phase evidence
   - rerun the milestone audit and replace the stale pre-recovery report
   - create Phase 7 verification output and route the project cleanly to milestone completion

This keeps write scopes mostly disjoint during the first wave, then centralizes root-level traceability and audit updates in the final wave.

---

## Current-State Findings

### Finding 1: The remaining milestone gap is mostly evidence integrity, not missing implementation

Phases 5 and 6 closed the genuinely missing REC/VIS/MOCK behavior. The remaining audit blockers are now concentrated in:

- verification documents that still describe old failures
- missing Nyquist validation files
- requirement tables and summary metadata that were never updated after implementation completed

That means Phase 7 should avoid feature work unless a verification rerun exposes a real defect.

### Finding 2: Summary metadata is a real dependency for audit cleanliness

The audit explicitly called out missing summary metadata as one reason requirements remained only partially evidenced. Backfilling `requirements-completed` (or the existing equivalent naming used by the repo) is therefore part of the implementation, not optional cleanup.

### Finding 3: Phase 1 needs stronger GEN-04 proof than the original milestone had

The audit could not fully satisfy GEN-04 because the original Phase 1 report still depended on a human harness check. Phase 7 should plan one concrete runnable-output verification path:

- generate a test from a controlled fixture
- execute it in a minimal Vitest/RTL harness
- record the command and result in the reconciled Phase 1 verification artifacts

If that cannot be fully automated, the manual proof must still be specific and actually performed during execution.

### Finding 4: Nyquist artifacts must be made truthful, not merely present

Phase 3 already has a `03-VALIDATION.md`, but it is still draft and non-compliant. Phase 4 has no validation artifact at all. Phase 7 therefore needs to create or revise validation documents based on commands that actually exist and can be rerun during execution.

### Finding 5: The milestone audit itself is now stale

`v1.0-MILESTONE-AUDIT.md` was produced before Phase 5 and Phase 6 were finished. Phase 7 must rerun the milestone-level audit after the artifact cleanup, otherwise the project will still appear blocked even if the underlying evidence is fixed.

---

## Recommended Architecture

### Pattern 1: Treat each completed phase as a source-of-truth bundle

For Phases 1, 3, and 4, Phase 7 should reconcile three layers together:

- `*-SUMMARY.md` metadata
- `*-VERIFICATION.md`
- `*-VALIDATION.md`

No requirement should be marked complete in `REQUIREMENTS.md` until those layers agree.

### Pattern 2: Keep root traceability updates until the final consolidation wave

`REQUIREMENTS.md`, `STATE.md`, `ROADMAP.md`, and the milestone audit report are shared documents. To keep the first wave parallelizable, phase-local artifacts should be reconciled first, and root documents should only be updated once the evidence is stable.

### Pattern 3: Prefer rerunning commands over paraphrasing old claims

When reconciling a stale verification document, the execution plan should rerun the supporting command wherever possible and record that fresh result. This is especially important for:

- Phase 1 runnable-output proof
- Phase 3 validation sign-off
- Phase 4 validation creation
- final milestone audit rerun

### Pattern 4: Preserve honesty around unresolved limits

If any requirement still depends on manual verification after the rerun, Phase 7 should document that explicitly rather than silently marking it complete. The goal is archive-ready honesty, not optimistic paperwork.

---

## Testing Strategy

### Automated

Phase 7 should rely on rerunning the already-established targeted suites:

- Phase 1 / core output confidence:
  - `npm run build`
  - targeted CLI generation checks against controlled fixtures
- Phase 3 / query-context confidence:
  - `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts`
- Phase 4 / scoring-convention confidence:
  - `npm run build`
  - targeted generate runs that exercise scoring and `.tayo` persistence
- Final phase regression:
  - `npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/core/generator.test.ts`
  - `npm run build`

### Manual

One manual or semi-manual proof is still appropriate for GEN-04 if a lightweight automated harness cannot be cleanly embedded in the repo:

- generate a real test from a controlled fixture
- execute it in a minimal React Testing Library/Vitest harness
- record the exact commands and result in the reconciled Phase 1 verification report

The final milestone audit rerun should also be inspected manually to ensure it reflects the newly reconciled artifact state.

---

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Requirements are checked complete without sufficient evidence | The milestone would remain audit-fragile | Only update `REQUIREMENTS.md` after phase-local verification/validation artifacts are reconciled |
| Summary metadata backfill becomes speculative | Audit cross-reference could still be misleading | Derive metadata strictly from the already-completed plans and verification reports |
| GEN-04 remains weakly evidenced | Milestone archive would still be blocked on runnable-test honesty | Plan a specific runnable-output proof path in Wave 1 |
| Validation docs stay templated and non-actionable | Nyquist compliance would still be partial | Rewrite validation files using real commands, real files, and truthful sign-off criteria |

---

## Validation Architecture

Phase 7 should be Nyquist-friendly even though it is documentation-heavy: every plan must still have a concrete verification loop tied to a real rerunnable command or a narrowly scoped manual verification.

Recommended contract:

- **Wave 1 quick loops**
  - Phase 1 reconciliation: `npm run build`
  - Phase 3 reconciliation: `npm run test:run -- src/core/js-parser.test.ts src/core/resolver.test.ts src/core/scanner.test.ts src/core/generator.test.ts`
  - Phase 4 reconciliation: `npm run build`
- **Wave 2 full reconciliation loop**
  - `npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts src/core/generator.test.ts`
  - `npm run build`
  - rerun milestone audit and inspect resulting `v1.0-MILESTONE-AUDIT.md`

Phase 7 does not need a Wave 0 test-stub plan, but its validation strategy must explicitly cover:

- missing Phase 1 and Phase 4 validation artifacts
- stale Phase 3 validation status
- the final milestone audit rerun

---

*Phase: 07-verification-traceability-reconciliation*
*Research completed: 2026-03-07*
