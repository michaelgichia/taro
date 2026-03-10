# Tayo

Install Tayo into Claude Code, OpenCode, Gemini CLI, or Codex, then generate React Testing Library tests from Testing Library Recorder recordings.

Tayo ships as an installer-first package. The package entrypoint bootstraps runtime-native commands or skills into your agent environment, and the generated runtime surface still routes back to `tayo generate` when you want Recorder-to-RTL output.

## Getting Started

```bash
npx @tayo-dev/rtl@latest
```

The installer prompts you to choose:

1. **Runtime** — Claude Code, OpenCode, Gemini CLI, Codex, or all
2. **Location** — Global (all projects) or local (current project only)

Verify the install with the runtime-native help command:

- Claude Code: `/@tayo-dev/rtl:help`
- Gemini CLI: `/@tayo-dev/rtl:help`
- OpenCode: `/@tayo-dev/rtl-help`
- Codex: `$@tayo-dev/rtl-help`

> [!NOTE]
> Codex installation uses skills under `skills/@tayo-dev/rtl-*/SKILL.md`, not prompt files.

## Staying Updated

Re-run the installer package to refresh owned assets and repair missing ones:

```bash
npx @tayo-dev/rtl@latest
```

Tayo refreshes unchanged owned files automatically, restores missing owned files, and protects manual edits instead of overwriting them silently.

## Non-interactive Install

Use runtime flags plus exactly one location flag to skip prompts:

```bash
# Claude Code
npx @tayo-dev/rtl@latest --claude --global
npx @tayo-dev/rtl@latest --claude --local

# OpenCode
npx @tayo-dev/rtl@latest --opencode --global
npx @tayo-dev/rtl@latest --opencode --local

# Gemini CLI
npx @tayo-dev/rtl@latest --gemini --global
npx @tayo-dev/rtl@latest --gemini --local

# Codex
npx @tayo-dev/rtl@latest --codex --global
npx @tayo-dev/rtl@latest --codex --local

# All runtimes
npx @tayo-dev/rtl@latest --all --global
npx @tayo-dev/rtl@latest --all --local
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

# Exercise the installer from the built package entrypoint
node dist/index.js --all --local

# Or verify the publish boundary with a tarball
env NPM_CONFIG_CACHE=/tmp/tayo-npm-cache npm pack --pack-destination /tmp/tayo-pack
npx /tmp/tayo-pack/tayo-dev-rtl-1.0.0.tgz --codex --local
```

The tarball flow is the closest match to what end users get from npm.

## Generate RTL Tests

After installation, use `tayo generate` directly or call the runtime-native installed command/skill that routes to it.

### Prerequisites

- Node.js 18 or later
- A React project using `@testing-library/react`
- Chrome DevTools Recorder with the Testing Library Recorder extension installed

### Record a user flow

Open Chrome DevTools → Recorder panel → click "Start new recording" → perform your user flow → click "End recording".

Tayo supports two export paths:

- Testing Library Recorder JS baseline export: save as `recording.js`
- Chrome Recorder JSON export: save as `recording.json`

### Generate the test

```bash
# JS baseline path
tayo generate ./recording.js

# Supported JSON path
tayo generate ./recording.json
```

Expected output:

```text
Parsed: my user flow — 8 steps
[tayo] Score: 78/100 (B) — query: 80, assertions: 70, structure: 85
Created: src/components/MyComponent.test.tsx
[tayo] ✓ post-write verified
```

On subsequent runs in the same project, Tayo reads `.tayo/conventions.json` to match your test style automatically.

### Draft-quality output is explicit

When Tayo cannot prove the final render/query boundary yet, it keeps the output writable but marks it as draft-quality instead of pretending the gaps are solved.

```text
[tayo] Score: 77/100 (C) — query: 100, assertions: 30, structure: 70, boundary: 100
[tayo] Manual review required — this generated test is still a draft (77/100, C).
[tayo] Top blockers: The generated test still renders <App /> instead of a resolved repo target. | Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.
// tayo-query-checkpoint: click step requires manual RTL query recovery
```

