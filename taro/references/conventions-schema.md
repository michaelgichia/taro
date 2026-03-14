# Conventions Schema

Stored in:
- `.taro/state.json`
- optional `.taro/overrides.json`

Purpose:
Describe how Taro learns package-scoped test conventions and boundary strategy in v1.

## Source of Truth

Taro does not persist a standalone `conventions.json` anymore.

Convention learning now lives inside package profiles under:

```jsonc
.taro/state.json -> packages.<packagePath>
```

The target package is resolved from the recording/output path, with repo-level fallback when no package-specific profile matches.

## Learned Signals Per Package

Each package profile stores:

```jsonc
{
  "packagePath": "packages/dashboard",
  "packageName": "@repo/dashboard",
  "testFileCount": 12,
  "conventions": {
    "importStyle": "esm",
    "mockPattern": "vi.mock",
    "folderPattern": "colocated",
    "fileExtension": "ts"
  },
  "importStyle": {
    "value": "esm",
    "confidence": "high",
    "evidence": ["packages/dashboard/src/foo.test.tsx"]
  },
  "runner": {
    "value": "vitest",
    "confidence": "high",
    "evidence": ["packages/dashboard: vitest.config.* present"]
  },
  "renderHelpers": [
    {
      "name": "renderWithProviders",
      "importPath": "@/tests/renderWithProviders",
      "importKind": "named",
      "sourceTestFile": "packages/dashboard/src/foo.test.tsx",
      "usageCount": 8,
      "usesWithin": true
    }
  ],
  "providerWrappers": [],
  "renderTargets": [],
  "repeatedMockTargets": [],
  "sharedMockFactories": [],
  "boundaryProfiles": [],
  "boundaryExemplars": [],
  "inlineSafeMockTargets": [],
  "fixtureRoots": [],
  "exemplars": [],
  "warnings": []
}
```

## Effective Convention Resolution

Generation uses this precedence order:

1. `.taro/overrides.json`
2. matching package profile in `.taro/state.json`
3. repo fallback package profile
4. generic safe defaults

Overrides support:

```jsonc
{
  "packages": {
    "packages/dashboard": {
      "runner": "vitest",
      "renderHelper": {
        "name": "renderDashboard",
        "importPath": "@/tests/renderDashboard"
      },
      "forbidMocks": ["@/components/ui-kit"],
      "preferredSharedMocks": {
        "@/features/orders/api": "@/tests/mocks/orders-api"
      },
      "boundaryPolicies": {
        "@/features/orders/api": "shared-module-factory"
      },
      "preferredBoundaryImplementations": {
        "@/features/orders/api": "@/tests/mocks/orders-api"
      },
      "forbidBoundaryTargets": ["@/components/ui-kit"],
      "queryHookPolicy": "avoid"
    }
  }
}
```

## Boundary Signals Per Package

Beyond runner and file placement, Taro now learns:

- `boundaryProfiles[]` for collaborators abstracted away from the render boundary
- `boundaryExemplars[]` for real tests that show how those collaborators are composed
- whether the repo prefers shared module factories, provider wrappers, inline-safe mocks, or real runtime boundaries
- which support modules expose stable reset/override handles for per-test mutation-state coverage

## How Conventions Change

- `init` performs the first bounded repo scan and writes `.taro/state.json`.
- `refresh` rescans package profiles and rewrites state from fresh evidence.
- `generate` bootstraps state when missing, derives from learned boundary exemplars, writes `.taro/summary.md`, and refreshes state again after a successful write.

## Practical Interpretation

When generated output drifts:

- missing or weak package profiles usually mean `init` was not run, or the package has too few local examples
- wrong runner or render helper should be fixed with package-local examples first, then overrides if the repo is mixed
- boundary drift should be fixed by strengthening local collaborator examples or overrides, not by teaching Taro to inline more repo-specific implementations
- repo fallback is acceptable, but it is weaker than a package-specific profile and should be described that way
