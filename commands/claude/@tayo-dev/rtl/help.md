---
name: "@tayo-dev/rtl:help"
description: "Show @tayo-dev/rtl install, initialization, refresh, and generation help"
---

<objective>
Help the user install, initialize, refresh, and use @tayo-dev/rtl from Claude Code.
</objective>

<process>
1. Explain that `/@tayo-dev/rtl:help` is the installed help entrypoint for @tayo-dev/rtl.
2. For installation or package updates, tell the user to run `npx @tayo-dev/rtl@latest`.
3. After install or reinstall, recommend `/@tayo-dev/rtl:init` as the first runtime-native step.
4. For maintenance or owned-asset repair, use `/@tayo-dev/rtl:refresh`.
5. For test generation, use `/@tayo-dev/rtl:generate` with a Testing Library Recorder `.js` export.
6. Tell the user Taro writes `{recording-name}.test.tsx` next to the recording and will not overwrite an existing file.
7. When generation runs, report the score and generated file path.
</process>
