# Architecture

## System Shape

Taro is an installer-first CLI package with a layered architecture:

1. A public CLI surface for installation/versioning.
2. Internal runtime-only commands for generate/init/refresh/target workflows.
3. Core libraries that parse recordings, learn repo conventions, plan generation, score output, and write files.
4. Runtime installers that project Taro into Codex, Claude Code, Gemini CLI, and OpenCode.

## Main Entry Points

- Public process entrypoint: [`src/index.ts`](/Users/michaelgichia/workspace/taro/src/index.ts).
- Internal command entrypoints live in `src/cli/commands/`, including [`src/cli/commands/generate.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.ts), [`src/cli/commands/init.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/init.ts), [`src/cli/commands/refresh.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/refresh.ts), and [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts).
- Installer/build scripts live at the repo root under `scripts/` and `bin/`.

## Generation Pipeline

The primary modern flow is the generate/target pipeline:

- Input validation and recording parsing.
- Taro state bootstrap/loading.
- Optional visual context capture and auth handling.
- Context search and package-profile refinement.
- Recording analysis, mock analysis, and suite planning.
- Selector resolution and code generation.
- Output scoring, post-processing, writing, and verification.

This flow is coordinated by the XState machine in [`src/cli/commands/generate.machine.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.machine.ts) and actor set in `src/cli/commands/generate.actors.ts`.

## Domain Layers

### CLI orchestration

- `src/cli/commands/` owns user-facing flow composition, diagnostics, auth flow, directory loop mode, and output reconciliation.
- [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts) is the heaviest command surface and integrates many lower-level modules.

### Core intelligence

- `src/core/` contains repo-aware generation logic, component targeting, scoring, resolver logic, state machines, and file writing.
- [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts) is the center of package-profile/state bootstrap behavior.
- [`src/core/resolver.ts`](/Users/michaelgichia/workspace/taro/src/core/resolver.ts) and [`src/core/component-targeting.ts`](/Users/michaelgichia/workspace/taro/src/core/component-targeting.ts) appear to hold the selector/boundary targeting intelligence.

### Analysis and synthesis

- `src/analyzer/` inspects visual elements and mock targets.
- `src/parser/` normalizes Recorder inputs into internal types.
- `src/generator/` and `src/templates/` convert planned output into emitted test code and helper snippets.
- `src/scorer/` evaluates quality both before and after writes.
- `src/learner/` observes existing test suites and stores conventions for future runs.

## State and Persistence Model

- Ephemeral CLI flow state is modeled with XState actors and machine context.
- Persistent project state lives under `.taro/`.
- Convention learning uses SQLite-backed storage.
- Some workflows also produce markdown trackers, such as directory-loop progress files.

## Installation Architecture

- The install subsystem maps runtime asset definitions to file operations.
- Runtime-specific builders under `src/install/runtimes/` define destination paths and entrypoint names.
- The same package ships both the installer and the assets/templates it installs.

## Architectural Notes

- The codebase has both a modern actor/machine pipeline and an older monolithic orchestrator in [`src/core/orchestrator.ts`](/Users/michaelgichia/workspace/taro/src/core/orchestrator.ts).
- That older orchestrator still documents the original 4-step flow but includes placeholder generation behavior, so it should be treated as legacy/reference unless proved otherwise.
