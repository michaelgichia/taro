# Taro

Generate React Testing Library tests from Chrome Recorder recordings — automatically.

## Introduction

Taro is a CLI tool that reads Chrome DevTools Recorder exports (JSON) and Testing Library Recorder JS files and generates RTL test files. It scores its own output, learns your project's test conventions from existing files, and stores per-project state in a local `.taro/` directory. No server, no cloud — just files.

### Who it is for

- React developers who write tests with `@testing-library/react`
- Developers who use Chrome DevTools Recorder to capture user flows
- Teams that want test coverage without spending hours writing boilerplate

### The problem it solves

Recording a user flow in Chrome takes 30 seconds. Translating that recording into a well-structured RTL test takes 20–40 minutes and requires knowing which queries to use, how to assert, and how to match your project's test conventions. Taro closes that gap.

### How it works

1. Record a user flow in Chrome DevTools → Recorder panel.
2. Export via the Testing Library Recorder extension (`.js`) or as native Chrome Recorder JSON (`.json`).
3. Run `taro generate ./recording.js`.
4. Taro writes a `.test.tsx` file next to your recording, scored and convention-aware.

## Quick Start

### Prerequisites

- Node.js 18 or later
- A React project using `@testing-library/react`
- Chrome DevTools Recorder (built into Chrome — no extension needed for JSON exports)

### Step 1 — Install

```bash
npm install --save-dev @tayo-dev/rtl
# or use npx to skip install entirely
npx @tayo-dev/rtl generate ./my-recording.js
```

### Step 2 — Record a user flow

Open Chrome DevTools → Recorder panel → click "Start new recording" → perform your user flow (clicks, form fills, navigation) → click "End recording". Then either:

- Export as JSON: click the export button → "JSON" → save as `recording.json`
- Export via Testing Library Recorder extension: install the extension, click its export button, save as `recording.js`

### Step 3 — Generate the test

```bash
# Using npx (no install required)
npx @tayo-dev/rtl generate ./recording.js

# Or if installed globally
taro generate ./recording.js
```

Expected output:

```
Parsed: my user flow — 8 steps
[taro] Score: 78/100 (B) — query: 80, assertions: 70, structure: 85
Created: src/components/MyComponent.test.tsx
[taro] ✓ post-write verified
```

### What happens next

Taro writes a `.test.tsx` file. On subsequent runs in the same project, it reads `.taro/conventions.json` to match your test style (import style, mock pattern, folder structure) automatically.

## CLI Reference

### `taro generate <file>`

Generates a React Testing Library test from a Chrome Recorder export.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<file>` | Path to the recording file. Accepts Chrome Recorder JSON exports (`.json`) or Testing Library Recorder JS files (`.js`). |

**Options:**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output <path>` | `-o` | Same directory as input, `{name}.test.tsx` | Override the output file path for the generated test. |
| `--dry-run` | `-d` | `false` | Print the generated test to stdout and show the score without writing to disk. Useful for previewing output before committing. |
| `--force` | `-f` | `false` | Overwrite an existing test file. Without this flag, Taro exits with an error if the output file already exists. |
| `--version` | `-v` | — | Print the installed version and exit. |
| `--help` | `-h` | — | Display command help and exit. |

**Examples:**

```bash
# Generate and write a test next to the recording
taro generate ./recordings/checkout-flow.json

# Preview without writing (dry run)
taro generate --dry-run ./recordings/checkout-flow.json

# Write to a specific path
taro generate --output src/__tests__/checkout.test.tsx ./recordings/checkout-flow.json

# Overwrite an existing test
taro generate --force ./recordings/checkout-flow.json
```

**Output file naming:**
If `--output` is not provided, Taro derives the output path from the input file: `{input-dir}/{input-basename}.test.tsx`. For example, `./recordings/login.json` → `./recordings/login.test.tsx`.

**Supported input formats:**
- Chrome Recorder JSON (`.json`) — exported directly from Chrome DevTools Recorder
- Testing Library Recorder JS (`.js`) — exported via the Testing Library Recorder Chrome extension; detected by `.js` extension or `@jest-environment-options` header

## Worked Example

### Input: Chrome Recorder export (`login-flow.json`)

Here is a typical Chrome Recorder JSON export capturing a login flow.

```json
{
  "title": "login flow",
  "steps": [
    { "type": "navigate", "url": "http://localhost:3000/login" },
    { "type": "click", "selectors": [["aria/Email address"]] },
    { "type": "change", "value": "user@example.com", "selectors": [["#email"]] },
    { "type": "click", "selectors": [["aria/Password"]] },
    { "type": "change", "value": "secret123", "selectors": [["#password"]] },
    { "type": "click", "selectors": [["aria/Sign in[role=\"button\"]"]] },
    { "type": "waitForElement", "selectors": [["aria/Welcome back"]] }
  ]
}
```

### Command

```bash
taro generate ./login-flow.json
```

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

## Using Taro as a Claude Code Skill

### Overview

Taro works naturally as a Claude Code skill. You can instruct Claude to run `taro generate` on a recording file and it will generate the test, report the score, and surface any quality hints — all in a single agent turn.

### Option A: Direct invocation (no setup required)

Claude Code can invoke Taro directly using the Bash tool. No skill configuration is needed — Claude calls npx inline. Simply give Claude a prompt like:

```
Run: npx @tayo-dev/rtl generate ./recordings/checkout-flow.js
Then report the score and the path of the generated file.
```

### Option B: Register as a Claude Code skill

Registering Taro as a skill lets Claude invoke it by name without knowing the full command.

**Step 1** — Create the skill file at `.claude/skills/taro/SKILL.md` in your project:

```markdown
# Taro — RTL Test Generator

## Purpose
Generate a React Testing Library test from a Chrome Recorder export.

## Invocation
Run: taro generate <recording-file>

## Flags
- `--dry-run` (-d): Preview the generated test without writing to disk
- `--output <path>` (-o): Override the output file path
- `--force` (-f): Overwrite an existing test file

## Output
Writes `{recording-name}.test.tsx` next to the recording file.
Reports score (0-100) and any quality hints.
```

**Step 2** — Ensure Taro is installed in the project:

```bash
npm install --save-dev @tayo-dev/rtl
```

**Step 3** — Ask Claude to use the skill:

```
Use the taro skill to generate a test from ./recordings/login-flow.js
```

### Tips for agent use

- Use `--dry-run` first to preview output before committing generated files
- If you record multiple flows, run Taro on each to build up convention state in `.taro/conventions.json` — later runs benefit from earlier ones
- Pass `--force` when re-recording an updated flow to overwrite the old test
- The `.taro/` directory should be committed to your repo so convention learning persists across team members

### Notes

- Taro does not require network access at generation time (DOM inspection via Playwright is optional and only runs when a live URL is in the recording)
- All state is local to `.taro/` — no external service is contacted
