# Taro User Guide

Taro installs runtime-native commands or skills into Claude Code, Gemini CLI, OpenCode, and Codex. The recommended first step after install is the runtime-native `init` entrypoint, and `refresh` is the maintenance path for owned assets after that. Taro then turns Testing Library Recorder `.js` exports into repository-aware React Testing Library tests and can grade or regrade existing tests through installed AI-facing workflows.

For the current strict-order runtime pipeline, see [PIPELINE.md](./PIPELINE.md).

## Install

```bash
pnpm dlx @taro-test/rtl@latest
```

Use runtime flags plus one location flag to skip prompts:

```bash
pnpm dlx @taro-test/rtl@latest --codex --local
pnpm dlx @taro-test/rtl@latest --all --global
```

After install or reinstall, run the runtime-native `init` entrypoint:

- Claude Code: `/@taro-test/rtl:init`
- Gemini CLI: `/@taro-test/rtl:init`
- OpenCode: `/@taro-test/rtl-init`
- Codex: `$@taro-test/rtl-init`

The installed runtime entrypoints invoke Taro through an installed launcher path; they do not require a shell-wide `taro` binary on `PATH`. If you need the package version without a `PATH` install, run `pnpm dlx @taro-test/rtl@latest --version`.

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

- Claude Code: `/@taro-test/rtl:help`, `/@taro-test/rtl:init`, `/@taro-test/rtl:refresh`, `/@taro-test/rtl:generate`, `/@taro-test/rtl:generate-i`, `/@taro-test/rtl:grade`, `/@taro-test/rtl:regrade`, `/@taro-test/rtl:target`
- Gemini CLI: `/@taro-test/rtl:help`, `/@taro-test/rtl:init`, `/@taro-test/rtl:refresh`, `/@taro-test/rtl:generate`, `/@taro-test/rtl:generate-i`, `/@taro-test/rtl:grade`, `/@taro-test/rtl:regrade`, `/@taro-test/rtl:target`
- OpenCode: `/@taro-test/rtl-help`, `/@taro-test/rtl-init`, `/@taro-test/rtl-refresh`, `/@taro-test/rtl-generate`, `/@taro-test/rtl-generate-i`, `/@taro-test/rtl-grade`, `/@taro-test/rtl-regrade`, `/@taro-test/rtl-target`
- Codex: `$@taro-test/rtl-help`, `$@taro-test/rtl-init`, `$@taro-test/rtl-refresh`, `$@taro-test/rtl-generate`, `$@taro-test/rtl-generate-i`, `$@taro-test/rtl-grade`, `$@taro-test/rtl-regrade`, `$@taro-test/rtl-target`

## Refresh Maintenance

Use the runtime-native `refresh` entrypoint when Taro is already installed and you want to refresh owned assets or repair missing ones:

- Claude Code: `/@taro-test/rtl:refresh`
- Gemini CLI: `/@taro-test/rtl:refresh`
- OpenCode: `/@taro-test/rtl-refresh`
- Codex: `$@taro-test/rtl-refresh`

If you need a newer package version first, rerun `pnpm dlx @taro-test/rtl@latest` and then run the runtime-native `refresh` entrypoint.

## Generation Rules

1. Provide a Testing Library Recorder `.js` export for `generate`, or provide a component file path or component-directory path for `target`.
2. Run the runtime-native `init` entrypoint first when Taro has just been installed or reinstalled.
3. When Taro infers the owning render target, it must write the generated test next to the inferred component.
4. When `target` is used with a file, Taro must write the generated test next to the supplied component.
5. When `target` is used with a directory, Taro must run directory-loop mode, write a tracker under `.taro/directory-loop/`, and skip non-component `.ts` or `.tsx` files.
6. If no render target can be inferred, the fallback boundary draft is written next to the recording. Existing generated outputs are never overwritten.
7. Draft-quality output is reported explicitly through score, blockers, and boundary warnings.

## Grading Rules

1. `grade` evaluates an existing test file without rerunning generation.
2. `grade` should append a new `generatedTests` snapshot into `.taro/state.json`.
3. `regrade` reevaluates an existing test file against the latest file contents.
4. `regrade` should compare against the latest matching `generatedTests[].testFile` snapshot when one exists, then append a new snapshot into `.taro/state.json`.
5. `grade` and `regrade` should keep only the latest 5 stored snapshots per `generatedTests[].testFile`.

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
