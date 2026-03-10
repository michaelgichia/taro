# Phase 12: Verification, Updates & Release Docs - Research

**Researched:** 2026-03-07
**Domain:** installer rerun safety, verification command trust, and release-ready onboarding docs
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-02 | User can rerun the installer to update or repair an existing installation without manual cleanup | Requires safe owned-file replacement semantics, repair of missing owned assets, and protected handling of user-edited assets |
| DIST-03 | User receives runtime-specific verification commands after installation and can use them successfully | Requires runtime-specific verification checks that prove installed assets are callable or discoverable from the documented locations |
| DIST-04 | User can follow the README for interactive, non-interactive, and development installation flows without extra guidance | Requires README restructuring around installer-first onboarding and verified commands from the shipped package surface |
</phase_requirements>

## Summary

Phase 12 should be planned as **repair semantics -> runtime verification -> release docs**:

1. **Repair and rerun behavior**
   - Phase 11 writes assets and manifests, but reruns still stop on unchanged installer-owned files unless an interactive replace confirmation is available.
   - Phase 12 needs a deterministic rerun contract that treats unchanged owned files and missing owned files as safe repair/update targets while still protecting user-edited assets and external collisions.

2. **Verification trust**
   - Phase 11 prints verification commands, but the project does not yet prove them end-to-end from a packaged release artifact.
   - Phase 12 needs runtime-aware verification helpers and smoke tests that install from the package tarball or built package boundary and then assert the documented commands resolve to the expected installed assets.

3. **README and release-ready docs**
   - The current README is still generator-first. It does not describe the installer-first flow, runtime selection prompts, non-interactive install flags, update behavior, or Codex skill installs.
   - Phase 12 should rewrite onboarding around `npx @tayo-dev/rtl@latest`, then retain `tayo generate` as the product capability after install.

## Current-State Findings

### Finding 1: Phase 11 manifests and conflict detection are good enough to support repair, but not yet update-by-default

Current implementation in `src/install/writer.ts`:
- reads the namespaced manifest if it exists
- blocks user-edited installer assets
- blocks colliding external files
- requires replace confirmation before overwriting unchanged installer-owned files

Gap:
- non-interactive reruns cannot complete a safe repair/update cycle yet, because unchanged owned assets stop with `requires-replace-confirmation`
- missing owned files are recreated only if the rest of the runtime target does not hit the replace-confirmation branch

Planning implication:
- Phase 12 should define a rerun mode that auto-replaces unchanged owned assets and recreates missing owned assets without prompting
- this behavior should remain scoped to Tayo-owned files discovered through the manifest

### Finding 2: Verification commands are displayed, but trust stops at “printed correctly”

Current implementation in `src/install/summary.ts`:
- prints verification commands per installed runtime
- prints manifest paths

Current verification:
- tests prove assets land at the expected filesystem locations
- a repo-local smoke test proves `node dist/index.js --all --global` writes the assets

Gap:
- no runtime-level verification helper currently checks that the installed files match the documented runtime command expectations
- no packaged tarball verification proves the published npm artifact contains the same assets and can drive the same installer flow

Planning implication:
- Phase 12 should add runtime-specific verification helpers or smoke checks that inspect the installed runtime directories after a package-level install
- package verification should use `npm pack` and execute the built installer from the packed artifact, not only from the workspace

### Finding 3: The README is still generator-first and now materially out of date

Current README:
- starts with `generate` usage
- documents `npm install --save-dev @tayo-dev/rtl` followed by `tayo generate`
- includes older Claude skill guidance that predates installer-native runtime assets

Gap:
- installer-first onboarding is missing
- runtime verification commands are missing
- staying-updated guidance is missing
- non-interactive examples for Claude Code, OpenCode, Gemini CLI, and Codex are missing
- development installation guidance for local package testing is missing

Planning implication:
- README changes are substantive enough to merit their own plan after runtime semantics and verification behavior are stable

### Finding 4: The package boundary is ready for tarball verification

Current package surface:
- `package.json` ships `dist`, `assets`, `README.md`, and `LICENSE`
- installer logic resolves assets from the package root

This means Phase 12 can verify:
- `npm pack` includes runtime assets
- install execution works from the packed artifact, not only the repository checkout
- README commands match the package a user would actually install

### Finding 5: The cleanest user-facing update contract is namespaced, conservative, and mostly silent

The project already chose these guardrails:
- prefer isolated namespaced asset files
- protect user-modified files
- keep external files untouched

The remaining discretion is the rerun experience for installer-owned unchanged files. The least surprising Phase 12 contract is:
- unchanged owned file -> replace automatically during rerun/update
- missing owned file -> recreate automatically during repair
- user-edited owned file -> surface protected warning, do not overwrite
- external collision -> surface blocked warning, do not mutate

This yields the “safe rerun without manual cleanup” requirement without weakening Phase 11’s protection guarantees.

## Recommended Architecture

### Pattern 1: Split preflight into “repairable” vs “protected”

Recommended classification for reruns:
- `repairable`: missing owned asset, unchanged owned asset
- `protected`: installer-owned-modified, external-collision

Planner implication:
- a dedicated plan should evolve the writer/executor contract and CLI output for rerun/update behavior

### Pattern 2: Add runtime verification helpers instead of open-coded smoke assertions everywhere

Recommended verification primitives:
- resolve runtime install target
- inspect expected asset paths
- assert the documented verification command maps to a present namespaced file or skill
- optionally expose a compact summary for CLI/reporting tests

This keeps DIST-03 testable without depending on a live runtime binary for Claude, Gemini, or OpenCode in CI.

### Pattern 3: Treat release verification as package-level, not repo-level

Recommended release proof:
- `npm run build`
- `npm pack`
- install or execute the packed artifact in a temp directory
- verify runtime assets and README commands against that packed artifact

This directly answers whether the published package matches the documented onboarding path.

## Validation Architecture

Phase 12 should use:
- targeted Vitest integration tests for rerun/repair semantics
- targeted CLI tests for verification-command and reporting behavior
- package-level smoke commands using `npm pack`
- one manual doc sanity pass to ensure README examples and headings reflect the actual CLI and runtime behavior

## Planning Recommendations

Recommended plan split:

1. **Repair & Update Semantics**
   - evolve writer/executor semantics for safe reruns
   - add tests for repairable vs protected assets

2. **Verification & Release Proof**
   - add runtime verification helpers and CLI/package smoke tests
   - prove tarball contents and packaged installer behavior

3. **README & Release Documentation**
   - rewrite README around installer-first onboarding
   - document interactive, non-interactive, update, and development install flows

This keeps code semantics stable before docs are rewritten and ensures the README reflects verified behavior rather than intended behavior.
