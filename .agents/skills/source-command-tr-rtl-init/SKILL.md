---
name: "source-command-tr-rtl-init"
description: "Initialize the installed @tr-rtl/cli runtime surface with Taro."
---

# source-command-tr-rtl-init

Use this skill when the user asks to run the migrated source command `@tr-rtl-init`.

## Command Template

<objective>
Run Taro's initialization entrypoint from Codex. This is the recommended first runtime-native step after installing or reinstalling `@tr-rtl/cli`.
</objective>

<process>
1. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __init`.
2. Report the command run and the important output or blocker.
3. If the user wants maintenance or owned-asset repair later, direct them to `/@tr-rtl/cli:refresh`.
4. If initialization succeeds and they have a Testing Library Recorder `.js` export, direct them to `/@tr-rtl/cli:gen`.
</process>
