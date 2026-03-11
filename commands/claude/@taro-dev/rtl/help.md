---
name: "@taro-dev/rtl:help"
description: "Show @taro-dev/rtl install, initialization, refresh, and generation help"
---

<objective>
Help the user install, initialize, refresh, and use @taro-dev/rtl from Claude Code.
</objective>

<process>
1. Explain that `/@taro-dev/rtl:help` is the installed help entrypoint for @taro-dev/rtl.
2. For installation or package updates, tell the user to run `npx @taro-dev/rtl@latest`.
3. After install or reinstall, recommend `/@taro-dev/rtl:init` as the first runtime-native step.
4. For maintenance or owned-asset repair, use `/@taro-dev/rtl:refresh`.
5. For test generation, use `/@taro-dev/rtl:generate` with a Testing Library Recorder `.js` export.
6. Tell the user Taro must write the generated test next to the inferred component when it resolves the owning render target; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.
7. When generation runs, report the score and generated file path.
</process>
