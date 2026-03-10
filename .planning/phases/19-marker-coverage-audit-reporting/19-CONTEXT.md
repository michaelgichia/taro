# Phase 19: Marker Coverage Audit & Reporting - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make semantic-marker conversion quality visible and enforceable in the public `tayo generate` experience. This phase defines how marker coverage is reported, when zero conversion is treated as a quality-gate failure, and how unresolved markers are surfaced with recorder line context for manual repair.

This phase does not add new marker gestures, expand marker conversion beyond the current JS semantic-marker path, or relax truthful conversion guardrails from earlier phases.

</domain>

<decisions>
## Implementation Decisions

### Zero-conversion quality gate
- The quality gate is based on **detected semantic markers vs emitted marker-derived assertions in final output**.
- When detected markers are present and emitted marker assertions are zero, this is an explicit gate failure.
- In normal write mode, Tayo should still write the generated file, then exit with code `1`.
- In `--dry-run`, the same zero-conversion condition should also fail explicitly.
- Gate failure must be surfaced with a dedicated QUAL-02 banner/section, not only generic scoring hints.

### Coverage visibility
- Keep the existing cleanup signal and add a dedicated marker-coverage section near scoring output.
- Coverage summary must always include: `detected`, `emitted`, and `unresolved` counts.
- Default coverage detail is run-level totals only (no per-scenario breakdown by default).
- When conversion is non-zero, output should include an explicit gate PASS signal to avoid ambiguity.

### Unresolved marker reporting
- Emit one warning line per unresolved marker (not grouped-only summaries).
- Each unresolved warning must include: recorder line context, unresolved reason, target/proof hint, and marker step identifier.
- Reason phrasing should include both human-readable text and a stable reason code.
- If recorder line metadata is unavailable, warnings should use `line: unknown` and still include marker step id for traceability.

### Carried-forward constraints
- Marker conversion remains truthful and additive; unresolved evidence stays explicit rather than fabricated.
- Scope remains aligned to current semantic-marker path; no new marker authoring capabilities are introduced in this phase.

### Claude's Discretion
- Exact banner wording and ANSI styling for gate PASS/FAIL output.
- Exact text template for per-marker unresolved warnings, as long as required fields remain present.

</decisions>

<specifics>
## Specific Ideas

- Coverage and gate status should be easy to scan quickly in both local terminal use and CI logs.
- Zero-conversion failure should still preserve generated output for manual repair workflows.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/commands/generate.ts`: current public output surface already logs cleanup, score, hints, and warnings; primary integration seam for marker coverage and gate PASS/FAIL reporting.
- `src/core/suite-planner.ts`: already carries `markerAssertions` and `unresolvedMarkerAssertions` per scenario; strong source for emitted/unresolved marker accounting.
- `src/core/resolver.ts`: unresolved marker assertion reasons already normalized (`missing-anchor`, `ambiguous-field-context`, `css-only-evidence`, etc.) and include marker/source metadata.
- `src/types/recording.ts`: existing marker and unresolved types already carry line, step id, reason, and source-context fields needed for reporting.
- `src/core/scorer.ts`: existing score/reason/blocker pipeline is the seam for integrating QUAL-02 gate effects alongside current advisory scoring.

### Established Patterns
- CLI currently emits advisory quality output plus low-confidence banner; Phase 19 introduces explicit marker gate semantics on top of that contract.
- Marker gestures are already suppressed from generated user interactions and represented as resolved/unresolved marker metadata.
- Truthfulness guardrails are already enforced by resolver/planner/generator flow and must remain intact.

### Integration Points
- `src/cli/commands/generate.ts`: compute and print detected/emitted/unresolved marker totals, emit gate PASS/FAIL section, and enforce write/dry-run exit behavior for zero conversion.
- `src/core/scorer.ts` and `src/types/score.ts`: incorporate marker gate signal/reason so score output reflects QUAL-02 failure explicitly.
- `src/cli/commands/generate.test.ts`: add regressions for zero-conversion exit behavior (write and dry-run), gate banner output, and per-marker unresolved warnings with line fallback behavior.
- `src/core/suite-planner.test.ts` / `src/core/generator.test.ts`: maintain parity between planned/emitted marker assertions so coverage counts remain trustworthy.

</code_context>

<deferred>
## Deferred Ideas

- Additional marker authoring gestures beyond `dblClick`.
- JSON-path semantic marker parity.
- Rich per-scenario or machine-readable coverage exports as a separate capability beyond default run-level CLI reporting.

</deferred>

---

*Phase: 19-marker-coverage-audit-reporting*
*Context gathered: 2026-03-10*
