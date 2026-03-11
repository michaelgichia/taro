# State Schema

Stored at:
- `.taro/state.json`

Optional companion file:
- `.taro/overrides.json`

Purpose:
Persist bounded, package-scoped test knowledge that Taro can reuse across `init`, `refresh`, and `generate`.

## Rules

- stay project-agnostic
- never store secrets
- keep evidence bounded
- prefer package-scoped profiles over one repo-wide winner
- keep generated-test history bounded

## Recommended Caps

- evidence entries per signal: 50
- exemplar files per package: 5
- fixture roots per package: 25
- generated test history: 200 entries

## Implemented v1 Shape

```jsonc
{
  "version": 1,
  "meta": {
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "taroVersion": "string"
  },
  "packages": {
    ".": {
      "packagePath": ".",
      "packageName": "root-app | null",
      "testFileCount": 3,
      "conventions": {
        "scannedAt": "ISO-8601",
        "projectRoot": ".",
        "importStyle": "esm",
        "mockPattern": "vi.mock",
        "testFiles": [],
        "folderPattern": "colocated",
        "fileExtension": "ts"
      },
      "importStyle": {
        "value": "esm",
        "confidence": "high",
        "evidence": ["src/foo.test.tsx"]
      },
      "runner": {
        "value": "vitest | jest | unknown",
        "confidence": "high | medium | low",
        "evidence": ["vitest.config.ts present"]
      },
      "mockPattern": {
        "value": "vi.mock | jest.mock | none",
        "confidence": "high | medium | low",
        "evidence": ["src/foo.test.tsx"]
      },
      "folderPattern": {
        "value": "colocated | __tests__ | mixed | unknown",
        "confidence": "high | low",
        "evidence": ["src/foo.test.tsx"]
      },
      "fileExtension": {
        "value": "ts | tsx | js | jsx | mixed",
        "confidence": "high | medium | low",
        "evidence": ["src/foo.test.tsx"]
      },
      "renderHelpers": [
        {
          "name": "renderWithProviders",
          "importPath": "@/tests/renderWithProviders",
          "importKind": "named | default",
          "sourceTestFile": "src/foo.test.tsx",
          "usageCount": 4,
          "usesWithin": true
        }
      ],
      "providerWrappers": [
        {
          "name": "QueryClientProvider",
          "importPath": "@/tests/renderWithProviders",
          "sourceTestFile": "src/foo.test.tsx"
        }
      ],
      "renderTargets": [
        {
          "symbol": "SalesModule",
          "importPath": "./SalesModule",
          "sourceTestFile": "src/sales.test.tsx",
          "helperNames": ["openSaleDialog"],
          "usesWithin": true
        }
      ],
      "repeatedMockTargets": [
        {
          "target": "@/modules/orders/api",
          "files": ["src/a.test.tsx", "src/b.test.tsx"],
          "count": 2
        }
      ],
      "sharedMockFactories": [
        {
          "target": "mockOrdersApi",
          "importPath": "@/tests/mocks/orders",
          "files": ["src/a.test.tsx"],
          "count": 1
        }
      ],
      "inlineSafeMockTargets": ["next/navigation"],
      "mutationLifecycles": [],
      "instabilityWarnings": [],
      "mockRecommendations": [],
      "fixtureRoots": [
        {
          "path": "src/tests/mock-store",
          "kind": "mock-store | mocks | fixtures | factories",
          "source": "directory | import"
        }
      ],
      "exemplars": [
        {
          "file": "src/sales.test.tsx",
          "tags": ["render-helper", "mutation"]
        }
      ],
      "warnings": []
    }
  },
  "mockStore": {
    "rootDir": "src/tests/mock-store | null",
    "importHint": "@/tests/mock-store | null",
    "resources": [
      {
        "name": "orders.ts",
        "file": "src/tests/mock-store/orders.ts",
        "exports": ["ORDER_001"],
        "updatedAt": "ISO-8601"
      }
    ]
  },
  "generatedTests": [
    {
      "createdAt": "ISO-8601",
      "packagePath": "packages/dashboard",
      "recordingFile": "/abs/path/recording.js",
      "testFile": "/abs/path/recording.test.tsx",
      "quality": {
        "overall": 82,
        "grade": "B",
        "dimensions": {
          "queryQuality": 90,
          "assertionSpecificity": 80,
          "testStructure": 75,
          "boundaryIsolation": 85
        },
        "signals": {
          "queryCheckpointCount": 0,
          "roleQueryCount": 6,
          "testIdQueryCount": 0,
          "strongAssertionCount": 2,
          "weakAssertionCount": 0,
          "boundaryWarningCount": 0,
          "boundaryIssueCount": 0,
          "placeholderRenderTarget": false,
          "multipleTestBlocks": false
        },
        "reasons": []
      },
      "requiresReview": false
    }
  ]
}
```

## Override File

`.taro/overrides.json` is not merged into `state.json`. It is read separately at runtime.

Implemented shape:

```jsonc
{
  "packages": {
    "packages/dashboard": {
      "runner": "vitest | jest",
      "renderHelper": {
        "name": "renderDashboard",
        "importPath": "@/tests/renderDashboard"
      },
      "forbidMocks": ["@digitax/components"],
      "preferredSharedMocks": {
        "@digitax/data-layer": "@/tests/mocks/digitax-data-layer"
      }
    }
  }
}
```

## Legacy Migration

When present, Taro reads and migrates these legacy files into `state.json`:

- `.taro/conventions.json`
- `.taro/history.json`
- `.taro/conventions.json`
- `.taro/history.json`

After migration, `state.json` is the primary persisted store.
