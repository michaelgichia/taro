# Unified State Schema

Stored at:
.taro/state.json

Purpose:
Persistent, self-evolving knowledge graph of the repository and Taro runs.

Rules:
- Must remain project-agnostic.
- Must never store secrets.
- Must store evidence and confidence for learned signals.
- Must remain bounded in size.

---

## Storage Limits

Recommended caps:

* conventions evidence per signal: 50
* sampledFiles per scan: 50
* surface scan files per run: 5
* generatedTests entries: 200 (rotate oldest)
* auth recipes: 10 (keep by scope recency)

---

## Schema

```jsonc
{
  "version": 1,

  "meta": {
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "tayoVersion": "string"
  },

  "conventions": {
    "signals": {}
  },

  "auth": {
    "recipes": []
  },

  "mockStore": {
    "rootDir": "string | null",
    "importHint": "string | null",
    "resources": [
      { "name": "string", "file": "string", "exports": ["string"], "updatedAt": "ISO-8601" }
    ]
  },

  "generatedTests": [
    {
      "recordingHash": "sha256:...",
      "recordingUrl": "string",
      "sourceFile": "string",
      "testFile": "string",
      "dependencies": { "apiCalls": ["string"], "hooks": ["string"] },
      "quality": {
        "overall": 0,
        "grade": "F|D|C|B|A",
        "dimensions": {
          "robustness": 0,
          "readability": 0,
          "assertionStrength": 0,
          "mockFidelity": 0,
          "maintainability": 0
        },
        "signals": {
          "usesCssSelectors": false,
          "usesTestId": false,
          "usesRoleQueries": false,
          "hasMeaningfulAssertions": false,
          "hasDeterministicFixtures": false,
          "hasProviderWrapper": false,
          "hasUiLibraryReimplementation": false
        },
        "reasons": [
          { "dimension": "string", "delta": 0, "reason": "string" }
        ]
      },
      "verification": {
        "mockAudit": {
          "forbiddenReimplementations": ["string"],
          "allowedBoundaryMocks": ["string"]
        },
        "checkpoint": {
          "status": "none|approval_required",
          "reason": "string|null",
          "blockedWrites": false
        }
      },
      "discovery": {
        "surfaceScan": {
          "count": 0,
          "selectedFiles": ["string"],
          "skippedExpansions": ["string"],
          "limitedByBudget": false
        }
      },
      "createdAt": "ISO-8601"
    }
  ]
}
```

---

## Checkpoint Write Rule

When `verification.checkpoint.status` is `approval_required`:

- Taro must not append a new generatedTests history entry.
- Taro must output checkpoint details and stop write operations for generated tests/state history.
