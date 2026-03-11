---
name: "@taro-dev/rtl:refresh"
description: Refresh the installed @taro-dev/rtl runtime surface with Taro.
allowed-tools:
  - Bash
---

<objective>
Run Taro's maintenance entrypoint from Claude Code to refresh owned assets and repair missing ones after `@taro-dev/rtl` is already installed.
</objective>

<process>
1. Run `taro __refresh`.
2. Report the command run and the important output or blocker.
3. Explain that `/@taro-dev/rtl:init` remains the recommended first runtime-native step after a fresh install or reinstall.
4. If refresh succeeds and the user wants generation help next, direct them to `/@taro-dev/rtl:generate` or `/@taro-dev/rtl:help`.
</process>
