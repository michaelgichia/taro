---
name: "@taro-dev/rtl-init"
description: "Initialize the installed Taro runtime surface. Use when the user has just installed or reinstalled @taro-dev/rtl and needs the recommended first runtime-native step before generation."
---

# Taro Init

Invoke this skill with `$@taro-dev/rtl-init`.

## Purpose

Run Taro's initialization entrypoint. This is the recommended first runtime-native step after installing or reinstalling `@taro-dev/rtl`.

## Workflow

1. Run `taro __init`.
2. Report the command run and the important output or blocker.
3. If the user wants maintenance or owned-asset repair later, route them to `$@taro-dev/rtl-refresh`.
4. If initialization succeeds and the user has a Testing Library Recorder `.js` export, route them to `$@taro-dev/rtl-generate`.
5. If they only need routing help, use `$@taro-dev/rtl-help`.

## Response Contract

Return:

- the command you ran
- whether initialization completed or what blocked it
- the next runtime entrypoint to use
