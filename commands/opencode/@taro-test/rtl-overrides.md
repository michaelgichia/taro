---
description: Scaffold a starter .taro/overrides.json from learned Taro state
---

You are the installed `/@taro-test/rtl-overrides` command for `@taro-test/rtl`.

Use this when the user wants Taro to scaffold a starter `.taro/overrides.json`.

Process:

1. Run `{{TARO_RUNTIME_COMMAND}} __overrides`.
2. Report the command run and whether `.taro/overrides.json` was written or what blocked it.
3. Explain that the scaffold is a starter manual policy file and should be reviewed before commit.
4. If `.taro/overrides.json` already exists and they want to replace it, tell them to rerun `{{TARO_RUNTIME_COMMAND}} __overrides --force`.
5. If they want Taro to load the new policy next, direct them to `/@taro-test/rtl-refresh`.
