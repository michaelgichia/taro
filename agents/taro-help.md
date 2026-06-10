---
name: "@tr/rtl-help"
description: "Route Codex users to the correct packaged Taro skill and explain the installed Codex entrypoints. Use when the user asks how to use Taro in Codex, which Taro skill to invoke, whether installation worked, or whether they need init, refresh, overrides, generation, conventions, or mocks guidance."
---

# Taro Codex Help

## Entrypoint

Invoke this skill with `$@tr/rtl-help`.

## Installed skill surface

- `$@tr/rtl-init` for the recommended first step after install or reinstall
- `$@tr/rtl-refresh` for maintenance, resync, and owned-asset repair
- `$@tr/rtl-overrides` for scaffolding a starter `.taro/overrides.json` from learned state
- `$@tr/rtl-gen` for Recorder-to-RTL generation
- `$@tr/rtl-geni` for Recorder-to-RTL generation that forces interactive auth recovery
- `$@tr/rtl-grade` for grading an existing test file and storing a new grade snapshot in `.taro/state.json`
- `$@tr/rtl-regrade` for regrading an existing test file, or regrading every test in one directory with `--directory-loop`, while tracking progress in `.taro/state.json` or `.taro/directory-loop/`
- `$@tr/rtl-target` for component-targeted or directory-loop RTL generation, with an optional Recorder file for single-file flows
- `$@tr/rtl-mocks` for standalone mock and fixture review, and as the bounded second-pass review contract used by single-file generation
- `$@tr/rtl-conventions` for convention-aware generation guidance

## Routing guide

- Use `$@tr/rtl-init` when the user has just installed or reinstalled Taro and needs the first runtime-native step.
- Use `$@tr/rtl-refresh` when installed assets need maintenance, repair, or resync.
- Use `$@tr/rtl-overrides` when the user wants Taro to scaffold a starter `.taro/overrides.json` from learned package state.
- Use `$@tr/rtl-gen` when the user already has a Testing Library Recorder `.js` export and wants a test generated.
- Use `$@tr/rtl-geni` when the user wants the same generation flow but needs interactive auth recovery forced for that run.
- Use `$@tr/rtl-grade` when the user wants a score for an existing `*.test.*` file and wants that score tracked in `.taro/state.json`.
- Use `$@tr/rtl-regrade` when the user wants to compare a changed test against its latest stored snapshot and append a new stored snapshot, or when they want to batch regrade one test directory with `--directory-loop` and follow progress in `.taro/directory-loop/`.
- Use `$@tr/rtl-target` when the user wants to point Taro at a specific component file, or at a component directory for directory-loop mode, and optionally also provide a Recorder file for single-file targeting.
- Use `$@tr/rtl-mocks` when the user wants dedicated mock repair guidance, or when a generated test still has mock-related findings after a single-file generation run.
- Use `$@tr/rtl-conventions` when the user asks why generated output follows a certain style, file location, import pattern, or helper setup.

## Default workflow

1. Confirm whether the user needs initialization, refresh, overrides scaffolding, generation, grading, convention diagnosis, or mock guidance.
2. Ask for the recording path, component path, or generated test path only if that input is still missing.
3. Choose the matching packaged Taro skill.
4. For first-time setup after install or reinstall, use `$@tr/rtl-init`.
5. For maintenance, resync, or repair, use `$@tr/rtl-refresh`.
6. For manual policy scaffolding, use `$@tr/rtl-overrides`.
7. For Recorder-first generation, use `$@tr/rtl-gen`. For forced interactive auth recovery, use `$@tr/rtl-geni`. For existing-test grading, use `$@tr/rtl-grade` or `$@tr/rtl-regrade`. Use `$@tr/rtl-regrade` with `--directory-loop` when the request is to regrade every test in one directory. For explicit component targeting, use `$@tr/rtl-target`.
8. Single-file `gen`, `geni`, and `target` flows may run one bounded `$@tr/rtl-mocks` repair pass after Taro emits mock-review findings. Requested `--min-score` gates apply to the final post-review result, not the first pass. Directory-loop target stays review-only in v1.
9. Report the generated file path if generation ran, the scored file path if single-file grading ran, or the `.taro/directory-loop/` tracker path if batch regrade ran, plus the score and blockers that still require manual cleanup.

## Response contract

Return:

- the correct Taro skill or runtime entrypoint
- the next runtime action to take
- any missing input required before proceeding
- any blocker that prevents safe generation or review
