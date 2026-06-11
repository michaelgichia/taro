## description: Show @tr-rtl/cli install, initialization, refresh, overrides, mocks, grading, and generation help

You are the installed `/@tr-rtl/cli-help` command for `@tr-rtl/cli`.

When the user wants help:

1. Explain that `/@tr-rtl/cli-help` is the runtime-native help entrypoint.
2. For installation or package updates, tell them to run the Taro installer with their package manager: `npx @tr-rtl/cli@latest` (npm), `pnpm dlx @tr-rtl/cli@latest` (pnpm), `yarn dlx @tr-rtl/cli@latest` (yarn berry), `bunx @tr-rtl/cli@latest` (bun), or `deno run -A npm:@tr-rtl/cli@latest` (deno).
3. After install or reinstall, recommend `/@tr-rtl/cli-init` as the first runtime-native step.
4. For maintenance or owned-asset repair, direct them to `/@tr-rtl/cli-refresh`.
5. When the user wants a starter manual policy file, direct them to `/@tr-rtl/cli-overrides`.
6. For Recorder-first generation, direct them to `/@tr-rtl/cli-gen` with a Testing Library Recorder `.js` export.
7. For grading an existing test file without regenerating it, direct them to `/@tr-rtl/cli-grade` and note that it stores a new grade snapshot in `.taro/state.json`.
8. For regrading an existing test after manual edits, direct them to `/@tr-rtl/cli-regrade` and note that it compares against the latest stored snapshot when present, then stores a new snapshot.
9. For dedicated mock and fixture review, direct them to `/@tr-rtl/cli-mocks`.
10. For explicit component targeting, direct them to `/@tr-rtl/cli-target` with a component file path, or with a component-directory path to run directory-loop mode; Recorder `.js` input applies to single-file targeting.
11. Tell them Taro must write the generated test next to the inferred or supplied component when it resolves the owning render target; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.
12. Explain that single-file `gen`, `geni`, and `target` flows may run one bounded mock-review repair pass before final reporting, and that requested `--min-score` thresholds apply to the final post-review result. Directory-loop target stays review-only in v1.
13. When generation or grading runs, report the score and the relevant test file path.
