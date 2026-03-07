# Phase 6: Visual & Mock Intelligence Recovery - Research

**Researched:** 2026-03-07
**Domain:** Playwright state capture, dialog-state understanding, mock-pattern analysis, generation-time mock decisions
**Confidence:** HIGH

<user_constraints>
## User Constraints

### Locked Decisions

**Phase Goal**
- Add the missing visual- and mock-intelligence layer so generation can reason about UI states and mock strategy instead of skipping those concerns entirely
- This phase closes VIS-01, VIS-02, and MOCK-01 through MOCK-04 from the milestone audit

**Audit-Derived Scope**
- The milestone audit says Playwright inspection exists, but screenshot/state reasoning was never planned or verified
- The milestone audit says mock-aware generation is broken before code output because no dedicated mock-analysis layer exists
- Gap closure must be concrete: the phase needs real artifacts, runtime behavior, and verification evidence rather than “future-intelligence” placeholders

**Current Codebase Constraints**
- `src/core/resolver.ts` can inspect DOM elements with Playwright, but only returns accessibility metadata; it does not capture screenshots, dialog snapshots, or state descriptors
- `src/cli/commands/generate.ts` uses resolver output only for query upgrades, not for UI-state reasoning
- `src/core/scanner.ts` can detect coarse mock-pattern prevalence (`vi.mock`, `jest.mock`, `none`) but cannot identify repeated mock targets, extraction decisions, mutation lifecycle patterns, or stability issues
- Generated output currently has no mock-analysis step and no mock-intelligence diagnostics
- Phase 5 introduced `analyzeRecording()` and an intent-grouped analysis seam; Phase 6 should build on that instead of creating another separate pre-generation pipeline

### Claude's Discretion
- Exact type names for visual snapshots and mock recommendations
- Whether visual-intelligence artifacts live in `types/recording.ts` or a dedicated `types/intelligence.ts`
- Whether mock decisions are emitted as generation hints, metadata sidecars, or inline comments in generated tests
- How aggressive screenshot capture should be when a DOM-only inspection already succeeds

### Deferred Ideas
- Playwright test generation remains out of scope; Playwright is still an internal inspection tool only
- Full image-diff or OCR-style vision is not required; DOM-backed screenshot/state capture is sufficient
- Automatic mock implementation generation can stay limited to recommendations/hints rather than full code synthesis if that keeps behavior deterministic
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | Use Playwright to screenshot UI states when needed | Requires extending resolver output beyond element metadata to include visual state captures and state descriptors |
| VIS-02 | Understand multi-step dialog states | Requires dialog-aware grouping so the pipeline can tell “open dialog”, “fill dialog”, and “confirm dialog result” apart |
| MOCK-01 | Detect repeated mock targets across codebase | Requires a dedicated mock-analysis pass over existing tests and mock declarations rather than a single majority-pattern flag |
| MOCK-02 | Decide whether to inline or extract mocks | Requires deterministic heuristics based on reuse count and project conventions |
| MOCK-03 | Identify mutation lifecycle reimplementation | Requires scanning existing tests for loading/success/error mock sequences around mutations |
| MOCK-04 | Detect mock instance stability issues | Requires identifying recreated mock factories or per-test instability patterns that should influence generated advice |
</phase_requirements>

---

## Summary

Phase 6 should add **two focused intelligence modules** on top of the current pipeline:

1. **Visual intelligence**
   - deepen Playwright from element inspection into state capture
   - understand dialog state transitions
   - give generation a structured representation of “what UI state was visible” rather than only “which selector resolved”

2. **Mock intelligence**
   - scan the codebase for real mock targets and mock styles
   - infer whether mocks should be inline or extracted
   - detect mutation lifecycle and instability patterns
   - surface those decisions during generation

The existing code provides only fragments of what Phase 6 needs. `resolver.ts` already launches Playwright and can inspect DOM nodes, which is useful for VIS-01, but it has no concept of screenshots, dialogs, or UI-state summaries. `scanner.ts` already inspects test files and can see `vi.mock`/`jest.mock`, which is useful for MOCK-01, but it cannot answer the questions that matter for generation: what gets mocked repeatedly, when extraction is beneficial, and which mutation flows/tests need stable mock instances.

**Primary recommendation:** implement Phase 6 as four plans:

- visual state capture foundation
- dialog-state modeling and visual pipeline integration
- mock-intelligence analysis foundation
- mock-intelligence pipeline integration and lifecycle/stability reasoning

That keeps visual and mock recovery separate enough to stay executable while still delivering a single phase-level outcome.

---

## Current-State Findings

### Finding 1: Resolver already has the browser primitive, but not visual-state artifacts

`src/core/resolver.ts` launches Playwright and can evaluate DOM properties. That means VIS-01 does **not** need a brand-new browser stack. What’s missing is:

- screenshot capture
- a richer snapshot type for dialog/container state
- fallback rules for “when needed”
- tests proving that visual-state capture is invoked intentionally rather than on every selector

### Finding 2: Dialog understanding is currently implicit and fragile

Phase 3 added some grouping heuristics for JS recordings, and Phase 5 added intent groups for recordings. Neither layer understands dialog state as a first-class UI concept. VIS-02 needs a stronger model such as:

- dialog open trigger
- dialog visible state
- dialog fields/actions
- dialog close/confirmation state

Without that, the system can only infer dialogs from raw clicks and headings.

