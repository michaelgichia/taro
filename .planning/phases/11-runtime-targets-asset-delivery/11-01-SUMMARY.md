---
phase: 11-runtime-targets-asset-delivery
plan: "01"
subsystem: infra
tags: [installer, registry, manifest, packaging]

requires:
  - phase: 10-installer-core-package-entry
    provides: prewrite install planning and resolved runtime targets

provides:
  - dedicated runtime registry with runtime family and namespaced container metadata
  - ownership manifest primitives and conflict classification
  - packaged asset root/source resolution
  - npm package whitelist ready to ship runtime assets

affects: [11-runtime-targets-asset-delivery, installer, packaging]

tech-stack:
  added: []
  patterns:
    - "Runtime metadata now lives in a dedicated registry instead of ad hoc type constants"
    - "Installer ownership and collision handling are modeled before write execution begins"

key-files:
  created:
    - src/install/registry.ts
    - src/install/manifest.ts
    - src/install/assets.ts
    - src/install/registry.test.ts
    - src/install/manifest.test.ts
  modified:
    - src/install/types.ts
    - src/install/resolver.ts
    - src/install/prompts.ts
    - package.json

key-decisions:
  - "Runtime family and namespaced container information moved into a dedicated registry to support Phase 11 runtime modules"
  - "Ownership manifests use file-level checksums so later plans can distinguish installer-owned assets from user-edited ones"

patterns-established:
  - "Package-visible runtime assets resolve from an `assets/` root at the package boundary, not from inline string assembly"

requirements-completed: [RUNT-05]

duration: 18min
completed: 2026-03-07
---

# Phase 11 Plan 01: Runtime Targets & Asset Delivery Summary

**Installer foundation now includes a real runtime registry, ownership manifest primitives, and package-level asset resolution for Phase 11 delivery work**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-07T17:24:00Z
- **Completed:** 2026-03-07T17:42:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added a dedicated runtime registry that separates prompt-based runtimes from Codex’s skill-first model and captures namespaced container metadata.
- Added ownership-manifest and conflict classification primitives that future write execution can build on.
- Made the package ready to ship runtime assets by resolving them from a package-level `assets/` root and whitelisting `assets` in `package.json`.

## Task Commits

Each task was completed in the same implementation commit for this plan:

1. **Task 1: Create runtime registry and ownership foundation** - `9611f9c` (feat)
2. **Task 2: Make runtime assets publishable with the package** - `9611f9c` (feat)

**Plan metadata:** pending docs closeout commit

## Files Created/Modified

- `src/install/types.ts` - Extended installer types for runtime families, asset kinds, manifests, and richer runtime definitions.
- `src/install/registry.ts` - Added the centralized runtime registry for Claude, Gemini, OpenCode, and Codex.
- `src/install/manifest.ts` - Added owned-file manifest creation and conflict classification primitives.
- `src/install/assets.ts` - Added package-root and asset-root resolution helpers for bundled runtime assets.
- `src/install/registry.test.ts` - Added registry and asset-root tests.
- `src/install/manifest.test.ts` - Added manifest and conflict classification tests.
- `src/install/resolver.ts` - Switched destination resolution to consume the runtime registry.
- `src/install/prompts.ts` - Switched prompt display names to the runtime registry.
- `package.json` - Added `assets` to the publish whitelist.

## Decisions Made

- Kept the registry asset lists empty in Wave 1 so Phase 11 foundation stays focused on contracts, not runtime payload content.
- Used checksums in the manifest primitives now because protected-manual-edit detection is a locked requirement for later write execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the prompt module to read runtime display names from the new registry**
- **Found during:** Task 1 (runtime registry extraction)
- **Issue:** Moving runtime metadata out of `types.ts` would have left the prompt flow importing a removed constant.
- **Fix:** Rewired `src/install/prompts.ts` to read display names from `src/install/registry.ts`.
- **Files modified:** `src/install/prompts.ts`
- **Verification:** `npm run build`
- **Committed in:** `9611f9c`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change. The prompt module update was required to keep the existing Phase 10 flow compiling after the registry extraction.

## Issues Encountered

- Runtime metadata extraction affected the existing prompt flow, so the registry migration had to include one prompt import update immediately.

## User Setup Required

None - this plan only established the shared installer foundation.

## Next Phase Readiness

- Wave 2 can now implement prompt-based runtimes and Codex against a stable registry and manifest model.
- No blockers remain for Plans 11-02 and 11-03.

## Self-Check: PASSED
