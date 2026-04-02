# Testing

## Test Stack

- Test runner: `vitest`, declared in [`package.json`](/Users/michaelgichia/workspace/taro/package.json).
- Coverage provider: `@vitest/coverage-v8`.
- The default test command runs through [`scripts/run-tests.cjs`](/Users/michaelgichia/workspace/taro/scripts/run-tests.cjs), which forwards to the Vitest CLI.

## Test Layout

- The repo currently has about 70 TypeScript test files.
- Most tests live beside implementation code in folders like `src/core/tests/`, `src/cli/commands/tests/`, `src/install/tests/`, `src/scorer/tests/`, and `src/scripts/tests/`.
- Support fixtures and cross-cutting tests live in `src/tests/` and `src/tests/fixtures/`.

## What Gets Tested

- CLI routing and installer behavior in [`src/tests/index.test.ts`](/Users/michaelgichia/workspace/taro/src/tests/index.test.ts) and `src/install/tests/`.
- Generation pipeline internals in `src/core/tests/`.
- Explicit target/directory-loop behavior in [`src/cli/commands/tests/target.test.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/tests/target.test.ts) and [`src/cli/commands/tests/target-directory-tracker.test.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/tests/target-directory-tracker.test.ts).
- Visual analyzer behavior in [`src/analyzer/visual/tests/inspector.test.ts`](/Users/michaelgichia/workspace/taro/src/analyzer/visual/tests/inspector.test.ts).
- Quality gates and verifier behavior in `src/scorer/tests/`.
- Repo helper scripts in `src/scripts/tests/`.

## Test Style

- Tests use `describe(...)` + `it(...)`/`test(...)` with explicit expectations.
- Mocking relies heavily on `vi`, synthetic fixtures, and process/argv overrides.
- Command tests often assert emitted paths, written files, or subprocess arguments rather than only pure returns.

## Fixture Usage

- Recorder and generated-test fixtures appear in `src/tests/fixtures/`.
- Some tests validate draft-quality markers and TODO annotations directly, which matches the product’s explicit “manual review required” behavior.

## CI Coverage

- GitHub Actions workflows run `pnpm test` and `pnpm run --if-present build`.
- Release dry runs also verify changelog generation and `pnpm publish --dry-run`.
- There is no separate workflow gate for `pnpm lint` or `pnpm type:check` in the inspected workflows.

## Practical Commands

- `pnpm test`: runs the repo’s wrapped Vitest suite.
- `pnpm run test:run`: forwards to `vitest run`.
- `pnpm run test:coverage`: runs coverage mode.
- `pnpm run coverage:uncovered`: prints uncovered files from the generated coverage JSON.

## Testing Takeaway

The project has broad unit/integration-style coverage for a CLI package and treats generation quality, verification, and installer behavior as core tested surfaces rather than incidental tooling.