### Finding 3: Mock scanning today is descriptive, not actionable

`scanner.ts` can tell whether the project leans toward `vi.mock` or `jest.mock`, but that is only a convention signal. MOCK-01 through MOCK-04 require actionable findings, such as:

- repeated mocked module targets
- likely shared mock factories
- mutation state sequences in existing tests
- unstable per-test mock recreation patterns

That should live in a dedicated mock-intelligence module rather than overloading the convention scanner further.

### Finding 4: Generation currently has nowhere to consume mock advice

`generate.ts` has hooks for query resolution, scoring, verification, and convention learning, but no place to attach mock recommendations. Phase 6 therefore needs both:

- a mock-analysis result shape
- a lightweight integration point for warnings/recommendations before or alongside code generation

---

## Recommended Architecture

### Project Structure Extension

```text
src/
├── cli/
│   └── commands/
│       └── generate.ts               # Integrate visual/mock intelligence summaries
├── core/
│   ├── resolver.ts                   # Extend: screenshots, dialog-state snapshots
│   ├── recording-intelligence.ts     # Reuse intent groups as visual entry point
│   ├── scanner.ts                    # Keep convention scanning; only expose data needed downstream
│   ├── mock-intelligence.ts          # NEW: repeated target detection + decisions
│   └── ...
├── types/
│   ├── recording.ts                  # Extend with visual snapshot references if needed
│   ├── conventions.ts                # Extend with mock-analysis metadata if justified
│   └── mock-intelligence.ts          # NEW if a separate type file keeps concerns cleaner
└── ...
```

### Pattern 1: Visual inspection returns structured snapshots, not just strings

Recommended visual-intelligence output should include:

- screenshot path or capture token
- dialog/container role
- accessible title/name
- key visible actions
- optional note on why screenshot capture was triggered

This lets verification and future reconciliation work from explicit evidence instead of console-only output.

### Pattern 2: Dialog understanding should build on Phase 5 intent groups

Phase 5 already groups cleaned recordings into intents. Phase 6 should reuse that seam:

- identify which intent groups open dialogs
- mark which steps occur inside a dialog-visible state
- attach visual snapshots to those groups when a dialog or ambiguous UI state is detected

That is cleaner than trying to rebuild state understanding directly from raw recording steps.

### Pattern 3: Mock intelligence should be a dedicated analyzer with deterministic heuristics

Suggested public API:

- `scanMockTargets(projectRoot)`
- `deriveMockRecommendations(...)`
- `analyzeMutationLifecycle(...)`
- `detectMockInstability(...)`
- `analyzeMocks(projectRoot, recordingContext?)`

Deterministic heuristics are enough:

- repeated target frequency => candidate extracted mock
- one-off target => likely inline mock
- repeated loading/success/error assertions => mutation lifecycle pattern
- per-test recreated mocks with changing factories => stability issue

### Pattern 4: Generation should consume advice, not become the analyzer

`generate.ts` should stay an orchestrator. It should call visual/mock analyzers, then:

- log concise summaries
- optionally embed conservative comments or notes in generated output
- keep generation, scoring, writing, and post-write verification order intact

---

## Testing Strategy

### Automated

Add or extend tests for:

- `src/core/resolver.test.ts`
  - screenshot/state capture
  - dialog snapshot extraction
- `src/core/mock-intelligence.test.ts`
  - repeated target detection
  - inline vs extract recommendation
  - mutation lifecycle identification
  - stability issue detection
- targeted integration checks for `generate.ts` where visual/mock summaries are consumed without regressing current behavior

### Manual

One manual verification pass should cover:

- a dialog-heavy recording where state capture is triggered
- a project/mock fixture where repeated mock targets and lifecycle patterns are detected
- confirmation that generation still produces valid output and Phase 4 score/verification hooks still run

---

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Screenshot capture becomes unconditional and slows generation | Visual intelligence would make the CLI noisy and expensive | Gate screenshot capture behind dialog detection, ambiguity, or fallback-only conditions |
| Dialog modeling duplicates Phase 5 intent logic | Parallel heuristics become inconsistent | Treat Phase 5 intent groups as the upstream input to dialog-state reasoning |
| Mock analyzer grows into a second convention scanner | Responsibilities blur and tests get brittle | Keep convention scanning coarse and put actionable mock reasoning in a dedicated module |
| Generation output becomes cluttered with mock notes | Quality and readability regress | Emit concise summaries first; only add code comments when the recommendation is directly actionable |

---

## Validation Architecture

Phase 6 should remain Nyquist-friendly with **fast targeted unit tests after each plan** and **one integrated build/test pass after each wave**.

Recommended verification contract:

- Quick loop for visual work:
  - `npm run test:run -- src/core/resolver.test.ts`
- Quick loop for mock work:
  - `npm run test:run -- src/core/mock-intelligence.test.ts`
- Full regression loop:
  - `npm run build && npm run test:run -- src/core/resolver.test.ts src/core/mock-intelligence.test.ts src/core/js-parser.test.ts src/core/recording-intelligence.test.ts`

Wave 0 for Phase 6 should create `src/core/mock-intelligence.test.ts` and extend `src/core/resolver.test.ts` before the implementation-heavy plans land.

Manual verification should stay limited to one dialog/state capture check and one mock-aware generation check.

---

*Phase: 06-visual-mock-intelligence-recovery*
*Research completed: 2026-03-07*
