# Structure

## Top-Level Layout

- [`package.json`](/Users/michaelgichia/workspace/taro/package.json): package metadata, scripts, dependencies, binary entrypoint.
- [`README.md`](/Users/michaelgichia/workspace/taro/README.md): product and workflow documentation.
- `src/`: primary TypeScript source.
- `scripts/`: repo-maintenance/build helper scripts.
- `bin/`: install-time JS entrypoint.
- `hooks/`: runtime hook scripts.
- `.github/workflows/`: release dry-run and npm publish automation.
- `dist/`: compiled output.
- `.taro/`: local generated state and learned profiles, ignored from git.

## Source Tree by Area

- `src/cli/commands/` (40 files): command composition, UX, directory-loop mode, auth/visual flow, reporting.
- `src/core/` (83 files): state, resolver, generation, targeting, verification, utilities.
- `src/install/` (39 files): runtime installation planning and file operations.
- `src/analyzer/` (16 files): visual and mock analysis.
- `src/generator/` (13 files): transforms and mock builders.
- `src/parser/` (10 files): Recorder parsing steps and utilities.
- `src/scorer/` (11 files): audits, quality gates, scoring.
- `src/learner/` (9 files): convention extraction and storage.
- `src/templates/` (5 files): code template assembly.

## Testing Layout

- Most tests are colocated under `src/**/tests/` or named `*.test.ts`.
- Repo-wide support tests also live in `src/tests/`.
- The current tree contains about 70 TypeScript test files.

## Naming Patterns

- Command modules follow `createXCommand` factories, for example [`src/cli/commands/init.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/init.ts).
- Types are often colocated as `types.ts`, `*.types.ts`, or shared under `src/types/`.
- Constant files usually use `constant.ts` or `*.constants.ts`.
- Helper-heavy modules often use `utils.ts`.
- State-machine-related files cluster as `state.ts`, `state.machine.ts`, `state.utils.ts`, and `state.validation.ts`.

## Path Resolution

- Internal imports use the `#*.ts` alias configured in [`tsconfig.json`](/Users/michaelgichia/workspace/taro/tsconfig.json).
- This keeps modules rooted from `src/` rather than chaining relative paths.

## Generated and Ignored Paths

- `dist/`, `.taro/`, `.codex/`, `.claude/`, `coverage/`, and `node_modules/` are ignored by [`.gitignore`](/Users/michaelgichia/workspace/taro/.gitignore).
- Runtime-generated skill surfaces are intentionally not checked in.
- Only workflow files under `.github/workflows/` are tracked among the hidden tool folders inspected.

## Key High-Leverage Files

- [`src/index.ts`](/Users/michaelgichia/workspace/taro/src/index.ts): public CLI dispatch.
- [`src/cli/commands/generate.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.ts): generation command composition.
- [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts): explicit file/directory targeting flow.
- [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts): bootstrap, package profiling, and persisted state orchestration.
- [`src/core/resolver.ts`](/Users/michaelgichia/workspace/taro/src/core/resolver.ts): selector and replay logic.
- [`src/install/runtimes/codex.ts`](/Users/michaelgichia/workspace/taro/src/install/runtimes/codex.ts): representative runtime asset mapping.

## Practical Navigation

- Start at [`README.md`](/Users/michaelgichia/workspace/taro/README.md) for user-facing behavior.
- Move to [`src/index.ts`](/Users/michaelgichia/workspace/taro/src/index.ts) to see dispatch boundaries.
- For generation behavior, traverse `src/cli/commands/` into `src/core/`.
- For installer/runtime behavior, stay in `src/install/` plus the root `scripts/` files.
