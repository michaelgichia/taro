# Taro

Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex, run the runtime-native `init` entrypoint as the recommended first step, then generate, review mocks, grade, and regrade React Testing Library tests.

Taro ships as an installer-first package. The package entrypoint bootstraps runtime-native commands or skills into your agent environment, and those runtime entrypoints cover init, refresh, generation, bounded mock review, and AI-driven grading workflows.

For the current strict-order runtime generation path, see [docs/PIPELINE.md](./docs/PIPELINE.md).

## Getting Started

Run the installer with whichever package manager your project uses:

| Package manager | Install command                      |
| --------------- | ------------------------------------ |
| npm             | `npx @tr-rtl/cli@latest`             |
| pnpm            | `pnpm dlx @tr-rtl/cli@latest`        |
| yarn (berry)    | `yarn dlx @tr-rtl/cli@latest`        |
| bun             | `bunx @tr-rtl/cli@latest`            |
| deno            | `deno run -A npm:@tr-rtl/cli@latest` |

Yarn classic (v1) has no `dlx`; use `npx @tr-rtl/cli@latest` from a yarn classic project. Examples below use `npx` as the canonical form — substitute any row from the matrix and the flags work identically.

The installer prompts you to choose:

1. **Runtime** — Claude Code, OpenCode, Gemini CLI, Codex, or all
2. **Location** — Global (all projects) or local (current project only)

After installation or reinstall, run the runtime-native `init` entrypoint:

- Claude Code: `/@tr-rtl/cli:init`
- Gemini CLI: `/@tr-rtl/cli:init`
- OpenCode: `/@tr-rtl/cli-init`
- Codex: `$@tr-rtl/cli-init`

The installed runtime entrypoints invoke Taro through an installed launcher path; they do not require a shell-wide `taro` binary on `PATH`. If you need the package version without a `PATH` install, run any matrix row with `--version`, e.g. `npx @tr-rtl/cli@latest --version`.

Use the runtime-native help entrypoint when you want routing guidance:

- Claude Code: `/@tr-rtl/cli:help`
- Gemini CLI: `/@tr-rtl/cli:help`
- OpenCode: `/@tr-rtl/cli-help`
- Codex: `$@tr-rtl/cli-help`

Use the runtime-native mock review entrypoint when you want standalone mock and fixture guidance:

- Claude Code: `/@tr-rtl/cli:mocks`
- Gemini CLI: `/@tr-rtl/cli:mocks`
- OpenCode: `/@tr-rtl/cli-mocks`
- Codex: `$@tr-rtl/cli-mocks`

> [!NOTE] Codex installation uses skills under `skills/@tr-rtl/cli-*/SKILL.md`, not prompt files.

## Staying Updated

Use the runtime-native `refresh` entrypoint for maintenance after Taro is already installed:

- Claude Code: `/@tr-rtl/cli:refresh`
- Gemini CLI: `/@tr-rtl/cli:refresh`
- OpenCode: `/@tr-rtl/cli-refresh`
- Codex: `$@tr-rtl/cli-refresh`

If you need a newer package version first, rerun the installer package with the matrix command for your package manager (e.g. `npx @tr-rtl/cli@latest`, `pnpm dlx @tr-rtl/cli@latest`, `yarn dlx @tr-rtl/cli@latest`, `bunx @tr-rtl/cli@latest`, or `deno run -A npm:@tr-rtl/cli@latest`).

After updating the package, run the runtime-native `refresh` entrypoint. Refresh is the maintenance path for owned assets: it restores missing owned files and protects manual edits instead of overwriting them silently.

## Non-interactive Install

Use runtime flags plus exactly one location flag to skip prompts. The examples below use `npx` — swap in `pnpm dlx`, `yarn dlx`, `bunx`, or `deno run -A npm:` as appropriate:

```bash
# Claude Code
npx @tr-rtl/cli@latest --claude --global
npx @tr-rtl/cli@latest --claude --local

# OpenCode
npx @tr-rtl/cli@latest --opencode --global
npx @tr-rtl/cli@latest --opencode --local

# Gemini CLI
npx @tr-rtl/cli@latest --gemini --global
npx @tr-rtl/cli@latest --gemini --local

# Codex
npx @tr-rtl/cli@latest --codex --global
npx @tr-rtl/cli@latest --codex --local

# All runtimes
npx @tr-rtl/cli@latest --all --global
npx @tr-rtl/cli@latest --all --local
```

Local installs write to hidden runtime directories in the current project:

