# How tr Grades a Test

`tr` produces a deterministic quality score for every RTL test file it touches. The same scorer runs behind `gen`, `geni`, `target`, `grade`, and `regrade`, so scores are comparable across commands and runs. There is no LLM in the scoring path — grades are computed from AST traversal plus regex pattern matching, which makes them reproducible and explainable.

For the strict contract shape, see [`taro/references/quality-scoring.md`](../taro/references/quality-scoring.md). This document explains the same system from the "how does it actually decide" angle.

## The four dimensions

Every test is rated on four dimensions, each 0-100, then combined into a weighted `overall` score.

| Dimension             | Weight | What it measures                            |
| --------------------- | ------ | ------------------------------------------- |
| Query Quality         | 30%    | How robustly the test locates UI under test |
| Assertion Specificity | 25%    | Whether assertions prove the right outcome  |
| Test Structure        | 20%    | Readability, organization, behavior focus   |
| Boundary Isolation    | 25%    | Mock coverage and contract fidelity         |

`overall = clamp(0, 100, queryQuality*0.30 + assertionSpecificity*0.25 + testStructure*0.20 + boundaryIsolation*0.25)`

### A. Query Quality

Rewards semantic, accessibility-aligned queries. Penalizes brittle ones.

- Robust queries (positive signal): `getByRole`, `getByLabelText`, `getByText`, `findByRole`, `findByLabelText`, `getByPlaceholderText`, `queryByRole`
- Fragile queries (negative signal): `getByTestId`, `queryByTestId`, `querySelector`, `document.querySelector`, `document.getElementBy*`
- CSS selector regexes flag ID selectors (`#button`), attribute selectors (`[data-testid="..."]`), and standalone class selectors
- Unresolved `taro-query-checkpoint` markers (which `gen` and `target` embed during generation) tank this dimension — they mean the generator could not anchor on a stable selector

### B. Assertion Specificity

Rewards strong, exact matchers. Penalizes vague ones.

- Strong matchers (positive): `toHaveTextContent`, `toHaveValue`, `toBeInTheDocument`, `toBeVisible`, payload-exact `toHaveBeenCalledWith(...)`
- Anti-patterns (deduct from matcher count):
  - `expect(screen.getBy*(...)).toBeDefined()` — the query already throws, so `.toBeDefined()` adds no information
  - `toHaveBeenCalledWith(expect.any(...))` or `expect.anything()` for payloads the test explicitly typed
  - `toHaveBeenCalledTimes(...)` and `toHaveBeenCalledWith(...)` split across a `waitFor` boundary instead of co-located inside one callback

### C. Test Structure

Rewards readable, behavior-focused organization. Penalizes generic or hidden structure.

- AST traversal confirms `describe` and `it`/`test` exist
- Penalizes setup helpers that hide `expect()` calls — failures should point at the broken contract, not at a helper
- Penalizes single-test files when component complexity (branches, branch hints) suggests multiple focused cases
- Penalizes duplicated inline renders that should share a `renderWithOverrides` helper or a base-props constant

### D. Boundary Isolation

Rewards mock contracts that match the real repo. Penalizes drift.

- Counts imported collaborators and checks each has a mock or an intentional pass-through
- Flags shared mutable state controlling mock behavior (e.g. a `let outcome = ...` toggled in `beforeEach`, or a `vi.hoisted(() => ({...}))` factory carrying state)
- Flags `afterEach(cleanup)` blocks that also touch `document.body` — that's the test patching over a leak in the component or portal layer
- Flags component mocks that reimplement behavior instead of asserting the contract shape

## Grade letter and review gate

The `overall` number maps to a letter:

| Grade | Range  |
| ----- | ------ |
| A     | 90-100 |
| B     | 80-89  |
| C     | 70-79  |
| D     | 60-69  |
| F     | 0-59   |

`requiresReview` is set to `true` (regardless of letter) when any of these hold:

