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
3. For test generation, use `/@tayo-dev/rtl:generate` or run `tayo generate <recording-file>`.
4. Mention `--dry-run`, `--output <path>`, and `--force` only when they fit the request.
5. When generation runs, report the score and generated file path.
</process>
