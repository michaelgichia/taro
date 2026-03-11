# Taro User Guide

Taro installs runtime-native commands or skills into Claude Code, Gemini CLI, OpenCode, and Codex. The recommended first step after install is the runtime-native `init` entrypoint, and `refresh` is the maintenance path for owned assets after that. Taro then turns Testing Library Recorder `.js` exports into repository-aware React Testing Library tests.

## Install

```bash
npx @taro-dev/rtl@latest
```

Use runtime flags plus one location flag to skip prompts:

```bash
npx @taro-dev/rtl@latest --codex --local
npx @taro-dev/rtl@latest --all --global
```

After install or reinstall, run the runtime-native `init` entrypoint:

- Claude Code: `/@taro-dev/rtl:init`
- Gemini CLI: `/@taro-dev/rtl:init`
- OpenCode: `/@taro-dev/rtl-init`
- Codex: `$@taro-dev/rtl-init`

Check the installed package version with `taro version` or `taro --version`.

For Claude Code local testing from this repo, run:

```bash
npm run build:claude
```

That command builds Taro, installs the Claude command surface into this repo's `./.claude/`, deletes the existing global Taro Claude command directory, and reinstalls the global Claude surface cleanly.

For the Codex equivalent, run:

```bash
npm run build:codex
```

That command builds Taro, installs the Codex skill surface into this repo's `./.codex/`, deletes the existing global Taro Codex skill directories plus the Taro Codex manifest, and reinstalls the global Codex surface cleanly.

## Runtime Entrypoints

- Claude Code: `/@taro-dev/rtl:help`, `/@taro-dev/rtl:init`, `/@taro-dev/rtl:refresh`, `/@taro-dev/rtl:generate`
- Gemini CLI: `/@taro-dev/rtl:help`, `/@taro-dev/rtl:init`, `/@taro-dev/rtl:refresh`, `/@taro-dev/rtl:generate`
- OpenCode: `/@taro-dev/rtl-help`, `/@taro-dev/rtl-init`, `/@taro-dev/rtl-refresh`, `/@taro-dev/rtl-generate`
- Codex: `$@taro-dev/rtl-help`, `$@taro-dev/rtl-init`, `$@taro-dev/rtl-refresh`, `$@taro-dev/rtl-generate`

## Refresh Maintenance

Use the runtime-native `refresh` entrypoint when Taro is already installed and you want to refresh owned assets or repair missing ones:

- Claude Code: `/@taro-dev/rtl:refresh`
- Gemini CLI: `/@taro-dev/rtl:refresh`
- OpenCode: `/@taro-dev/rtl-refresh`
- Codex: `$@taro-dev/rtl-refresh`

If you need a newer package version first, rerun `npx @taro-dev/rtl@latest` and then run the runtime-native `refresh` entrypoint.

## Generation Rules

1. Provide a Testing Library Recorder `.js` export.
2. Run the runtime-native `init` entrypoint first when Taro has just been installed or reinstalled.
3. Taro writes `{recording-name}.test.tsx` next to the recording.
4. Existing generated siblings are never overwritten.
5. Draft-quality output is reported explicitly through score, blockers, and boundary warnings.

## Learned Context

Taro persists package-scoped learning in `.taro/state.json`, reads optional manual policy overrides from `.taro/overrides.json`, and may write visual artifacts under `.taro/visual`. Commit `.taro/state.json` when you want learned package profiles to carry across teammates and CI.

## Repo Layout

- `agents/`: authored Codex skill content
- `commands/`: authored prompt-runtime command content
- `docs/`: user-facing package documentation
- `taro/references/`: generation and verification reference notes used by packaged skills
- `hooks/`: lightweight CLI helpers for update checks and local context summaries
