# Conventions Schema (Self-Evolving Signals)

Stored in unified state at:
.tayo/state.json → conventions.signals

Goal:
Learn conventions over time without imposing assumptions.

Principle:

- Record observations (evidence)
- Derive candidates
- Track confidence
- Keep ranked alternatives when mixed
- Stay project-agnostic

---

## Signal Shape

Each signal uses this shape:

```jsonc
{
  "value": "any",
  "confidence": 0.0,
  "evidence": [
    {
      "file": "path",
      "kind": "import|call|usage|pathPrefix|wrapper",
      "match": "string"
    }
  ],
  "updatedAt": "ISO-8601"
}
```

Signals may store a single value or a ranked list of candidates.

---

## Required Signals

### testFramework

```jsonc
{
  "value": "vitest|jest|unknown",
  "confidence": 0.0,
  "evidence": []
}
```

Evidence examples:

- import from "vitest"
- import from "@jest/globals"
- describe/test usage patterns when imports are absent

### mockStrategy

```jsonc
{
  "value": "vi.mock|jest.mock|msw|unknown",
  "confidence": 0.0,
  "evidence": []
}
```

Evidence examples:

- vi.mock(
- jest.mock(
- setupServer(
- http.get(

### importAliases

Ranked candidates:

```jsonc
{
  "value": [
    { "alias": "@/", "count": 12, "confidence": 0.8 },
    { "alias": "~/", "count": 3, "confidence": 0.2 }
  ],
  "confidence": 0.8,
  "evidence": []
}
```

### renderHelpers

Ranked candidates:

```jsonc
{
  "value": [
    {
      "name": "renderWithProviders",
      "path": "@/tests/utils/render",
      "count": 5,
      "confidence": 0.7
    }
  ],
  "confidence": 0.7,
  "evidence": []
}
```

### queryStyle

Tracks observed querying patterns:

```jsonc
{
  "value": {
    "usesRoleQueries": true,
    "usesLabelQueries": true,
    "usesTestId": false
  },
  "confidence": 0.6,
  "evidence": []
}
```

### sharedMockSetups

Ranked reusable mock setup imports:

```jsonc
{
  "value": [
    {
      "path": "@/tests/mocks/digitax-components",
      "count": 4,
      "confidence": 0.8
    }
  ],
  "confidence": 0.8,
  "evidence": []
}
```

Evidence examples:

- side-effect mock setup imports in test files
- centralized mock bootstrap modules reused across directories

Generation preference:

- If `sharedMockSetups` has confidence >= 0.8, prefer importing the setup over re-mocking the same UI package locally.

---

## Confidence Rules (Deterministic)

Suggested confidence computation:

- For categorical signals:
  confidence = topCount / totalRelevantCount (clamp 0..1)
- For ranked lists:
  overall confidence = topCount / totalCount
- If totalRelevantCount < 3:
  cap confidence at 0.5 (insufficient evidence)

If two candidates are close (difference <= 10%):

- keep both candidates
- reduce confidence by 0.1

---

## Update/Merge Rules

On each run:

1. Add new evidence to existing evidence (bounded cap).
2. Recompute counts and confidence.
3. Update updatedAt.
4. Never delete a signal; mark unknown if confidence falls.

Generation must prefer signals with confidence >= 0.8.
Otherwise use safe fallback and log limitation.
