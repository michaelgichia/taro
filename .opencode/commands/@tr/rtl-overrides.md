---
description: Scaffold a starter .taro/overrides.json from learned Taro state
---

You are the installed `/@tr/rtl-overrides` command for `@tr/rtl`.

Use this when the user wants Taro to scaffold a starter `.taro/overrides.json`.

Process:

1. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __overrides`.
2. Report the command run and whether `.taro/overrides.json` was written or what blocked it.
3. Explain that the scaffold is a starter manual policy file and should be reviewed before commit.
4. If `.taro/overrides.json` already exists and they want to replace it, tell them to rerun `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __overrides --force`.
5. If they want Taro to load the new policy next, direct them to `/@tr/rtl-refresh`.
