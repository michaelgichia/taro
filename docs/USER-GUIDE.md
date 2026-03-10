# Tayo User Guide

Tayo installs runtime-native commands or skills into Claude Code, Gemini CLI, OpenCode, and Codex, then turns Testing Library Recorder `.js` exports into repository-aware React Testing Library tests.

## Install

```bash
npx @tayo-dev/rtl@latest
```

Use runtime flags plus one location flag to skip prompts:

```bash
npx @tayo-dev/rtl@latest --codex --local
npx @tayo-dev/rtl@latest --all --global
```

Check the installed package version with `tayo version` or `tayo --version`.

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

- Claude Code: `/@tayo-dev/rtl:help`, `/@tayo-dev/rtl:generate`
- Gemini CLI: `/@tayo-dev/rtl:help`, `/@tayo-dev/rtl:generate`
- OpenCode: `/@tayo-dev/rtl-help`, `/@tayo-dev/rtl-generate`
- Codex: `$@tayo-dev/rtl-help`, `$@tayo-dev/rtl-generate`

## Generation Rules

1. Provide a Testing Library Recorder `.js` export.
2. Tayo writes `{recording-name}.test.tsx` next to the recording.
3. Existing generated siblings are never overwritten.
4. Draft-quality output is reported explicitly through score, blockers, and boundary warnings.

## Learned Context

Tayo persists convention learning in `.tayo/conventions.json` and optional visual artifacts under `.tayo/visual`. Commit `.tayo/` when you want convention learning to carry across teammates and CI.

## Repo Layout

- `agents/`: authored Codex skill content
- `commands/`: authored prompt-runtime command content
- `docs/`: user-facing package documentation
- `taro/references/`: generation and verification reference notes used by packaged skills
- `hooks/`: lightweight CLI helpers for update checks and local context summaries
