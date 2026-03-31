# Integrations

## External Surfaces

Taro is mostly a local CLI/tooling package. Its integrations are package/distribution surfaces, browser automation, local project state, and runtime-specific installation targets rather than long-lived backend services.

## Runtime Environments

- Codex runtime assets are defined in [`src/install/runtimes/codex.ts`](/Users/michaelgichia/workspace/taro/src/install/runtimes/codex.ts).
- Other supported runtimes are implemented under `src/install/runtimes/`, including Claude, Gemini CLI, OpenCode, and prompt-runtime helpers.
- The installer copies generated skills/commands into runtime-specific hidden directories such as `.codex/` and `.claude/`.
- The public package entrypoint described in [`README.md`](/Users/michaelgichia/workspace/taro/README.md) is installer-first: install first, then use runtime-native commands.

## Browser and Recorder Inputs

- Playwright is used for visual state capture and auth-aware browsing in generation workflows, with logic in files like [`src/cli/commands/visual-auth.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/visual-auth.ts).
- Recorder inputs are normalized from exported artifacts in [`src/core/parser.ts`](/Users/michaelgichia/workspace/taro/src/core/parser.ts) and JS-specific parsing helpers under `src/core/js-parser.ts`.
- The generator expects Chrome DevTools Recorder / Testing Library Recorder-style flows, as documented in [`README.md`](/Users/michaelgichia/workspace/taro/README.md).

## Local Project State

- Per-project state lives under `.taro/`, managed through [`src/project-state.ts`](/Users/michaelgichia/workspace/taro/src/project-state.ts).
- Learned conventions are persisted via SQLite-backed storage in [`src/learner/storage.ts`](/Users/michaelgichia/workspace/taro/src/learner/storage.ts).
- Target-directory batch generation writes tracker files beneath `.taro/directory-loop/` through [`src/cli/commands/target-directory-tracker.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target-directory-tracker.ts).
- Package learning and profile resolution in [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts) also read `.taro/state.json` and `.taro/overrides.json`.

## GitHub and npm

- The package repository is GitHub-hosted per [`package.json`](/Users/michaelgichia/workspace/taro/package.json).
- Release dry runs run on pull requests and manual dispatch through [`.github/workflows/dry-run.yml`](/Users/michaelgichia/workspace/taro/.github/workflows/dry-run.yml).
- Tagged releases publish to npm through [`.github/workflows/publish.yml`](/Users/michaelgichia/workspace/taro/.github/workflows/publish.yml).
- The publish workflow also uses `gh issue` to comment on and close a release-tracker issue after success.

## Filesystem Integration Points

- Generated tests are written into consumer repos via [`src/core/writer.ts`](/Users/michaelgichia/workspace/taro/src/core/writer.ts) and post-processed in command helpers.
- Runtime installers materialize skills, references, hooks, and manifests into user home directories and local project folders.
- Hook scripts exist in `hooks/` for status line, context monitoring, and update checks.

## Auth and Secrets

- Taro does not provide a first-party auth backend.
- It can detect and reuse Playwright storage-state JSON files from consumer repositories through logic in [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts).
- Auth state is file-based and local to the consuming project, not a service managed by this repo.

## Notable Non-Integrations

- No database server is operated by this package.
- No HTTP API client for a Taro-owned backend appears in the inspected source.
- No webhook receiver, queue worker, or long-running daemon is present in the repo.
