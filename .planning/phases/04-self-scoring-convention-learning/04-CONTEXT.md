# Phase 4: Self-Scoring & Convention Learning - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Taro evaluates its own output quality before writing (self-scoring) and deepens what it learns from each run (convention learning). This phase adds a quality layer on top of the Phase 3 generation pipeline — it does not change how tests are generated, only how they are audited and what is persisted afterward.

Creating tests, resolving queries, or scanning conventions for the first time are Phase 1–3 concerns. Phase 4 is purely about scoring, verification, and accumulating run history.

</domain>

<decisions>
## Implementation Decisions

### Scoring criteria (SCR-01)
- Multi-dimensional rubric across three dimensions:
  1. **Query quality** — weighted average by tier: getByRole=1.0, getByLabelText=0.8, getByText=0.6, getByTestId=0.2
  2. **Assertion specificity** — toHaveValue / toBeChecked / toHaveTextContent = strong; toBeInTheDocument only = weak; score penalizes generic-only assertions
  3. **Test structure** — multiple it() blocks = better (concerns distributed); single monolithic it() = deduction; presence of describe() = good
- Aggregate score: 0–100 with letter grade (A/B/C/D/F)
- Output format: `[taro] Score: 78/100 (B) — query: 85, assertions: 70, structure: 80`
- Score is **always shown** on every run, regardless of threshold

### Failure behavior (SCR-01, SCR-02)
- Score is **advisory only** — Taro always writes the file regardless of score
- Per-dimension hints emitted when a dimension scores below 60: e.g., `[taro] Tip: 3 getByTestId queries — consider adding aria-label to improve query quality`
- CLI exit code is always 0 on successful write — score does not affect exit code

### Pre-write audit checkpoint (SCR-02)
- Score is computed and logged **before** the file is written to disk
- If score is below threshold on any dimension, hints are emitted before write proceeds
- No blocking — pre-write is a checkpoint for visibility, not a gate

### Post-write verification (SCR-03)
- After writing the file: parse it with `@babel/parser` to confirm valid JS/TS syntax
- On **syntax parse failure**: log the parse error and exit 1 — a syntax-invalid generated file is a Taro bug
- On **syntax parse success**: emit `[taro] ✓ post-write verified — file is valid`
- Import resolution and test execution are out of scope for Phase 4

### Convention learning — own output (CNV-01, CNV-02)
- After writing a test, re-scan just the generated file and merge any new patterns into `.taro/conventions.json`
- Taro learns from what it produces, not only from pre-existing tests
- Merge strategy: Claude's discretion (additive — don't overwrite existing majority votes)

### Score history (CNV-02, CNV-03)
- Each run appends an entry to `.taro/history.json`:
  `{ timestamp, recordingFile, score, dimensions: { queryQuality, assertionSpecificity, testStructure } }`
- Separate file from conventions.json — clean separation of structural conventions vs. run metrics
- History is append-only; no pruning in Phase 4

### Claude's Discretion
- Letter grade thresholds (e.g., A=90+, B=80+, C=70+, D=60+, F<60) — Claude chooses sensible defaults
- Exact dimension weights in the aggregate score
- Merge strategy when updating conventions.json from own-output re-scan
- history.json schema detail (max entries, rotation)

</decisions>

<specifics>
## Specific Ideas

- The pre-write score checkpoint and post-write verification map directly to SCR-02 and SCR-03 — they should be clearly named in the code (e.g., `runPreWriteAudit()`, `runPostWriteVerification()`)
- Score history in `.taro/history.json` enables a future "taro stats" command to show improvement trends — note for backlog

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/scanner.ts` — `scanConventions()`, `readConventions()`, `persistConventions()` (private) are the foundation for convention learning; Phase 4 needs `persistConventions` exported or a new `mergeConventions()` helper
- `src/core/generator.ts` — `generateTestFromGroups()` returns `GeneratedTestV3` with `queryResults[]`; the scorer receives this as input; `emitQuerySummary()` already computes per-query quality (reuse/extend)
- `src/core/writer.ts` — file write happens here; pre-write audit runs before `writer.ts`, post-write verification runs after
- `src/cli/commands/generate.ts` — pipeline orchestration; scoring + verification steps hook in here

### Established Patterns
- Immutable data flow: parse → normalize → resolve → generate → **[score audit]** → write → **[verify]** → **[update conventions + history]**
- Error reporting: `throw new Error('...')` with descriptive messages + `pc.red` prefix for user-facing errors (existing pattern)
- `.taro/` directory management: `mkdir({ recursive: true })` before any write (existing pattern in scanner.ts)

### Integration Points
- `src/cli/commands/generate.ts` — score audit and post-write verification both plug in here as pipeline steps; conventions.json merge and history.json append run as the final step
- `.taro/history.json` — new file alongside conventions.json; same directory management pattern

</code_context>

<deferred>
## Deferred Ideas

- `taro stats` command to display score trends from history.json — future phase or CLI extension
- Import resolution check (verify @testing-library/react is in node_modules) — deferred from post-write verification
- CI gating via --strict flag (exit 1 on low score) — not in Phase 4; score is advisory only

</deferred>

---

*Phase: 04-self-scoring-convention-learning*
*Context gathered: 2026-03-07*
