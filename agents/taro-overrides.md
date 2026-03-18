---
name: "@taro-test/rtl-overrides"
description: "Scaffold a starter .taro/overrides.json from learned Taro package state. Use when the user wants Taro to auto-generate a manual policy file they can review and refine."
---

# Taro Overrides

Invoke this skill with `$@taro-test/rtl-overrides`.

## Purpose

Generate a starter `.taro/overrides.json` from the repo's current learned package profiles.

## Workflow

1. Run `{{TARO_RUNTIME_COMMAND}} __overrides`.
2. Report the command run and whether `.taro/overrides.json` was written or what blocked it.
3. Explain that the scaffold is a starter manual policy file and should be reviewed before commit.
4. If `.taro/overrides.json` already exists and they want to replace it, tell them to rerun with `{{TARO_RUNTIME_COMMAND}} __overrides --force`.
5. If they want Taro to re-read the new policy next, route them to `$@taro-test/rtl-refresh`.
6. If they want to generate a test after that, route them to `$@taro-test/rtl-generate`, `$@taro-test/rtl-target`, or `$@taro-test/rtl-help`.

## Response Contract

Return:

- the command you ran
- whether the scaffold file was written or what blocked it
- the file path
- whether `--force` is needed
- the next runtime entrypoint to use
