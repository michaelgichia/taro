---
name: "@tayo-dev/rtl-help"
description: "Show the packaged Tayo Codex skill surface and the expected help entrypoint."
---

# Tayo Codex Help

Use this skill when you need the Codex-facing entrypoint for Tayo or you need to route the user to the right packaged skill.

## Entrypoint

Invoke this skill with `$@tayo-dev/rtl-help`.

## Installed skill surface

- `$@tayo-dev/rtl-generate` for Recorder-to-RTL generation
- `$@tayo-dev/rtl-conventions` for convention-aware generation guidance
- `$@tayo-dev/rtl-mocks` for mock and fixture review

## Default workflow

1. Confirm the recording path or test target.
2. Choose the matching packaged Tayo skill.
3. If direct CLI execution is appropriate, run `taro generate <recording-file>` with any requested flags.
4. Report the generated file path, score, and any blocking issues.
