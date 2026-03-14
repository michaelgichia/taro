---
name: "@taro-test/rtl-help"
description: "Route Codex users to the correct packaged Taro skill and explain the installed Codex entrypoints. Use when the user asks how to use Taro in Codex, which Taro skill to invoke, whether installation worked, or whether they need init, refresh, generate, conventions, or mocks guidance."
---

# Taro Codex Help

## Entrypoint

Invoke this skill with `$@taro-test/rtl-help`.

## Installed skill surface

- `$@taro-test/rtl-init` for the recommended first step after install or reinstall
- `$@taro-test/rtl-refresh` for maintenance, resync, and owned-asset repair
- `$@taro-test/rtl-generate` for Recorder-to-RTL generation
- `$@taro-test/rtl-generate-i` for Recorder-to-RTL generation that forces interactive auth recovery
- `$@taro-test/rtl-conventions` for convention-aware generation guidance
- `$@taro-test/rtl-mocks` for mock and fixture review

## Routing guide

- Use `$@taro-test/rtl-init` when the user has just installed or reinstalled Taro and needs the first runtime-native step.
- Use `$@taro-test/rtl-refresh` when installed assets need maintenance, repair, or resync.
- Use `$@taro-test/rtl-generate` when the user already has a Testing Library Recorder `.js` export and wants a test generated.
- Use `$@taro-test/rtl-generate-i` when the user wants the same generation flow but needs interactive auth recovery forced for that run.
- Use `$@taro-test/rtl-conventions` when the user asks why generated output follows a certain style, file location, import pattern, or helper setup.
- Use `$@taro-test/rtl-mocks` when the generated test needs API, router, auth, fixture, or provider boundary guidance.

## Default workflow

1. Confirm whether the user needs initialization, refresh, generation, convention diagnosis, or mock guidance.
2. Ask for the recording path or generated test path only if that input is still missing.
3. Choose the matching packaged Taro skill.
4. For first-time setup after install or reinstall, use `$@taro-test/rtl-init`.
5. For maintenance, resync, or repair, use `$@taro-test/rtl-refresh`.
6. For standard generation, use `$@taro-test/rtl-generate`. For forced interactive auth recovery, use `$@taro-test/rtl-generate-i`.
7. Report the generated file path if generation ran, the score, and blockers that still require manual cleanup.

## Response contract

Return:

- the correct Taro skill or runtime entrypoint
- the next runtime action to take
- any missing input required before proceeding
- any blocker that prevents safe generation or review
