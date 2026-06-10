---
name: "@tr-rtl/cli-refresh"
description: "Refresh installed Taro runtime assets and repair missing owned files. Use when @tr-rtl/cli is already installed and the user wants maintenance, resync, or repair."
---

# Taro Refresh

Invoke this skill with `$@tr-rtl/cli-refresh`.

## Purpose

Run Taro's maintenance entrypoint after `@tr-rtl/cli` is already installed.

## Workflow

1. Run `{{TARO_RUNTIME_COMMAND}} __refresh`.
2. Report the command run and the important output or blocker.
3. Use this for maintenance, resync, and owned-asset repair.
4. If this is a fresh install or reinstall, tell the user to start with `$@tr-rtl/cli-init`.
5. If refresh succeeds and they want to generate a test next, route them to `$@tr-rtl/cli-gen` or `$@tr-rtl/cli-help`.

## Response Contract

Return:

- the command you ran
- whether refresh completed or what blocked it
- the next runtime entrypoint to use