That draft banner is advisory. Tayo does not block writes, but it does tell you when import targets, placeholder queries, or unresolved boundaries still need cleanup.

## CLI Reference

### `tayo generate <file>`

Generates a React Testing Library test from a Testing Library Recorder JS export or a Chrome Recorder JSON export.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<file>` | Path to the recording file. Accepts Testing Library Recorder JS files (`.js`) and Chrome Recorder JSON files (`.json`). |

**Options:**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output <path>` | `-o` | Same directory as input, `{name}.test.tsx` | Override the output file path for the generated test. |
| `--dry-run` | `-d` | `false` | Print the generated test to stdout and show the score without writing to disk. Useful for previewing output before committing. |
| `--force` | `-f` | `false` | Overwrite an existing test file. Without this flag, Tayo exits with an error if the output file already exists. |
| `--version` | `-v` | — | Print the installed version and exit. |
| `--help` | `-h` | — | Display command help and exit. |

**Examples:**

```bash
# Generate and write a test next to the recording
tayo generate ./recordings/checkout-flow.js

# Preview without writing (dry run)
tayo generate --dry-run ./recordings/checkout-flow.js

# Write to a specific path
tayo generate --output src/__tests__/checkout.test.tsx ./recordings/checkout-flow.js

# Overwrite an existing test
tayo generate --force ./recordings/checkout-flow.js
```

**Output file naming:**
If `--output` is not provided, Tayo derives the output path from the input file: `{input-dir}/{input-basename}.test.tsx`. For example, `./recordings/login.js` → `./recordings/login.test.tsx`.

**Supported input formats:**
- Testing Library Recorder JS (`.js`) — primary v1.3 path; Tayo treats this as a baseline artifact to parse, enrich, and transform into a project-shaped RTL test
- Chrome Recorder JSON (`.json`) — supported parity path; Tayo preserves the existing JSON generate flow while JS fidelity improves

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

### Command

```bash
tayo generate ./login-flow.js
```

### Terminal output

```
Parsed: login flow — 7 steps
[tayo] Score: 82/100 (B) — query: 90, assertions: 75, structure: 80
Created: login-flow.test.tsx
[tayo] ✓ post-write verified
```

### Output: Generated test (`login-flow.test.tsx`)

Tayo generates a convention-aware RTL test with accessible queries:

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

### What Tayo did here

- Parsed the navigate step and inferred the component under test
- Upgraded CSS selectors (`#email`, `#password`) to accessible `getByRole` queries using aria attributes from the recording
- Inferred `userEvent.type()` from change steps and `userEvent.click()` from click steps
- Mapped the `waitForElement` step to a `toBeInTheDocument()` assertion
- Scored the output (82/100) and emitted no blocking errors

> **Note:** The component import path (`../LoginPage`) is a placeholder. Tayo generates a comment in the file indicating where to update it.

### JSON is also supported

If you export Chrome Recorder JSON instead, the command surface stays the same:

```bash
tayo generate ./login-flow.json --dry-run
```

JSON generation is still supported, but it does not inherit the repo-aware JS recovery stack. When the generated preview contains placeholder queries or weak assertions, Tayo keeps those gaps explicit with score and manual-review messaging instead of fabricating stronger evidence.

## Agent Usage

After installation, each runtime gets a namespaced help entrypoint plus a generate command or skill that routes back to `tayo generate`.

### Tips

- Use `--dry-run` first to preview output before committing generated files
- If you record multiple flows, run Tayo on each to build up convention state in `.tayo/conventions.json` — later runs benefit from earlier ones
- Pass `--force` when re-recording an updated flow to overwrite the old test
- The `.tayo/` directory should be committed to your repo so convention learning persists across team members

### Notes

- Tayo does not require network access at generation time (DOM inspection via Playwright is optional and only runs when a live URL is in the recording)
- All state is local to `.tayo/` — no external service is contacted
