---
name: "@taro-dev/rtl-help"
description: "Route Codex users to the correct packaged Taro skill and explain the installed Codex entrypoints. Use when the user asks how to use Taro in Codex, which Taro skill to invoke, whether installation worked, or whether they need init, refresh, generate, conventions, or mocks guidance."
---

# Taro Codex Help

## Entrypoint

Invoke this skill with `$@taro-dev/rtl-help`.

## Installed skill surface

- `$@taro-dev/rtl-init` for the recommended first step after install or reinstall
- `$@taro-dev/rtl-refresh` for maintenance, resync, and owned-asset repair
- `$@taro-dev/rtl-generate` for Recorder-to-RTL generation
- `$@taro-dev/rtl-conventions` for convention-aware generation guidance
- `$@taro-dev/rtl-mocks` for mock and fixture review

## Routing guide

- Use `$@taro-dev/rtl-init` when the user has just installed or reinstalled Taro and needs the first runtime-native step.
- Use `$@taro-dev/rtl-refresh` when installed assets need maintenance, repair, or resync.
- Use `$@taro-dev/rtl-generate` when the user already has a Testing Library Recorder `.js` export and wants a test generated.
- Use `$@taro-dev/rtl-conventions` when the user asks why generated output follows a certain style, file location, import pattern, or helper setup.
- Use `$@taro-dev/rtl-mocks` when the generated test needs API, router, auth, fixture, or provider boundary guidance.

## Default workflow

1. Confirm whether the user needs initialization, refresh, generation, convention diagnosis, or mock guidance.
2. Ask for the recording path or generated test path only if that input is still missing.
3. Choose the matching packaged Taro skill.
4. For first-time setup after install or reinstall, use `$@taro-dev/rtl-init`.
5. For maintenance, resync, or repair, use `$@taro-dev/rtl-refresh`.
6. For generation, use `$@taro-dev/rtl-generate`. Taro writes `{recording-name}.test.tsx` next to the `.js` recording and refuses to overwrite an existing file.
7. Report the generated file path if generation ran, the score, and blockers that still require manual cleanup.

## Response contract

Return:

- the correct Taro skill or runtime entrypoint
- the next runtime action to take
- any missing input required before proceeding
- any blocker that prevents safe generation or review
