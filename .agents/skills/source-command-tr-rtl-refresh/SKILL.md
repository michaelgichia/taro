---
name: "source-command-tr-rtl-refresh"
description: "Refresh the installed @tr/rtl runtime surface with Taro."
---

# source-command-tr-rtl-refresh

Use this skill when the user asks to run the migrated source command `@tr-rtl-refresh`.

## Command Template

<objective>
Run Taro's maintenance entrypoint from Codex to refresh owned assets and repair missing ones after `@tr/rtl` is already installed.
</objective>

<process>
1. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __refresh`.
2. Report the command run and the important output or blocker.
3. Explain that `/@tr/rtl:init` remains the recommended first runtime-native step after a fresh install or reinstall.
4. If refresh succeeds and the user wants generation help next, direct them to `/@tr/rtl:gen` or `/@tr/rtl:help`.
</process>
