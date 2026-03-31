# Stack

## Overview

Taro is a TypeScript-first Node CLI package that installs runtime-native skills/commands for multiple agent environments and generates React Testing Library tests from Recorder exports.

## Languages and Runtime

- TypeScript is the primary implementation language across `src/`.
- Node.js `>=18` is required by [`package.json`](/Users/michaelgichia/workspace/taro/package.json).
- The package uses ESM (`"type": "module"`) and compiles into `dist/`.
- CommonJS is still used for some repo scripts such as [`scripts/run-tests.cjs`](/Users/michaelgichia/workspace/taro/scripts/run-tests.cjs) and [`scripts/generate-changelog.cjs`](/Users/michaelgichia/workspace/taro/scripts/generate-changelog.cjs).

## Build and Packaging

- Source compiles from `src/` to `dist/` using [`tsconfig.json`](/Users/michaelgichia/workspace/taro/tsconfig.json) and `tsconfig.build.json`.
- The package exposes a CLI binary through [`bin/install.js`](/Users/michaelgichia/workspace/taro/bin/install.js).
- Published package contents are explicitly whitelisted in [`package.json`](/Users/michaelgichia/workspace/taro/package.json) under `files`.
- Local runtime surfaces are scaffolded into hidden folders such as `.codex/`, `.claude/`, and `.gemini/`.

## Core Libraries

- CLI framework: `commander` via [`src/index.ts`](/Users/michaelgichia/workspace/taro/src/index.ts).
- Terminal output: `picocolors`.
- State machines/orchestration: `xstate`, especially in [`src/cli/commands/generate.machine.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.machine.ts).
- AST and source analysis: `@babel/parser`, `@babel/traverse`, `@babel/types`, and `ts-morph`.
- Pattern matching: `ts-pattern`.
- Local persistence: `better-sqlite3` in the learner/state stack.
- Browser automation and page inspection: `playwright`.
- Validation/types: `zod`.

## Internal Subsystems

- CLI command layer in `src/cli/commands/`.
- Core generation/state/intelligence logic in `src/core/`.
- Recording and mock analyzers in `src/analyzer/`.
- Test/mocks/template emitters in `src/generator/` and `src/templates/`.
- Persistent convention learning in `src/learner/`.
- Scoring and audits in `src/scorer/`.
- Runtime installation scaffolding in `src/install/`.
- Recorder normalization in `src/parser/`.

## Import and Module Conventions

- The repo uses a path alias pattern `#*.ts` configured in [`tsconfig.json`](/Users/michaelgichia/workspace/taro/tsconfig.json).
- Imports typically resolve to internal files like `#core/state.ts` or `#cli/commands/target.ts` rather than long relative paths.
- Tests are excluded from the production build via the TypeScript config.

## Tooling

- Formatting: `prettier`.
- Linting: `eslint` with `@typescript-eslint`, `simple-import-sort`, and a separate unused-code config in [`eslint.unused.config.mjs`](/Users/michaelgichia/workspace/taro/eslint.unused.config.mjs).
- Static dead-code checks: `knip`.
- Test runner: `vitest`, wrapped by [`scripts/run-tests.cjs`](/Users/michaelgichia/workspace/taro/scripts/run-tests.cjs).

## Release Tooling

- Release dry runs and npm publishing are handled by GitHub Actions in [`.github/workflows/dry-run.yml`](/Users/michaelgichia/workspace/taro/.github/workflows/dry-run.yml) and [`.github/workflows/publish.yml`](/Users/michaelgichia/workspace/taro/.github/workflows/publish.yml).
- Publishing uses npm Trusted Publishing from GitHub-hosted runners rather than a checked-in npm token.
