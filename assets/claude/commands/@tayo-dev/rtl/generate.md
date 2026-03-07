---
name: "@tayo-dev/rtl:generate"
description: "Generate RTL tests from Chrome Recorder exports with Taro"
---

<objective>
Generate a React Testing Library test from a Chrome Recorder export.
</objective>

<process>
1. Confirm the recording path before running anything destructive.
2. Run `taro generate <recording-file>` by default.
3. Add `--dry-run`, `--output <path>`, or `--force` only when the user asks for them or the context requires them.
4. Report the generated file path and score output.
</process>
