# Test Quality Scoring (Taro)

Purpose: provide one deterministic, explainable score for every stored RTL test file so Taro can:

- compare `generate`, `generate-i`, `target`, `grade`, and `regrade` on the same scale,
- measure whether changes improve quality,
- avoid regressions,
- bias future package learning toward stronger stored exemplars,
- and prioritize rewrite or repair work over time.

Scoring must be:

- project-agnostic,
- deterministic,
- explainable,
- bounded,
- comparable across runs and commands.

---

## Output

Each scored test file produces one shared `ScoreResult`:

```jsonc
{
  "overall": 0, // 0-100 weighted aggregate
  "grade": "F|D|C|B|A",
  "dimensions": {
    "queryQuality": 0, // 0-100
    "assertionSpecificity": 0, // 0-100
    "testStructure": 0, // 0-100
    "boundaryIsolation": 0, // 0-100
  },
  "signals": {
    "queryCheckpointCount": 0,
    "roleQueryCount": 0,
    "testIdQueryCount": 0,
    "strongAssertionCount": 0,
    "presenceAssertionCount": 0,
    "visibilityAssertionCount": 0,
    "visibilityOnlyTestCount": 0,
    "presenceOnlyTestCount": 0,
    "boundaryWarningCount": 0,
    "boundaryIssueCount": 0,
    "placeholderRenderTarget": false,
    "multipleTestBlocks": false,
    "minimumExpectedTestCount": 1,
    "branchCoverageRatio": 1,
    "missingMockCount": 0,
    "fireEventCount": 0,
    "hasBasePropsConstant": false,
    "hasOverrideRenderHelper": false,
    "duplicatedInlineRenderCount": 0,
    "hasStandaloneUtilityDescribe": false,
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

---

## Shared Dimensions

### A) Query Quality (0-100)

Measures how robustly the test locates the UI under test.

Signals include:

- role and label-based queries for primary interactions,
- penalties for brittle text-only recovery or `data-testid` overuse,
- penalties for unresolved `taro-query-checkpoint` markers,
- penalties for query patterns that imply weak accessibility alignment.

### B) Assertion Specificity (0-100)

Measures whether the test proves the right user or contract outcome.

Signals include:

- strong matcher use such as `toHaveTextContent`, `toHaveValue`, and payload-specific assertions,
- visible outcome assertions,
- marker-derived assertions,
- penalties for `toBeDefined()` wrappers, loose payload matchers, or split async assertions.

### C) Test Structure (0-100)

Measures whether the test is readable, convention-aligned, and behavior-focused.

Signals include:

- multiple focused test blocks when component complexity calls for them,
- stable helpers that do not hide assertions,
- alignment with component branches and high-signal branch hints,
- penalties for generic contracts, duplicated constants, repeated inline renders, or helper assertions.

### D) Boundary Isolation (0-100)

Measures whether the render boundary and mocks match real repo contracts.

Signals include:

- correct mock coverage for imported collaborators,
- stable reset behavior,
- faithful boundary handling for local children, hooks, assets, and data modules,
- penalties for missing mocks, shared mutable mock state, incomplete asset mocks, or component mock reimplementation.

---

## Aggregate Score

Taro computes one final `overall` score from the shared dimensions:

- `queryQuality * 0.30`
- `assertionSpecificity * 0.25`
- `testStructure * 0.20`
- `boundaryIsolation * 0.25`

The result is clamped to `0-100`.

---

## Grade Mapping

- A: 90-100
- B: 80-89
- C: 70-79
- D: 60-69
- F: 0-59

Manual review is still required when:

- `overall < 80`,
- blocker-level reasons are present,
- repo contract issues were detected,
- marker quality gates fail,
- or marker placement conflicts or corrections were required.

---

## Deterministic Extraction Rules

To score, Taro inspects the generated or regraded test file text and checks for patterns such as:

- query family choice and query checkpoints,
- role and label query coverage,
- strong vs weak assertions,
- visible outcome assertions,
- helper assertions,
- payload looseness such as `expect.any(...)`,
- boundary warnings and boundary issue counts,
- mock completeness and mock contract fidelity,
- marker conversion coverage,
- repeated inline renders and generic component contracts.

This scoring is heuristic, but deterministic.

---

## Evolution Rules

- Every scoring run stores a snapshot in `.taro/state.json`.
- `generatedTests` is the canonical score ledger for `generate`, `generate-i`, `target`, `grade`, and `regrade`.
- `gradedTests` remains legacy fallback history only when no canonical generated snapshot exists yet for a test.
- When Taro changes generation or repair logic, compare the latest score to the previous score for the same test path and flag meaningful regressions.
