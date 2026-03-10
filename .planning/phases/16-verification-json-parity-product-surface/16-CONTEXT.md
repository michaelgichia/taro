# Phase 16: Verification, JSON Parity & Product Surface - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the shipped JS baseline story trustworthy end to end. This phase aligns Taro's scoring signals, verification proof, JSON non-regression evidence, README/help/examples, and milestone-closeout artifacts with the behavior the generator actually ships today.

This phase does not add new generation capabilities. It closes `VERIFY-01`, `VERIFY-02`, and `VERIFY-03`, and it backfills the missing Phase 13 verification proof required for v1.3 milestone closeout.

</domain>

<decisions>
## Implementation Decisions

### Low-confidence trust contract
- Keep the public score surface recognizable instead of replacing it wholesale in this phase.
- Add deterministic reasons and signals around the score so users can see why points were gained or lost.
- Use one strong summary banner in both `--dry-run` and write mode when the result is low-confidence.
- The explicit "draft/manual review required" label is score-based, not checkpoint-based.
- Trigger that explicit draft label at `C` or below.
- The banner should name the top two blockers rather than dumping every dimension detail.
- Remediation guidance should prioritize the biggest blockers first, not present a full equal-weight checklist every time.

### JSON parity proof bar
- Treat JSON parity as a public-flow contract, not just a parser-internal concern.
- Phase 16 proof must include targeted automated regressions plus at least one built-CLI JSON smoke run.
- Use a small representative JSON proof set rather than a broad matrix.
- Favor two representative JSON flows over a single toy fixture or an exhaustive matrix.
- Count behavioral regressions in the public `taro generate` contract as parity failures; not every harmless output drift needs to fail the milestone.

### Docs and worked-example emphasis
- Keep the README installer-first, but make dual-input generation support clearly visible in the main generation section.
- Keep CLI help short and push the richer trust-contract detail into README and worked examples.
- Include one honest draft-quality example that shows warnings/checkpoints instead of pretending every run is a polished happy path.
- Use a JS-primary worked example and document JSON support as a shorter supported path/note rather than giving both formats equal worked-example depth in Phase 16.

### Claude's Discretion
- Exact signal/reason schema so long as it stays deterministic and explainable.
- Exact wording of the strong low-confidence banner, as long as it clearly communicates manual review is required at `C` or below.
- Which two JSON fixtures best represent the public parity contract.
- Exact placement and formatting of the honest draft-quality example within README/examples/help-adjacent docs.

</decisions>

<specifics>
## Specific Ideas

- Use the current Add Sale JS path as the main trust-contract example for draft-quality output: it already shows repo-aware `SalesModule` resolution, explicit checkpoints, and low-confidence behavior without invented queries.
- The desired scoring direction is "deterministic, explainable, bounded, and comparable across runs" with explicit reasons/signals attached to the score rather than a thin opaque number.
- The sample scoring model the user provided is the quality bar for explainability: richer reasons and signals are good, but Phase 16 should keep the existing public score shape recognizable instead of fully replacing it.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/scorer.ts`: current query/assertion/structure/boundary scoring surface to extend with deterministic reasons/signals rather than replace outright.
- `src/core/boundary-intelligence.ts`: existing boundary analysis can provide named blockers for the new low-confidence banner and reason output.
- `src/cli/commands/generate.ts`: current public surface already logs score lines, hints, boundary warnings, syntax verification, and dry-run previews; this is the main integration point for Phase 16 trust messaging.
- `src/core/input-loader.ts` and `src/core/input-loader.test.ts`: shared JS/JSON input boundary already exists and provides the starting point for JSON non-regression proof.
- `src/core/js-parser.test.ts`, `src/core/recording-intelligence.test.ts`, `src/cli/commands/generate.test.ts`: existing regression seams that can anchor Phase 13 backfill proof and Phase 16 parity verification.
- `README.md`: current installer-first product surface; currently documents JS generation explicitly and needs dual-input truth plus an honest degraded-output example.
- `.planning/phases/14-truthful-selector-recovery/14-VERIFICATION.md` and `.planning/phases/15-structured-suite-planning-repo-aware-generation/15-VERIFICATION.md`: recent verification artifacts that establish the evidence style Phase 16 should follow.

### Established Patterns
- Scoring remains advisory rather than blocking; low scores currently emit hints but do not stop file writes.
- Unsupported boundaries and unresolved selectors remain explicit through warnings and `// taro-query-checkpoint:` comments instead of guessed queries or render targets.
- README is installer-first, while deeper behavioral nuance typically lives in worked examples and notes rather than in command help text.
- Phase closeout uses standalone `XX-VERIFICATION.md` artifacts plus updated roadmap/requirements/state tracking.

### Integration Points
- `src/cli/commands/generate.ts`: add richer score explanations, low-confidence banner behavior, and any public JSON parity smoke-test expectations reflected by dry-run output.
- `src/core/scorer.ts` and related tests: add deterministic reasons/signals while preserving recognizable score output.
- `README.md` and command help strings in the CLI: align dual-input support, low-confidence truth, and example strategy with shipped behavior.
- `.planning/phases/13-js-input-contract-ast-recovery/`: create the missing Phase 13 verification artifact so milestone audit can retire the remaining partial requirement gap.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 16 boundary.

</deferred>

---

*Phase: 16-verification-json-parity-product-surface*
*Context gathered: 2026-03-10*
