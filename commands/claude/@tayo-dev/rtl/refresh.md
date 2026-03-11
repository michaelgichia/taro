---
name: "@tayo-dev/rtl:refresh"
description: Refresh the installed @tayo-dev/rtl runtime surface with Taro.
allowed-tools:
  - Bash
---

<objective>
Run Taro's maintenance entrypoint from Claude Code to refresh owned assets and repair missing ones after `@tayo-dev/rtl` is already installed.
</objective>

<process>
1. Run `tayo __refresh`.
2. Report the command run and the important output or blocker.
3. Explain that `/@tayo-dev/rtl:init` remains the recommended first runtime-native step after a fresh install or reinstall.
4. If refresh succeeds and the user wants generation help next, direct them to `/@tayo-dev/rtl:generate` or `/@tayo-dev/rtl:help`.
</process>
