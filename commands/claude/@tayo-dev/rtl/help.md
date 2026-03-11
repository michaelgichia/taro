---
name: "@tayo-dev/rtl:help"
description: "Show @tayo-dev/rtl install and generation help"
---

<objective>
Help the user install and use @tayo-dev/rtl from Claude Code.
</objective>

<process>
1. Explain that `/@tayo-dev/rtl:help` is the installed help entrypoint for @tayo-dev/rtl.
2. For installation or updates, tell the user to run `npx @tayo-dev/rtl@latest`.
3. For test generation, use `/@tayo-dev/rtl:generate` with a Testing Library Recorder `.js` export.
4. Tell the user Taro writes `{recording-name}.test.tsx` next to the recording and will not overwrite an existing file.
5. When generation runs, report the score and generated file path.
</process>
