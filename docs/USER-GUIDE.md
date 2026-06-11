# Taro User Guide

Taro installs runtime-native commands or skills into Claude Code, Gemini CLI, OpenCode, and Codex. The recommended first step after install is the runtime-native `init` entrypoint, and `refresh` is the maintenance path for owned assets after that. Taro then turns Testing Library Recorder `.js` exports into repository-aware React Testing Library tests, can run bounded mock review on generated output, and can grade or regrade existing tests through installed AI-facing workflows.

For the current strict-order runtime pipeline, see [PIPELINE.md](./PIPELINE.md).

## Install

Pick the install command that matches your project's package manager:

| Package manager | Install command                      |
| --------------- | ------------------------------------ |
| npm             | `npx @tr-rtl/cli@latest`             |
| pnpm            | `pnpm dlx @tr-rtl/cli@latest`        |
| yarn (berry)    | `yarn dlx @tr-rtl/cli@latest`        |
| bun             | `bunx @tr-rtl/cli@latest`            |
| deno            | `deno run -A npm:@tr-rtl/cli@latest` |

Yarn classic (v1) has no `dlx`; use `npx @tr-rtl/cli@latest` from a yarn classic project. The remaining snippets in this guide use `npx` as the canonical form — substitute any row from the table and all flags behave identically.

Use runtime flags plus one location flag to skip prompts:

```bash
npx @tr-rtl/cli@latest --codex --local
npx @tr-rtl/cli@latest --all --global
```

After install or reinstall, run the runtime-native `init` entrypoint:

- Claude Code: `/@tr-rtl/cli:init`
- Gemini CLI: `/@tr-rtl/cli:init`
- OpenCode: `/@tr-rtl/cli-init`
- Codex: `$@tr-rtl/cli-init`

The installed runtime entrypoints invoke Taro through an installed launcher path; they do not require a shell-wide `taro` binary on `PATH`. If you need the package version without a `PATH` install, run any matrix row with `--version`, e.g. `npx @tr-rtl/cli@latest --version`.

For Claude Code local testing from this repo, run:

```bash
pnpm run build:claude
```

That command builds Taro, installs the Claude command surface into this repo's `./.claude/`, deletes the existing global Taro Claude command directory, and reinstalls the global Claude surface cleanly.

For the Codex equivalent, run:

```bash
pnpm run build:codex
```

That command builds Taro, installs the Codex skill surface into this repo's `./.codex/`, deletes the existing global Taro Codex skill directories plus the Taro Codex manifest, and reinstalls the global Codex surface cleanly. It does not place a global `taro` binary on your shell `PATH`; the installed Codex skills call this checkout's `dist/index.js` directly. If you move or replace the checkout, rerun `pnpm run build:codex` so the launcher paths stay current.

## Runtime Entrypoints

- Claude Code: `/@tr-rtl/cli:help`, `/@tr-rtl/cli:init`, `/@tr-rtl/cli:refresh`, `/@tr-rtl/cli:gen`, `/@tr-rtl/cli:geni`, `/@tr-rtl/cli:target`, `/@tr-rtl/cli:mocks`, `/@tr-rtl/cli:grade`, `/@tr-rtl/cli:regrade`
- Gemini CLI: `/@tr-rtl/cli:help`, `/@tr-rtl/cli:init`, `/@tr-rtl/cli:refresh`, `/@tr-rtl/cli:gen`, `/@tr-rtl/cli:geni`, `/@tr-rtl/cli:target`, `/@tr-rtl/cli:mocks`, `/@tr-rtl/cli:grade`, `/@tr-rtl/cli:regrade`
- OpenCode: `/@tr-rtl/cli-help`, `/@tr-rtl/cli-init`, `/@tr-rtl/cli-refresh`, `/@tr-rtl/cli-gen`, `/@tr-rtl/cli-geni`, `/@tr-rtl/cli-target`, `/@tr-rtl/cli-mocks`, `/@tr-rtl/cli-grade`, `/@tr-rtl/cli-regrade`
- Codex: `$@tr-rtl/cli-help`, `$@tr-rtl/cli-init`, `$@tr-rtl/cli-refresh`, `$@tr-rtl/cli-gen`, `$@tr-rtl/cli-geni`, `$@tr-rtl/cli-target`, `$@tr-rtl/cli-mocks`, `$@tr-rtl/cli-grade`, `$@tr-rtl/cli-regrade`

