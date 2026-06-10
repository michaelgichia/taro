---
name: "@tr-rtl/cli:help"
description: "Show @tr-rtl/cli install, initialization, refresh, overrides, and generation help"
---

<objective>
Help the user install, initialize, refresh, scaffold overrides, review mocks, grade existing tests, and use @tr-rtl/cli from Claude Code.
</objective>

<process>
1. Explain that `/@tr-rtl/cli:help` is the installed help entrypoint for @tr-rtl/cli.
2. For installation or package updates, tell the user to run `pnpm dlx @tr-rtl/cli@latest`.
3. After install or reinstall, recommend `/@tr-rtl/cli:init` as the first runtime-native step.
4. For maintenance or owned-asset repair, use `/@tr-rtl/cli:refresh`.
5. When the user wants a starter manual policy file, use `/@tr-rtl/cli:overrides` to scaffold `.taro/overrides.json`.
6. For Recorder-first generation, use `/@tr-rtl/cli:gen` with a Testing Library Recorder `.js` export.
7. For grading an existing test file without regenerating it, use `/@tr-rtl/cli:grade` and note that it stores a new grade snapshot in `.taro/state.json`.
8. For regrading an existing test after manual edits, use `/@tr-rtl/cli:regrade` and note that it compares against the latest stored snapshot when present, then stores a new snapshot.
9. For dedicated mock and fixture review, use `/@tr-rtl/cli:mocks`.
10. For explicit component targeting, use `/@tr-rtl/cli:target` with a component file path, or with a component-directory path to run directory-loop mode; Recorder `.js` input applies to single-file targeting.
11. Tell the user Taro must write the generated test next to the inferred or supplied component when it resolves the owning render target; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.
12. Explain that single-file `gen`, `geni`, and `target` flows may run one bounded mock-review repair pass before final reporting, and that requested `--min-score` thresholds apply to the final post-review result. Directory-loop target stays review-only in v1.
13. When generation or grading runs, report the score and the relevant test file path.
</process>
