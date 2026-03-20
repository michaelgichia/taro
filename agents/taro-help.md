---
name: "@taro-test/rtl-help"
description: "Route Codex users to the correct packaged Taro skill and explain the installed Codex entrypoints. Use when the user asks how to use Taro in Codex, which Taro skill to invoke, whether installation worked, or whether they need init, refresh, overrides, generation, conventions, or mocks guidance."
---

# Taro Codex Help

## Entrypoint

Invoke this skill with `$@taro-test/rtl-help`.

## Installed skill surface

- `$@taro-test/rtl-init` for the recommended first step after install or reinstall
- `$@taro-test/rtl-refresh` for maintenance, resync, and owned-asset repair
- `$@taro-test/rtl-overrides` for scaffolding a starter `.taro/overrides.json` from learned state
- `$@taro-test/rtl-generate` for Recorder-to-RTL generation
- `$@taro-test/rtl-generate-i` for Recorder-to-RTL generation that forces interactive auth recovery
- `$@taro-test/rtl-grade` for grading an existing test file without regenerating it
- `$@taro-test/rtl-regrade` for refreshing the stored grade of an already-generated test after manual edits
- `$@taro-test/rtl-target` for component-targeted RTL generation with an optional Recorder file
- `$@taro-test/rtl-conventions` for convention-aware generation guidance
- `$@taro-test/rtl-mocks` for mock and fixture review

## Routing guide

- Use `$@taro-test/rtl-init` when the user has just installed or reinstalled Taro and needs the first runtime-native step.
- Use `$@taro-test/rtl-refresh` when installed assets need maintenance, repair, or resync.
- Use `$@taro-test/rtl-overrides` when the user wants Taro to scaffold a starter `.taro/overrides.json` from learned package state.
- Use `$@taro-test/rtl-generate` when the user already has a Testing Library Recorder `.js` export and wants a test generated.
- Use `$@taro-test/rtl-generate-i` when the user wants the same generation flow but needs interactive auth recovery forced for that run.
- Use `$@taro-test/rtl-grade` when the user wants a score for an existing `*.test.*` file without rerunning generation.
- Use `$@taro-test/rtl-regrade` when the user wants to compare a changed test against its stored generated-test grade and refresh the matching state entry when safe.
- Use `$@taro-test/rtl-target` when the user wants to point Taro at a specific component file and optionally also provide a Recorder file.
- Use `$@taro-test/rtl-conventions` when the user asks why generated output follows a certain style, file location, import pattern, or helper setup.
- Use `$@taro-test/rtl-mocks` when the generated test needs API, router, auth, fixture, or provider boundary guidance.

## Default workflow

1. Confirm whether the user needs initialization, refresh, overrides scaffolding, generation, grading, convention diagnosis, or mock guidance.
2. Ask for the recording path, component path, or generated test path only if that input is still missing.
3. Choose the matching packaged Taro skill.
4. For first-time setup after install or reinstall, use `$@taro-test/rtl-init`.
5. For maintenance, resync, or repair, use `$@taro-test/rtl-refresh`.
6. For manual policy scaffolding, use `$@taro-test/rtl-overrides`.
7. For Recorder-first generation, use `$@taro-test/rtl-generate`. For forced interactive auth recovery, use `$@taro-test/rtl-generate-i`. For existing-test grading, use `$@taro-test/rtl-grade` or `$@taro-test/rtl-regrade`. For explicit component targeting, use `$@taro-test/rtl-target`.
8. Report the generated file path if generation ran, or the scored file path if grading ran, plus the score and blockers that still require manual cleanup.

## Response contract

Return:

- the correct Taro skill or runtime entrypoint
- the next runtime action to take
- any missing input required before proceeding
- any blocker that prevents safe generation or review
