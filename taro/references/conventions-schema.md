# Conventions Schema

Stored in:
- `.taro/state.json`
- optional `.taro/overrides.json`

Purpose:
Describe how Taro currently learns and applies test conventions in v1.

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
      "forbidMocks": ["@digitax/components"],
      "preferredSharedMocks": {
        "@digitax/data-layer": "@/tests/mocks/digitax-data-layer"
      }
    }
  }
}
```

## How Conventions Change

- `init` performs the first bounded repo scan and writes `.taro/state.json`.
- `refresh` rescans package profiles and rewrites state from fresh evidence.
- `generate` bootstraps state when missing, then refreshes state again after a successful write.

## Practical Interpretation

When generated output drifts:

- missing or weak package profiles usually mean `init` was not run, or the package has too few local examples
- wrong runner or render helper should be fixed with package-local examples first, then overrides if the repo is mixed
- repo fallback is acceptable, but it is weaker than a package-specific profile and should be described that way
