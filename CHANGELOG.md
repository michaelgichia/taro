# Changelog

## Unreleased

- refactored the repository into a package-first layout with top-level `agents/`, `commands/`, `docs/`, `taro/`, `hooks/`, `bin/`, and `scripts/` directories
- moved authored runtime command and Codex skill content out of `assets/` and into source directories that better match the published package surface
- added wrapper scripts for install, test execution, and scaffold verification

## v1.3.0-alpha.0

- made Testing Library Recorder `.js` exports first-class inputs in the shared `tayo generate` flow
- preserved baseline query and assertion evidence recovered from recorder JS
- added regression coverage for CLI parity, intent grouping, JSON non-regression, and selector-boundary behavior