- Claude Code: `./.claude/`
- OpenCode: `./.opencode/`
- Gemini CLI: `./.gemini/`
- Codex: `./.codex/`

## Development Installation

When you want to test the installer from a local checkout instead of the published package:

```bash
# Build the CLI
pnpm run build

# Build, install locally for this repo, then reinstall the global Claude surface cleanly
pnpm run build:claude

# Build, install locally for this repo, then reinstall the global OpenCode surface cleanly
pnpm run build:opencode

# Build, install locally for this repo, then reinstall the global Codex surface cleanly
pnpm run build:codex

# Exercise the installer from the built package entrypoint
node dist/index.js --all --local

# Or verify the publish boundary with a tarball
pnpm pack --pack-destination /tmp/taro-pack
pnpm dlx /tmp/taro-pack/tr-rtl-1.0.0.tgz --codex --local
```

The tarball flow is the closest match to what end users get from npm.

`pnpm run build:claude` performs three steps:

1. builds the package
2. installs Claude commands into this repo's `./.claude/`
3. deletes the existing global Taro Claude command directory at `~/.claude/commands/@tr-rtl/cli` and reinstalls it cleanly

`pnpm run build:opencode` performs the OpenCode equivalent:

1. builds the package
2. installs OpenCode commands into this repo's `./.opencode/`
3. deletes the existing global Taro OpenCode command namespace at `~/.config/opencode/commands/@tr-rtl` plus `~/.config/opencode/install-manifest.json`
4. reinstalls the global OpenCode surface cleanly

`pnpm run build:codex` performs the Codex equivalent:

1. builds the package
2. installs Codex skills into this repo's `./.codex/`
3. deletes the existing global Taro Codex skill directories plus `~/.codex/@tr-rtl-manifest.json`
4. reinstalls the global Codex surface cleanly

That reinstalls the Codex skill surface only. It does not place a global `taro` binary on your shell `PATH`; the installed Codex skills call this checkout's `dist/index.js` directly. When you move or replace the checkout, rerun `pnpm run build:codex` so the launcher paths stay current.

## Publishing Releases

Taro publishes from GitHub Actions when a `v*` tag is pushed. The publish job installs dependencies with `pnpm install --frozen-lockfile`, runs `pnpm test`, builds with `pnpm run --if-present build`, and publishes from GitHub Actions via npm Trusted Publishing.

Local release flow:

```bash
pnpm version patch
git push
git push --tags
```

Use `minor` or `major` instead of `patch` when needed. `pnpm version` updates `package.json`, creates the matching git tag, and the tag push triggers [`.github/workflows/publish.yml`](./.github/workflows/publish.yml).

One-time setup:

1. In npm package settings for `@tr-rtl/cli`, add GitHub Actions as a Trusted Publisher
2. Use the GitHub repository `michaelgichia/taro`
3. Set the workflow filename to `publish.yml`
4. Leave the environment name blank unless you intentionally protect releases with a GitHub Actions environment

Trusted publishing requires GitHub-hosted runners plus a current Node/npm toolchain. The release workflow uses Node `22.14.0` so npm can exchange the GitHub OIDC identity for a publish grant without storing a long-lived `NPM_TOKEN`.

Because publishing only runs from tagged commits in CI, the package version, git tag, workflow run, and published artifact stay tied to the same source revision.

## Generate RTL Tests

After installation and a first `init` run, use the runtime-native installed generate command or skill for your agent:

- Claude Code: `/@tr-rtl/cli:gen`
- Claude Code: `/@tr-rtl/cli:geni`
- Claude Code: `/@tr-rtl/cli:grade`
- Claude Code: `/@tr-rtl/cli:regrade`
- Claude Code: `/@tr-rtl/cli:target`
- Claude Code: `/@tr-rtl/cli:mocks`
- Gemini CLI: `/@tr-rtl/cli:gen`
- Gemini CLI: `/@tr-rtl/cli:geni`
- Gemini CLI: `/@tr-rtl/cli:grade`
- Gemini CLI: `/@tr-rtl/cli:regrade`
- Gemini CLI: `/@tr-rtl/cli:target`
- Gemini CLI: `/@tr-rtl/cli:mocks`
- OpenCode: `/@tr-rtl/cli-gen`
- OpenCode: `/@tr-rtl/cli-geni`
- OpenCode: `/@tr-rtl/cli-grade`
- OpenCode: `/@tr-rtl/cli-regrade`
- OpenCode: `/@tr-rtl/cli-target`
- OpenCode: `/@tr-rtl/cli-mocks`
- Codex: `$@tr-rtl/cli-gen`
- Codex: `$@tr-rtl/cli-geni`
- Codex: `$@tr-rtl/cli-grade`
- Codex: `$@tr-rtl/cli-regrade`
- Codex: `$@tr-rtl/cli-target`
- Codex: `$@tr-rtl/cli-mocks`

