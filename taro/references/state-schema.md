# State Schema

Stored at:
- `.taro/state.json`
- `.taro/summary.md`

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
      "boundaryProfiles": [
        {
          "target": "@digitax/data-layer",
          "kind": "data-module | server-action | network-client | auth | router | feature-flag | env | local-child | unknown",
          "strategy": "shared-module-factory | scaffolded-module-factory | provider-wrapper | inline-safe | forbid | real-runtime",
          "supportImportPath": "@/tests/mocks/digitax-data-layer | null",
          "supportPath": "packages/dashboard/src/tests/mocks/digitax-data-layer.mock.ts | null",
          "supportExports": {
            "factoryExport": "createDataLayerMock | null",
            "resetExport": "resetDataLayerMock | null",
            "overrideExports": ["useKraCreateSaleMutationMock"],
            "spyExports": ["createSaleMutate"],
            "fixtureExports": ["mockKraSaleItem"]
          },
          "payloadSource": "mock-store | fixtures | typed-defaults | exemplar-only | manual | unknown",
          "confidence": "high | medium | low",
          "files": ["packages/dashboard/src/features/sales-module.test.tsx"],
          "evidence": ["packages/dashboard/src/features/sales-module.test.tsx: mock target @digitax/data-layer"],
          "conflictTargets": ["inline-safe"],
          "lowConfidenceScaffold": false
        }
      ],
      "boundaryExemplars": [
        {
          "file": "packages/dashboard/src/features/sales-module.test.tsx",
          "renderBoundary": "module | component | unknown",
          "boundaryTargets": ["@digitax/data-layer", "@/tests/renderWithProviders"],
          "boundaryKinds": ["data-module", "local-child"],
          "usesProviderWrapper": true,
          "usesCentralBoundarySupport": true,
          "hasMutationLifecycle": true,
          "overrideStyle": "stable-handles | inline-reconfigure | none",
          "tags": ["provider-wrapper", "central-boundary-support", "mutation-lifecycle"]
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
      "playwrightAuth": {
        "strategy": "storageState | instructions",
        "path": "playwright/.auth/user.json",
        "detectedAt": "init | refresh | generate",
        "source": "detected | manual"
      },
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
      "testFile": "/abs/path/packages/dashboard/src/features/FeatureFlow.test.tsx",
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
      },
      "boundaryPolicies": {
        "@digitax/data-layer": "shared-module-factory",
        "@/tests/renderWithProviders": "provider-wrapper"
      },
      "preferredBoundaryImplementations": {
        "@digitax/data-layer": "@/tests/mocks/digitax-data-layer"
      },
      "forbidBoundaryTargets": ["@digitax/components"],
      "queryHookPolicy": "avoid | allow-centralized | allow-when-needed"
    }
  }
}
```

## Human-Readable Summary

`.taro/summary.md` is regenerated whenever state is written. It documents:

- preferred render boundary tendency per package
- collaborator categories and canonical support modules
- learned boundary profiles with confidence and conflicts
- exemplar tests Taro can derive future structure from
- low-confidence scaffolds that still need corroboration

## Legacy Migration

When present, Taro reads and migrates these legacy files into `state.json`:

- `.taro/conventions.json`
- `.taro/history.json`
- `.taro/conventions.json`
- `.taro/history.json`

After migration, `state.json` is the primary persisted store.
