# Conventions

## Language and Module Style

- The repo is ESM-first TypeScript with strict compiler settings in [`tsconfig.json`](/Users/michaelgichia/workspace/taro/tsconfig.json).
- Internal imports use the `#*.ts` alias instead of long relative paths.
- Modules favor named exports and small utility helpers, with local interfaces/types near the command or subsystem that uses them.

## File Organization

- Commands expose `createXCommand()` factories, for example [`src/cli/commands/init.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/init.ts).
- Heavier domains split into `types`, `utils`, `constant(s)`, and `tests` siblings.
- Tests are commonly colocated with the implementation they cover.

## Code Style

- Formatting is delegated to Prettier; linting is handled by ESLint plus `@typescript-eslint`.
- Import ordering is enforced as warnings through `simple-import-sort` in [`eslint.config.mjs`](/Users/michaelgichia/workspace/taro/eslint.config.mjs).
- Unused variables are tolerated when prefixed with `_`.
- Comments are used sparingly and usually explain workflow intent or domain semantics rather than trivial lines.

## Error Handling Pattern

- Lower-level modules usually throw `Error` or return structured results.
- Command-boundary modules often convert failures into stderr output plus `process.exit(...)`, especially in [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts) and [`src/cli/commands/generate.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.ts).
- Soft failures often downgrade to `console.warn(...)`, especially during state learning and selector recovery.

## File-System Practices

- Modern write paths often use `fs/promises`.
- Atomic file replacement is used in places like [`src/cli/commands/target-directory-tracker.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target-directory-tracker.ts), where content is written to a temp file and then renamed.
- Small synchronous helpers still exist for bootstrap-style paths in [`src/project-state.ts`](/Users/michaelgichia/workspace/taro/src/project-state.ts) and learner utilities.

## CLI UX Conventions

- CLI output consistently prefixes user-facing runtime messages with `[taro]` or colored headings via `picocolors`.
- Command surfaces distinguish public install flow from internal runtime-only commands like `__generate`, `__init`, and `__target` in [`src/index.ts`](/Users/michaelgichia/workspace/taro/src/index.ts).
- Reporting modules emit warnings instead of silently hiding low-confidence or draft-quality output.

## Domain Conventions

- Generated output is allowed to contain explicit TODO/draft markers when Taro cannot fully resolve a safe RTL boundary.
- Repo-local state and learned conventions are treated as first-class inputs to later generations.
- Runtime installation is declarative: asset definitions are listed first, then translated into file operations.

## Test Conventions

- Tests use Vitest globals such as `describe`, `it`, `test`, `expect`, and `vi`.
- Mocking commonly uses `vi.mock(...)`, command/argv overrides, and fixture-heavy unit tests.
- Coverage and output quality are treated as product behavior, not just infrastructure, reflected by dedicated scorer and verifier modules.
