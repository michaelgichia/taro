# Taro

Install Taro into Claude Code, OpenCode, Gemini CLI, or Codex, run the runtime-native `init` entrypoint as the recommended first step, then generate React Testing Library tests from Testing Library Recorder JS exports.

Taro ships as an installer-first package. The package entrypoint bootstraps runtime-native commands or skills into your agent environment, and those runtime entrypoints run Taro's internal JS-only init, refresh, and generation flows.

For the current strict-order runtime generation path, see [docs/PIPELINE.md](./docs/PIPELINE.md).

## Getting Started

```bash
npx @taro-test/rtl@latest
```

The installer prompts you to choose:

1. **Runtime** — Claude Code, OpenCode, Gemini CLI, Codex, or all
2. **Location** — Global (all projects) or local (current project only)

After installation or reinstall, run the runtime-native `init` entrypoint:

- Claude Code: `/@taro-test/rtl:init`
- Gemini CLI: `/@taro-test/rtl:init`
- OpenCode: `/@taro-test/rtl-init`
- Codex: `$@taro-test/rtl-init`

The installed runtime entrypoints invoke Taro through an installed launcher path; they do not require a shell-wide `taro` binary on `PATH`. If you need the package version without a `PATH` install, run `npx @taro-test/rtl@latest --version`.

Use the runtime-native help entrypoint when you want routing guidance:

- Claude Code: `/@taro-test/rtl:help`
- Gemini CLI: `/@taro-test/rtl:help`
- OpenCode: `/@taro-test/rtl-help`
- Codex: `$@taro-test/rtl-help`

> [!NOTE]
> Codex installation uses skills under `skills/@taro-test/rtl-*/SKILL.md`, not prompt files.

## Staying Updated

Use the runtime-native `refresh` entrypoint for maintenance after Taro is already installed:

- Claude Code: `/@taro-test/rtl:refresh`
- Gemini CLI: `/@taro-test/rtl:refresh`
- OpenCode: `/@taro-test/rtl-refresh`
- Codex: `$@taro-test/rtl-refresh`

If you need a newer package version first, rerun the installer package:

```bash
npx @taro-test/rtl@latest
```

After updating the package, run the runtime-native `refresh` entrypoint. Refresh is the maintenance path for owned assets: it restores missing owned files and protects manual edits instead of overwriting them silently.

## Non-interactive Install

Use runtime flags plus exactly one location flag to skip prompts:

```bash
# Claude Code
npx @taro-test/rtl@latest --claude --global
npx @taro-test/rtl@latest --claude --local

# OpenCode
npx @taro-test/rtl@latest --opencode --global
npx @taro-test/rtl@latest --opencode --local

# Gemini CLI
npx @taro-test/rtl@latest --gemini --global
npx @taro-test/rtl@latest --gemini --local

# Codex
npx @taro-test/rtl@latest --codex --global
npx @taro-test/rtl@latest --codex --local

# All runtimes
npx @taro-test/rtl@latest --all --global
npx @taro-test/rtl@latest --all --local
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
npm run build

# Build, install locally for this repo, then reinstall the global Claude surface cleanly
npm run build:claude

# Build, install locally for this repo, then reinstall the global Codex surface cleanly
npm run build:codex

# Exercise the installer from the built package entrypoint
node dist/index.js --all --local

# Or verify the publish boundary with a tarball
env NPM_CONFIG_CACHE=/tmp/taro-npm-cache npm pack --pack-destination /tmp/taro-pack
npx /tmp/taro-pack/taro-test-rtl-1.0.0.tgz --codex --local
```

The tarball flow is the closest match to what end users get from npm.

`npm run build:claude` performs three steps:

1. builds the package
2. installs Claude commands into this repo's `./.claude/`
3. deletes the existing global Taro Claude command directory at `~/.claude/commands/@taro-test/rtl` and reinstalls it cleanly

`npm run build:codex` performs the Codex equivalent:

1. builds the package
2. installs Codex skills into this repo's `./.codex/`
3. deletes the existing global Taro Codex skill directories plus `~/.codex/@taro-test-rtl-manifest.json`
4. reinstalls the global Codex surface cleanly

That reinstalls the Codex skill surface only. It does not place a global `taro` binary on your shell `PATH`; the installed Codex skills call this checkout's `dist/index.js` directly. When you move or replace the checkout, rerun `npm run build:codex` so the launcher paths stay current.

## Generate RTL Tests

After installation and a first `init` run, use the runtime-native installed generate command or skill for your agent:

- Claude Code: `/@taro-test/rtl:generate`
- Claude Code: `/@taro-test/rtl:generate-i`
- Gemini CLI: `/@taro-test/rtl:generate`
- Gemini CLI: `/@taro-test/rtl:generate-i`
- OpenCode: `/@taro-test/rtl-generate`
- OpenCode: `/@taro-test/rtl-generate-i`
- Codex: `$@taro-test/rtl-generate`
- Codex: `$@taro-test/rtl-generate-i`

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

Expected output:

```text
Parsed: my user flow — 8 steps
[taro] Score: 78/100 (B) — query: 80, assertions: 70, structure: 85
Created: src/components/MyComponent.test.tsx
[taro] ✓ post-write verified
```

On subsequent runs in the same project, Taro reads `.taro/state.json` package profiles to match your test style automatically. If `.taro/state.json` is missing, `generate` performs a light bootstrap, but `init` remains the recommended first step for brownfield repos.

For the exact module execution order behind `__generate`, see [docs/PIPELINE.md](./docs/PIPELINE.md).

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
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'

test('login flow', async () => {
  await userEvent.click(screen.getByRole('textbox', { name: 'Email address' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Email address' }), 'user@example.com')
  await userEvent.click(screen.getByRole('textbox', { name: 'Password' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Password' }), 'secret123')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await userEvent.click(screen.getByText('Welcome back'))
})
```

### Runtime command

Run your installed runtime-native generate entrypoint with `./login-flow.js`.

### Terminal output

```
Parsed: login flow — 7 steps
[taro] Score: 82/100 (B) — query: 90, assertions: 75, structure: 80
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

After installation, each runtime gets a namespaced help entrypoint plus `init`, `refresh`, and `generate` entrypoints. Use `init` first, `refresh` for maintenance, and `generate` for Recorder-to-RTL output.

### Tips

- When Taro infers the owning render target, it writes the generated test next to that component using the same basename
- If you re-record a flow, Taro now compares the existing generated test against the new Recorder flow and only overwrites when coverage or quality improves
- If you record multiple flows, run Taro on each to build up package state in `.taro/state.json` — later runs benefit from earlier ones
- Commit `.taro/state.json` when you want learned package profiles to persist across teammates and CI
- Add `.taro/overrides.json` when you need to pin runner, render helper, or shared mock policy for a package

### Notes

- Taro does not require network access at generation time (DOM inspection via Playwright is optional and only runs when a live URL is in the recording)
- All state is local to `.taro/` — no external service is contacted
