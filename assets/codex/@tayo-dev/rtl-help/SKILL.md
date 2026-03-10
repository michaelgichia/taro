---
name: "@tayo-dev/rtl-help"
description: "Route Codex users to the correct packaged Tayo skill and explain the installed Codex entrypoints. Use when the user asks how to use Tayo in Codex, which Tayo skill to invoke, whether installation worked, or whether they need generate, conventions, or mocks guidance."
---

# Tayo Codex Help

## Entrypoint

Invoke this skill with `$@tayo-dev/rtl-help`.

## Installed skill surface

- `$@tayo-dev/rtl-generate` for Recorder-to-RTL generation
- `$@tayo-dev/rtl-conventions` for convention-aware generation guidance
- `$@tayo-dev/rtl-mocks` for mock and fixture review

## Routing guide

- Use `$@tayo-dev/rtl-generate` when the user already has a Recorder `.js` or Chrome Recorder `.json` export and wants a test generated or previewed.
- Use `$@tayo-dev/rtl-conventions` when the user asks why generated output follows a certain style, file location, import pattern, or helper setup.
- Use `$@tayo-dev/rtl-mocks` when the generated test needs API, router, auth, fixture, or provider boundary guidance.

## Default workflow

1. Confirm whether the user needs generation, convention diagnosis, or mock guidance.
2. Ask for the recording path or generated test path only if that input is still missing.
3. Choose the matching packaged Tayo skill.
4. If direct CLI execution is appropriate, run `tayo generate <recording-file>` with any requested flags.
5. Report the next command, generated file path if any, score if generation ran, and blockers that still require manual cleanup.

## Response contract

Return:

- the correct Tayo skill or CLI entrypoint
- the next command to run
- any missing input required before proceeding
- any blocker that prevents safe generation or review
