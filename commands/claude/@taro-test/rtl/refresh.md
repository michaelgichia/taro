---
name: "@taro-test/rtl:refresh"
description: Refresh the installed @taro-test/rtl runtime surface with Taro.
allowed-tools:
  - Bash
---

<objective>
Run Taro's maintenance entrypoint from Claude Code to refresh owned assets and repair missing ones after `@taro-test/rtl` is already installed.
</objective>

<process>
1. Run `{{TARO_RUNTIME_COMMAND}} __refresh`.
2. Report the command run and the important output or blocker.
3. Explain that `/@taro-test/rtl:init` remains the recommended first runtime-native step after a fresh install or reinstall.
4. If refresh succeeds and the user wants generation help next, direct them to `/@taro-test/rtl:generate` or `/@taro-test/rtl:help`.
</process>