### Prerequisites

- Node.js 18 or later
- A React project using `@testing-library/react`
- Chrome DevTools Recorder with the Testing Library Recorder extension installed

### Record a user flow

Open Chrome DevTools → Recorder panel → click "Start new recording" → perform your user flow → click "End recording".

Taro supports one export path:

- Testing Library Recorder JS export: save as `recording.js`

### Generate the test

Run your runtime-native generate entrypoint against `recording.js`. When Taro infers the owning render target, it must write the generated test next to the inferred component and refuses to overwrite an existing file. If it cannot infer a render target, the fallback boundary-draft output is written next to the recording instead.

If you already know the component under test, use the runtime-native `target` entrypoint with a component file path or a component-directory path. File mode writes next to the supplied component and can optionally take a Recorder `.js` file to preserve concrete interaction flow while forcing the component render target. Directory mode runs with `--directory-loop`, writes a tracker under `.taro/directory-loop/`, and skips non-component source files so mixed directories only queue files that export JSX components.

Single-file `gen`, `geni`, and `target` flows may run one automatic mock-review repair pass when Taro emits mock-review findings such as `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`. That second pass is limited to mock-scoped edits, regrades with `__regrade`, and keeps changes only when syntax, score, flow coverage, and blocking findings do not regress.

When you need a score gate, append `--min-score <0-100>` to `__generate` or `__target`. For single-file generation flows, the installed runtime entrypoint treats that as the final post-review gate, not the first-pass gate. `target --directory-loop` keeps the existing review-only behavior in v1 and still applies `--min-score` directly to the runtime command.

Expected output:

```text
Parsed: my user flow - 8 steps
[taro] Score: 78/100 (B) — query: 80, assertions: 70, structure: 85, boundary: 76
Created: src/components/MyComponent.test.tsx
[taro] ✓ post-write verified
```

On subsequent runs in the same project, Taro reads `.taro/state.json` package profiles to match your test style automatically. If `.taro/state.json` is missing, `gen` performs a light bootstrap, but `init` remains the recommended first step for brownfield repos.

For the exact module execution order behind `__generate`, see [docs/PIPELINE.md](./docs/PIPELINE.md).

## Grade Existing Tests

Use the runtime-native grading entrypoints when you want an AI-facing review of existing RTL tests without rerunning generation:

- Claude Code: `/@tr-rtl/cli:grade path/to/test-file`
- Claude Code: `/@tr-rtl/cli:regrade path/to/test-file`
- Claude Code: `/@tr-rtl/cli:regrade path/to/test-directory --directory-loop`
- Gemini CLI: `/@tr-rtl/cli:grade path/to/test-file`
- Gemini CLI: `/@tr-rtl/cli:regrade path/to/test-file`
- Gemini CLI: `/@tr-rtl/cli:regrade path/to/test-directory --directory-loop`
- OpenCode: `/@tr-rtl/cli-grade path/to/test-file`
- OpenCode: `/@tr-rtl/cli-regrade path/to/test-file`
- OpenCode: `/@tr-rtl/cli-regrade path/to/test-directory --directory-loop`
- Codex: `$@tr-rtl/cli-grade`
- Codex: `$@tr-rtl/cli-regrade`

`grade` scores the current file with the same `ScoreResult` scorer used by `gen`, `geni`, and `target`, then appends a new `generatedTests` snapshot into `.taro/state.json`.

`regrade` supports two modes:

- Single-file mode re-scores the current test file, compares it to the latest stored `generatedTests` snapshot for the same `testFile` when one exists, and appends a new snapshot into `.taro/state.json`.
- Directory-loop mode runs `regrade <test-directory> --directory-loop`, discovers `*.test.*` and `*.spec.*` files in that directory tree, and writes a tracker under `.taro/directory-loop/` while reusing the same file-grade runner as single-file regrade.

For both commands, Taro keeps only the latest 5 stored snapshots per `generatedTests[].testFile` so score movement stays visible over time without unbounded per-test history growth.

