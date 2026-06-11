# Changelog

## Unreleased

## v1.6.0

- added cross-package-manager install support: the installer, in-product update hook, and docs now cover npm, pnpm, yarn (berry), bun, and deno instead of only pnpm
- added a `src/install/package-manager.ts` detector that resolves the user's package manager from `npm_config_user_agent`, `DENO_VERSION`, or a lockfile probe, with a typed `dlxCommand` table for the five supported managers
- rewrote `hooks/taro-check-update.js` to detect the caller's package manager at runtime and print the matching upgrade command instead of a hardcoded `pnpm dlx`
- refreshed `README.md`, `docs/USER-GUIDE.md`, and runtime help/init prompts (Claude Code, Gemini CLI, OpenCode) to lead with a five-row install matrix and use `npx` as the canonical example form
- added a GitHub Actions publish workflow so tagged releases run install, test, build, and npm publish in CI with provenance
- switched release automation from token-based npm publishing to npm Trusted Publishing on GitHub Actions
- added an `install-smoke` matrix job in `.github/workflows/dry-run.yml` that exercises the packed tarball under npm, pnpm, yarn, and bun on every PR

## v1.5.1

- renamed the published package and runtime entrypoints from `@taro-dev/rtl` to `@taro-test/rtl`
- updated installer-managed command and skill paths so all supported runtimes install under the new `@taro-test` namespace
- refreshed docs and install coverage to match the new organization strategy for future sibling packages like `@taro-test/playwright`

## v1.5.0

- added findings reporting with envelope flush, blocking gates, and clearer exit-code semantics for generation failures
- improved generator logging by routing internal progress output to stderr and preserving stdout for generated artifacts and machine-readable flows
- tightened generation behavior with updated generator logic, restored sample fixtures required by tests, and broader Playwright/runtime integration refinements

## v1.4.2

- added persistent `.taro/state.json` learning with package-scoped runner, render-helper, mock, fixture, and exemplar profiles
- added explicit `init` and `refresh` runtime commands across supported runtimes, plus state/override migration from legacy `.taro` and `.taro` learning files
- hardened generation and mock planning with package-aware state loading, override precedence, stale-state detection, atomic state writes, and validation for state and override files

## v1.4.1

- refactored the repository into a package-first layout with top-level `agents/`, `commands/`, `docs/`, `taro/`, `hooks/`, `bin/`, and `scripts/` directories
- moved authored runtime command and Codex skill content out of `assets/` and into source directories that better match the published package surface
- added wrapper scripts for install, test execution, and scaffold verification

## v1.3.0-alpha.0

- made Testing Library Recorder `.js` exports first-class inputs in the shared `taro generate` flow
- preserved baseline query and assertion evidence recovered from recorder JS
- added regression coverage for CLI parity, intent grouping, JSON non-regression, and selector-boundary behavior
