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
npm install --save-dev @tayo/rtl
# or use npx to skip install entirely
npx @tayo/rtl generate ./my-recording.js
```

### Step 2 — Record a user flow

Open Chrome DevTools → Recorder panel → click "Start new recording" → perform your user flow (clicks, form fills, navigation) → click "End recording". Then either:

- Export as JSON: click the export button → "JSON" → save as `recording.json`
- Export via Testing Library Recorder extension: install the extension, click its export button, save as `recording.js`

### Step 3 — Generate the test

```bash
# Local install
npx taro generate ./recording.js

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