Stored `generatedTests` scores bias existing-test learning during `init`, `refresh`, and stale-state bootstrap. Legacy `gradedTests` history is only used as fallback when no canonical `generatedTests` snapshot exists yet for a test. Higher-scored stored tests count more strongly when Taro relearns conventions, helpers, exemplars, and boundary patterns; unscored tests remain neutral.

Across `target`, `grade`, `regrade`, `gen`, and `geni`, Taro reports the same score shape:

- `queryQuality` /100
- `assertionSpecificity` /100
- `testStructure` /100
- `boundaryIsolation` /100

Taro then computes the final `overall` score as a weighted aggregate of those four dimensions: query `30%`, assertions `25%`, structure `20%`, boundary `25%`.

In directory-loop mode, each tracker row starts as `pending`, moves to `in-progress` when Taro picks that test, and ends as `completed` after the regrade succeeds. Completed rows keep the current score threshold from the latest `generatedTests` snapshot, the updated score threshold, and any follow-up comments returned by the regrade run.

### Draft-quality output is explicit

When Taro cannot prove the final render/query boundary yet, it keeps the output writable but marks it as draft-quality instead of pretending the gaps are solved.

```text
[taro] Score: 77/100 (C) — query: 100, assertions: 30, structure: 70, boundary: 100
[taro] Manual review required — this generated test is still a draft (77/100, C).
[taro] Top blockers: The generated test still renders <App /> instead of a resolved repo target. | Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.
// taro-query-checkpoint: click step requires manual RTL query recovery
```

That draft banner is advisory. Taro does not block writes, but it does tell you when import targets, placeholder queries, or unresolved boundaries still need cleanup.

## Worked Example

### Input: Testing Library Recorder export (`login-flow.js`)

Here is a typical Testing Library Recorder export capturing a login flow.

```js
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";

test("login flow", async () => {
  await userEvent.click(screen.getByRole("textbox", { name: "Email address" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Email address" }),
    "user@example.com"
  );
  await userEvent.click(screen.getByRole("textbox", { name: "Password" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Password" }),
    "secret123"
  );
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await userEvent.click(screen.getByText("Welcome back"));
});
```

### Runtime command

Run your installed runtime-native generate entrypoint with `./login-flow.js`.

### Terminal output

```
Parsed: login flow - 7 steps
[taro] Score: 82/100 (B) — query: 90, assertions: 75, structure: 80, boundary: 85
Created: login-flow.test.tsx
[taro] ✓ post-write verified
```

### Output: Generated test (`login-flow.test.tsx`)

Taro generates a convention-aware RTL test with accessible queries:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../LoginPage'

describe('login flow', () => {
  it('should complete login flow', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('textbox', { name: /email address/i }))
    await user.type(screen.getByRole('textbox', { name: /email address/i }), 'user@example.com')
    await user.click(screen.getByRole('textbox', { name: /password/i }))
    await user.type(screen.getByRole('textbox', { name: /password/i }), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
  })
})
```

### What Taro did here

- Parsed the navigate step and inferred the component under test
- Upgraded CSS selectors (`#email`, `#password`) to accessible `getByRole` queries using aria attributes from the recording
- Inferred `userEvent.type()` from change steps and `userEvent.click()` from click steps
- Mapped the `waitForElement` step to a `toBeInTheDocument()` assertion
- Scored the output (82/100) and emitted no blocking errors

> **Note:** The component import path (`../LoginPage`) is a placeholder. Taro generates a comment in the file indicating where to update it.

## Agent Usage

After installation, each runtime gets a namespaced help entrypoint plus `init`, `refresh`, `gen`, `mocks`, `grade`, `regrade`, and `target` entrypoints. Use `init` first, `refresh` for maintenance, `gen` for Recorder-to-RTL output, `mocks` for standalone mock or fixture review, `grade` for existing-test evaluation with a stored snapshot, `regrade` when you want a delta-focused re-evaluation plus a new stored snapshot after edits, and `target` when you want to force a specific component path.

### Tips

- When Taro infers the owning render target, it writes the generated test next to that component using the same basename
- If you re-record a flow, Taro now compares the existing generated test against the new Recorder flow and only overwrites when coverage or quality improves
- If you record multiple flows, run Taro on each to build up package state in `.taro/state.json` — later runs benefit from earlier ones
- Commit `.taro/state.json` when you want learned package profiles to persist across teammates and CI
- Add `.taro/overrides.json` when you need to pin runner, render helper, or shared mock policy for a package

### Notes

- Taro does not require network access at generation time (DOM inspection via Playwright is optional and only runs when a live URL is in the recording)
- All state is local to `.taro/` — no external service is contacted
