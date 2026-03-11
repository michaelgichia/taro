---
name: "@tayo-dev/rtl:init"
description: Initialize the installed @tayo-dev/rtl runtime surface with Taro.
allowed-tools:
  - Bash
---

<objective>
Run Taro's initialization entrypoint from Claude Code. This is the recommended first runtime-native step after installing or reinstalling `@tayo-dev/rtl`.
</objective>

<process>
1. Run `tayo __init`.
2. Report the command run and the important output or blocker.
3. If the user wants maintenance or owned-asset repair later, direct them to `/@tayo-dev/rtl:refresh`.
4. If initialization succeeds and they have a Testing Library Recorder `.js` export, direct them to `/@tayo-dev/rtl:generate`.
</process>
