---
name: "source-command-tr-rtl-overrides"
description: "Scaffold a starter .taro/overrides.json from learned Taro state."
---

# source-command-tr-rtl-overrides

Use this skill when the user asks to run the migrated source command `@tr-rtl-overrides`.

## Command Template

<objective>
Run Taro's overrides scaffold entrypoint from Codex to generate a starter `.taro/overrides.json` from the repo's current package profiles.
</objective>

<process>
1. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __overrides`.
2. Report the command run and whether `.taro/overrides.json` was written or what blocked it.
3. Explain that the scaffold is a starter manual policy file and should be reviewed before commit.
4. If `.taro/overrides.json` already exists and the user wants to replace it, tell them to rerun `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __overrides --force`.
5. After scaffold succeeds, direct them to `/@tr-rtl/cli:refresh` if they want Taro to reload the new policy, or to `/@tr-rtl/cli:gen` or `/@tr-rtl/cli:target` if they want generation help next.
</process>
