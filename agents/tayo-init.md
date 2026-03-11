---
name: "@tayo-dev/rtl-init"
description: "Initialize the installed Taro runtime surface. Use when the user has just installed or reinstalled @tayo-dev/rtl and needs the recommended first runtime-native step before generation."
---

# Taro Init

Invoke this skill with `$@tayo-dev/rtl-init`.

## Purpose

Run Taro's initialization entrypoint. This is the recommended first runtime-native step after installing or reinstalling `@tayo-dev/rtl`.

## Workflow

1. Run `tayo __init`.
2. Report the command run and the important output or blocker.
3. If the user wants maintenance or owned-asset repair later, route them to `$@tayo-dev/rtl-refresh`.
4. If initialization succeeds and the user has a Testing Library Recorder `.js` export, route them to `$@tayo-dev/rtl-generate`.
5. If they only need routing help, use `$@tayo-dev/rtl-help`.

## Response Contract

Return:

- the command you ran
- whether initialization completed or what blocked it
- the next runtime entrypoint to use
