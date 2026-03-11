# Changelog

## Unreleased

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