## Refresh Maintenance

Use the runtime-native `refresh` entrypoint when Taro is already installed and you want to refresh owned assets or repair missing ones:

- Claude Code: `/@tr-rtl/cli:refresh`
- Gemini CLI: `/@tr-rtl/cli:refresh`
- OpenCode: `/@tr-rtl/cli-refresh`
- Codex: `$@tr-rtl/cli-refresh`

If you need a newer package version first, rerun the installer with your package manager (e.g. `npx @tr-rtl/cli@latest`, `pnpm dlx @tr-rtl/cli@latest`, `yarn dlx @tr-rtl/cli@latest`, `bunx @tr-rtl/cli@latest`, or `deno run -A npm:@tr-rtl/cli@latest`) and then run the runtime-native `refresh` entrypoint.

## Generation Rules

1. Provide a Testing Library Recorder `.js` export for `gen`, or provide a component file path or component-directory path for `target`.
2. Run the runtime-native `init` entrypoint first when Taro has just been installed or reinstalled.
3. When Taro infers the owning render target, it must write the generated test next to the inferred component.
4. When `target` is used with a file, Taro must write the generated test next to the supplied component.
5. When `target` is used with a directory, Taro must run directory-loop mode, write a tracker under `.taro/directory-loop/`, and skip non-component `.ts` or `.tsx` files.
6. Single-file `gen`, `geni`, and `target` runs may trigger one automatic mock-review repair pass when Taro emits mock-review findings such as `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`.
7. That repair pass is limited to mock-scoped edits, regrades with `__regrade`, and keeps changes only when syntax, score, flow coverage, and blocking findings do not regress.
8. `gen`, `geni`, and `target` accept `--min-score <0-100>` to require a minimum Taro score for the selected output. For single-file generation, the installed runtime entrypoint treats that as the final post-review gate instead of the first-pass gate.
9. `target --directory-loop` stays review-only in v1 and keeps the existing direct `--min-score` behavior.
10. If no render target can be inferred, the fallback boundary draft is written next to the recording. Existing generated outputs are never overwritten.
11. Draft-quality output is reported explicitly through score, blockers, and boundary warnings.

## Grading Rules

1. `grade` evaluates an existing test file without rerunning generation.
2. `grade` should append a new `generatedTests` snapshot into `.taro/state.json`.
3. `regrade` reevaluates an existing test file against the latest file contents.
4. `regrade` should compare against the latest matching `generatedTests[].testFile` snapshot when one exists, then append a new snapshot into `.taro/state.json`.
5. `regrade` also supports `regrade <test-directory> --directory-loop` for batch reruns across one directory tree of existing `*.test.*` and `*.spec.*` files.
6. Directory-loop regrade should write a tracker under `.taro/directory-loop/` and keep each row moving from `pending` to `in-progress` to `completed`.
7. Completed directory-loop rows should record the current score threshold, updated score threshold, and follow-up comments for that test file.
8. `grade` and `regrade` should keep only the latest 5 stored snapshots per `generatedTests[].testFile`.

Stored `generatedTests` grades bias later package relearning. During `init`, `refresh`, and stale-state bootstrap, Taro now gives higher-scored stored tests more influence when learning conventions, helpers, exemplars, and boundary strategies. Files without stored grades still participate with neutral weight.

The exact module execution order for generation is documented in [PIPELINE.md](./PIPELINE.md).

## Learned Context

Taro persists package-scoped learning in `.taro/state.json`, reads optional manual policy overrides from `.taro/overrides.json`, and may write visual artifacts under `.taro/visual`. Commit `.taro/state.json` when you want learned package profiles to carry across teammates and CI.

## Repo Layout

- `agents/`: authored Codex skill content
- `commands/`: authored prompt-runtime command content
- `docs/`: user-facing package documentation
- `taro/references/`: generation and verification reference notes used by packaged skills
- `hooks/`: lightweight CLI helpers for update checks and local context summaries