- `overall < 80`
- any blocker-level reason in `blockers`
- repo contract issues were detected during mock review
- a marker quality gate failed
- marker placement conflicts or corrections were required

In other words, an A grade does not mean ship-it. The letter is a triage signal; blockers and review flags are the actual gate.

## What's inside a `ScoreResult`

Every command emits the same shape:

```jsonc
{
  "overall": 0, // 0-100 weighted aggregate
  "grade": "F|D|C|B|A",
  "dimensions": {
    "queryQuality": 0,
    "assertionSpecificity": 0,
    "testStructure": 0,
    "boundaryIsolation": 0,
  },
  "signals": {
    "queryCheckpointCount": 0,
    "roleQueryCount": 0,
    "testIdQueryCount": 0,
    "strongAssertionCount": 0,
    "presenceAssertionCount": 0,
    "visibilityAssertionCount": 0,
    "boundaryWarningCount": 0,
    "boundaryIssueCount": 0,
    "branchCoverageRatio": 1,
    "missingMockCount": 0,
    "fireEventCount": 0,
    "hasBasePropsConstant": false,
    "hasOverrideRenderHelper": false,
    "duplicatedInlineRenderCount": 0,
  },
  "reasons": [
    {
      "code": "helper-assertions",
      "dimension": "testStructure",
      "impact": "negative",
      "weight": 16,
      "message": "Shared helpers contain assertions, obscuring which contract actually failed.",
      "severity": "advisory",
    },
  ],
  "blockers": [],
  "requiresReview": false,
}
```

`reasons` is the human-readable explanation of where points came from or went. Every reason is tied to a `dimension` and a `weight`, so the score is reproducible from the reasons alone.

## Lifecycle: where the score gets computed

A single `gen` or `target` run goes through three scoring touchpoints:

1. **Pre-write audit** (`src/scorer/pre-audit.ts`) — runs `evaluateQualityGates` on the generated code before the file is written. Any `error`-severity issue becomes a _blocking_ reason and aborts the write. Warnings become advisory.
2. **Post-write verification** (`src/scorer/post-verify.ts`) — runs after the file is on disk. Confirms the file still parses and passes basic sanity checks. A failure here invalidates the run.
3. **Final scoring** (`src/scorer/quality-gates.ts`) — produces the `ScoreResult` that gets returned to the caller and snapshotted into `.taro/state.json` under `generatedTests`.

`grade` skips steps 1 and 2 — it scores an existing file in place. `regrade` reads the previous snapshot from `.taro/state.json`, rescores, and flags regressions.

Single-file `gen`, `geni`, and `target` flows may run one bounded mock-review repair pass after Taro emits mock-review findings such as `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`. When the user passes `--min-score <0-100>`, the threshold applies to the _post-review_ score, not the first pass — so the second pass has a chance to lift the score over the gate.

## Why heuristic instead of LLM-scored

Three properties matter more than smartness:

- **Deterministic** — the same input produces the same score on every machine, every run. CI gates and regression detection both depend on this.
- **Explainable** — every point lost is traceable to a specific `reason` with a `dimension` and `weight`. Reviewers can see what the score is saying.
- **Cheap** — scoring runs locally in milliseconds. It can sit in a hot loop (regrade across a directory) without budget concerns.

The tradeoff is that scoring is heuristic — it will sometimes reward something that looks right but isn't, and sometimes penalize an unusual but valid pattern. That's why `requiresReview` exists and why scores under 80 always send the test back to a human.

## State and regression detection

Every scoring run appends to `.taro/state.json`:

- `generatedTests` is the canonical ledger for `gen`, `geni`, `target`, `grade`, and `regrade`
- `gradedTests` is a legacy fallback used only when no canonical snapshot exists yet for a test path
- When Taro's scoring or generation logic changes, comparing the latest score for a test against its prior score surfaces meaningful regressions automatically

This is how `regrade` decides whether to roll a test forward or to flag it for manual review.
