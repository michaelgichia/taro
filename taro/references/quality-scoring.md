# Test Quality Scoring (Taro)

Purpose: Provide a deterministic, explainable score for each generated test file so Taro can:

- measure whether changes improve quality,
- avoid regressions,
- and prioritize upgrades (rewrite suggestions) over time.

Scoring must be:

- project-agnostic,
- deterministic (same input => same score),
- explainable (every point has a reason),
- bounded and comparable across runs.

---

## Output

Each generated test must produce:

```jsonc
{
  "overall": 0, // 0-100
  "grade": "F|D|C|B|A",
  "dimensions": {
    "robustness": 0, // 0-25
    "readability": 0, // 0-15
    "assertionStrength": 0, // 0-20
    "mockFidelity": 0, // 0-20
    "maintainability": 0, // 0-20
  },
  "signals": {
    "usesCssSelectors": false,
    "usesTestId": false,
    "usesRoleQueries": true,
    "hasMeaningfulAssertions": true,
    "hasMarkerDerivedAssertions": true,
    "hasDeterministicFixtures": true,
    "hasProviderWrapper": true,
    "hasUiLibraryReimplementation": false,
  },
  "reasons": [
    {
      "dimension": "robustness",
      "delta": -8,
      "reason": "Uses brittle CSS selectors for primary queries.",
    },
    {
      "dimension": "assertionStrength",
      "delta": +6,
      "reason": "Asserts user-visible success outcome (toast/dialog close).",
    },
  ],
}
```

---

## Dimension Scoring Rubric

### A) Robustness (0–25)

Start at 25. Subtract:

- -10: uses CSS selectors for user interactions or assertions
- -6: primary queries use text-only selectors where role/label exists
- -6: heavy reliance on exact, fragile UI text (not regex or role-based name)
- -3: missing `findBy*` / waits where async UI is expected (flakiness risk)
- -15: reimplements UI-library components in test mocks

Add back (up to cap 25):

- +5: uses getByRole with accessible names for main interactions
- +3: uses getByLabelText for form fields
- +2: avoids querying implementation details

### B) Readability (0–15)

Start at 10. Adjust:

- +3: helper functions are used for repeated flows (setup/fill/submit)
- +2: test names align with domain behavior (create organisation, etc.)
- +2: clear Arrange/Act/Assert separation
- +2: each test isolates a single behavior or contract instead of bundling multiple concerns
- -4: confusing naming mismatch ("profile" vs "organisation")
- -3: large monolithic tests with repeated code
- -4: test name describes user actions instead of the behavior under protection
- -4: setup helpers contain assertions, obscuring which contract actually failed

Cap 15.

### C) Assertion Strength (0–20)

Start at 8. Add:

- +6: asserts user-visible success outcome (toast, navigation, dialog close, list update)
- +6: asserts correct error outcome (validation message, error toast)
- +4: asserts API call was made with expected payload shape
- +3: includes marker-derived assertions from non-technical checkpoints (semantic dblClick markers)
- +2: asserts disabled state / loading state when relevant

Subtract:

- -8: only asserts mock called (no user-visible assertion)
- -6: asserts internal implementation details only
- -4: wraps RTL query results in `.toBeDefined()` instead of relying on query throws or explicit DOM matchers
- -4: splits related async call assertions across `waitFor` and non-`waitFor` boundaries
- -4: uses `expect.any(...)` or `expect.anything()` for deterministic payload fields

Cap 20.

### D) Mock Fidelity (0–20)

Start at 10. Add:

- +6: mocks match real API hook signature (callbacks/args)
- +4: uses persistent deterministic fixtures (mock-store)
- +3: covers both success and error branches with realistic responses
- +2: clears mocks properly between tests

Subtract:

- -8: random/inline fixtures created ad hoc each run
- -6: mocks don’t reflect actual dependency contract (false positives)
- -4: mocks rely on global state without reset
- -3: mixes shared reset utilities with additional ad hoc `.mockClear()` calls in the same suite
- -4: uses mutable shared state in `beforeEach` to steer mock behavior across tests (a hoisted object's fields are reset in `beforeEach` and mutated in test bodies — the mock's behavior is no longer co-located with the test that depends on it, and missed resets cause cross-test state leakage)
- -20: UI-library component reimplementation detected (policy violation)

Cap 20.

### E) Maintainability (0–20)

Start at 10. Add:

- +5: uses centralized fixtures (mock-store)
- +4: minimal coupling to UI structure (role/label-based)
- +3: test file structure matches project conventions (imports, cleanup)
- +2: avoids duplicated test generation (indexed in state)

Subtract:

- -6: hardcoded selectors tied to layout/CSS
- -4: missing shared fixtures; repeated data creation
- -4: reruns regenerate different data or duplicate files
- -3: generates redundant manual DOM cleanup that conflicts with RTL lifecycle management
- -3: uses regex text matchers where an exact user-visible contract should be asserted
- -4: patches leaked `document.body` state in `afterEach` instead of relying on component unmount cleanup
- -10: replaces design-system/UI-library modules with custom stand-ins

Cap 20.

---

## Grade Mapping

- A: 90–100
- B: 80–89
- C: 70–79
- D: 60–69
- F: 0–59

Hard fail cap:

- If `hasUiLibraryReimplementation` is true, cap final `overall` at 59 and `grade` at `F`.
- Always add reason:
  - `Reimplemented UI library components; behavioral fidelity reduced.`

---

## Deterministic Extraction Rules

To score, Taro inspects the generated test file text and checks for patterns:

- CSS selectors: `container.querySelector`, `document.querySelector`, or `screen.*` calls using selectors (should be absent)
- Role queries: `getByRole`, `findByRole`
- Label queries: `getByLabelText`, `findByLabelText`
- TestId queries: `getByTestId`
- User-visible assertions: `toBeInTheDocument` on toast/dialog/message; `queryByRole('dialog')` absence; route change assertions if present
- Marker-derived assertions: inline marker comments or explicit checkpoint assertion helpers
- Mock store usage: imports from detected mock-store path
- Mock reset: `beforeEach`, `afterEach`, `cleanup`, `vi.clearAllMocks`, etc.
- Helper assertions: shared `setup`/`plan*` helpers containing `expect(...)` calls
- Loose payloads: `toHaveBeenCalledWith(...)` combined with `expect.any(...)` or `expect.anything()` for deterministic fields
- UI-library reimplementation:
  - `vi.mock`/`jest.mock` targeting known UI-library modules and returning replacement component objects/functions.

This scoring is heuristic but deterministic.

---

## Evolution Rules

- Every run stores a score snapshot in `.taro/state.json`.
- When Taro changes its generation logic, compare:
  - latest score vs previous score for same component (or same recording)

- If score drops by >= 5 points:
  - warn about regression
  - keep old test unless user explicitly opts in to overwrite
