---
name: "@tr/rtl:init"
description: Initialize the installed @tr/rtl runtime surface with Taro.
allowed-tools:
  - Bash
---

<objective>
Run Taro's initialization entrypoint from Claude Code. This is the recommended first runtime-native step after installing or reinstalling `@tr/rtl`.
</objective>

<process>
1. Run `{{TARO_RUNTIME_COMMAND}} __init`.
2. Report the command run and the important output or blocker.
3. If the user wants maintenance or owned-asset repair later, direct them to `/@tr/rtl:refresh`.
4. If initialization succeeds and they have a Testing Library Recorder `.js` export, direct them to `/@tr/rtl:gen`.
</process>
