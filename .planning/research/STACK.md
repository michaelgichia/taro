# Milestone Research: Stack

**Date:** 2026-03-31
**Milestone:** v1.0 Regrade a test directory

## Existing Stack Surfaces

- Taro is a TypeScript ESM CLI on Node 18+ with command code under `src/cli/commands/`.
- Existing batch-progress behavior already writes Markdown trackers under `.taro/directory-loop/`.
- Persistent grading history lives in `.taro/state.json` as `generatedTests`.
- Runtime-facing usage is distributed across README plus installed skill/command assets for Codex, Claude Code, Gemini CLI, and OpenCode.

## Milestone Implication

The new feature should extend existing CLI/state/doc surfaces rather than introduce a separate persistence or orchestration layer.
