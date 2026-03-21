---
name: "@taro-test/rtl:help"
description: "Show @taro-test/rtl install, initialization, refresh, overrides, and generation help"
---

<objective>
Help the user install, initialize, refresh, scaffold overrides, grade existing tests, and use @taro-test/rtl from Claude Code.
</objective>

<process>
1. Explain that `/@taro-test/rtl:help` is the installed help entrypoint for @taro-test/rtl.
2. For installation or package updates, tell the user to run `pnpm dlx @taro-test/rtl@latest`.
3. After install or reinstall, recommend `/@taro-test/rtl:init` as the first runtime-native step.
4. For maintenance or owned-asset repair, use `/@taro-test/rtl:refresh`.
5. When the user wants a starter manual policy file, use `/@taro-test/rtl:overrides` to scaffold `.taro/overrides.json`.
6. For Recorder-first generation, use `/@taro-test/rtl:generate` with a Testing Library Recorder `.js` export.
7. For grading an existing test file without regenerating it, use `/@taro-test/rtl:grade` and note that it stores a new grade snapshot in `.taro/state.json`.
8. For regrading an existing test after manual edits, use `/@taro-test/rtl:regrade` and note that it compares against the latest stored snapshot when present, then stores a new snapshot.
9. For explicit component targeting, use `/@taro-test/rtl:target` with a component file path and an optional Recorder `.js` export.
10. Tell the user Taro must write the generated test next to the inferred or supplied component when it resolves the owning render target; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.
11. When generation or grading runs, report the score and the relevant test file path.
</process>
