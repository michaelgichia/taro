---
name: "@tr/rtl-init"
description: "Initialize the installed Taro runtime surface. Use when the user has just installed or reinstalled @tr/rtl and needs the recommended first runtime-native step before generation."
---

# Taro Init

Invoke this skill with `$@tr/rtl-init`.

## Purpose

Run Taro's initialization entrypoint. This is the recommended first runtime-native step after installing or reinstalling `@tr/rtl`.

## Workflow

1. Run `{{TARO_RUNTIME_COMMAND}} __init`.
2. If the installed runtime launcher path is stale or missing before Taro starts:
   - Do not claim the Codex skill install is missing just because the launcher path is stale.
   - For local development from a Taro checkout, tell the user to rerun `npm run build:codex` from that checkout.
   - For package installs, tell the user to rerun `npx @tr/rtl@latest --codex --global` or the equivalent local install flow.
3. Report the command run and the important output or blocker.
4. If the user wants maintenance or owned-asset repair later, route them to `$@tr/rtl-refresh`.
5. If initialization succeeds and the user has a Testing Library Recorder `.js` export, route them to `$@tr/rtl-gen`.
6. If they only need routing help, use `$@tr/rtl-help`.

## Response Contract

Return:

- the command you ran
- whether initialization completed or what blocked it
- whether the blocker was a stale runtime launcher versus a missing Codex skill install
- the next runtime entrypoint to use
