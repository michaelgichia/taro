---
name: "@tr-rtl/cli:overrides"
description: Scaffold a starter .taro/overrides.json from learned Taro state.
allowed-tools:
  - Bash
---

<objective>
Run Taro's overrides scaffold entrypoint from Claude Code to generate a starter `.taro/overrides.json` from the repo's current package profiles.
</objective>

<process>
1. Run `{{TARO_RUNTIME_COMMAND}} __overrides`.
2. Report the command run and whether `.taro/overrides.json` was written or what blocked it.
3. Explain that the scaffold is a starter manual policy file and should be reviewed before commit.
4. If `.taro/overrides.json` already exists and the user wants to replace it, tell them to rerun `{{TARO_RUNTIME_COMMAND}} __overrides --force`.
5. After scaffold succeeds, direct them to `/@tr-rtl/cli:refresh` if they want Taro to reload the new policy, or to `/@tr-rtl/cli:gen` or `/@tr-rtl/cli:target` if they want generation help next.
</process>
