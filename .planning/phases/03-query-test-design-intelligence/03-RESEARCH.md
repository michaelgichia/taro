# Phase 3: Query & Test Design Intelligence - Research

**Researched:** 2026-03-06
**Domain:** Babel AST parsing, Playwright DOM inspection, RTL query intelligence, codebase convention scanning
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Input Format (Architecture Pivot)**
- Input is a JS file exported by the Testing Library Recorder extension — NOT Chrome JSON
- The JS file contains already-resolved RTL queries (`screen.getByRole(...)`, `screen.getByText(...)`) mixed with `document.querySelector(...)` fallbacks
- Phase 1's JSON parser is no longer the primary pipeline — Phase 3 replaces it with a JS/AST parser
- Use Babel AST parsing (`@babel/parser`) to walk the JS file and identify:
  - `screen.getBy*()` calls → already good, keep
  - `document.querySelector(...)` calls → need resolution or flagging

**Query Priority (QRY-01)**
- Follow RTL recommended priority order: `getByRole → getByLabelText → getByText → getByPlaceholderText → getByTestId`
- Emit a query quality summary to console after generation
- Example format: `3 getByRole (excellent), 2 getByText (good), 1 getByTestId (fragile — see line 12)`

**Document.querySelector Resolution (QRY-02)**
- When `document.querySelector(cssSelector)` is found:
  1. Parse the `@jest-environment-options` URL from the JS file header
  2. Use Playwright to navigate to that URL and locate the element by CSS selector
  3. Extract: ARIA role + accessible name → generate `screen.getByRole(role, { name: '...' })`
- If URL not reachable, fall through to QRY-03 handling

**Accessibility Gap Handling (QRY-03)**
- If Playwright finds the element but it has no accessible role or name:
  - Replace with `screen.getByTestId('...')` (generated ID)
  - Emit: `[taro] QRY-03: No accessible query for #radix-... — consider adding aria-label or data-testid to this element`

**Test Concern Distribution (TEST-01)**
- Modal boundary rule: `click button('X')` → next step targets `heading('X')` → new `it()` block
- Each `it()` block is fully self-contained with its own `render()` + `userEvent.setup()`
- Steps before first modal boundary form the first `it()` block

**Helper Functions (TEST-02)**
- Phase 3 does NOT generate helper functions
- When scanning existing test files (CTX-02), flag helpers that contain `expect()` statements — log a warning only

**Meaningful Matchers (TEST-03)**
- Input with value → `toHaveValue('...')`
- Text content assertion → `toHaveTextContent('...')`
- Checkbox → `toBeChecked()`
- Visibility → `toBeVisible()`
- Presence (default fallback) → `toBeInTheDocument()`
- Infer from element's role/type extracted during Playwright inspection

**Context Scanning (CTX-01–04)**
- Scan on first run only — if `.taro/conventions.json` exists, use cached
- Developer can force refresh with `taro scan` command
- Scan: test files (`*.test.ts/tsx`, `*.spec.ts/tsx`), folder/naming conventions, shared mock files
- NOT package.json/tsconfig

**Convention Storage (CTX-05)**
- Store in `.taro/conventions.json`
- Format: JSON (machine-readable, fast to parse)
- Updated after each run with any new patterns observed

### Claude's Discretion
- Exact `.taro/conventions.json` schema
- How to handle Playwright timeout / app-not-running gracefully
- Whether to lint-fix the generated output automatically
- `taro scan` CLI command design (flags, output format)

### Deferred Ideas (OUT OF SCOPE)
- Helper function generation (extract repeated setup sequences into assertion-free helpers) — future phase
- `taro scan` as a standalone command — Phase 3 adds auto-scan; explicit `taro scan` command can come later
- Support for both JS and JSON input formats — Phase 3 is JS-only; JSON format support deferred
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QRY-01 | Classify queries for brittleness | RTL priority order confirmed: getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId; quality classification table defined |
| QRY-02 | Resolve ambiguous element targeting using DOM scoping | Playwright locator.evaluate() pattern confirmed for extracting role/aria-label/tagName from CSS selector |
| QRY-03 | Flag accessibility gaps when no clean resolution exists | Console warning pattern defined; fallback to getByTestId confirmed |
| TEST-01 | Distribute concerns across test cases | Modal boundary detection algorithm defined (button name matches subsequent heading name) |
| TEST-02 | Keep helpers assertion-free | Scanning pattern for existing test files; expect() detection via AST |
| TEST-03 | Enforce meaningful matchers | Matcher selection map defined based on element type and action |
| CTX-01 | Read codebase conventions before generation | glob + Babel AST scan pattern for test files |
| CTX-02 | Analyze existing test patterns | Import/describe/it/matcher pattern extraction via AST |
| CTX-03 | Detect folder structure and naming conventions | fs.glob for *.test.* and *.spec.* file locations |
| CTX-04 | Analyze shared mocks | Scan __mocks__/ dirs, vi.mock/jest.mock call detection via AST |
| CTX-05 | Update internal state after each run | .taro/conventions.json JSON file with mkdir -p pattern (reuse writer.ts approach) |
</phase_requirements>

---

## Summary

Phase 3 is fundamentally an **architecture pivot**: the existing JSON-based parser is replaced by a JS/AST parser that consumes Testing Library Recorder extension output. The phase has three distinct technical pillars that must work in concert:

**Pillar 1 — JS/AST Parsing.** The input is a JavaScript file (CommonJS `require()` syntax) with a docblock header containing the `@jest-environment-options` URL. `@babel/parser` (already installed) parses this file into an AST; `@babel/traverse` walks it to classify each call expression as either an existing RTL query (`screen.getBy*`) or a `document.querySelector` fallback needing resolution.

**Pillar 2 — Playwright DOM Inspection.** For each `document.querySelector` call found, Playwright launches headless Chromium, navigates to the URL extracted from the file header, and inspects the element at that CSS selector. `locator.evaluate()` extracts `tagName`, `role` attribute, `aria-label`, `aria-labelledby`, `innerText`, and `value`. This data drives the query upgrade decision (getByRole → getByLabelText → getByTestId) and the matcher selection (toHaveValue, toBeChecked, etc.). Playwright is not yet installed — it must be added as a dependency.

**Pillar 3 — Codebase Convention Scanning.** On first invocation, Taro scans the project for `*.test.ts/tsx` and `*.spec.ts/tsx` files using Node.js `glob`, then runs lightweight Babel AST parsing on each to extract import style, describe/it patterns, and mock conventions. Results are persisted to `.taro/conventions.json` and reused on subsequent runs.

**Primary recommendation:** Build a new `src/core/js-parser.ts` module for AST-based JS input, a `src/core/resolver.ts` for Playwright inspection, a `src/core/scanner.ts` for convention scanning, and extend `src/templates/test-template.ts` to support multiple `it()` blocks. The existing `NormalizedRecording` and `NormalizedStep` types remain valid internal representations.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @babel/parser | ^7.29.0 | Parse the JS recording file into AST | Already in project; industry standard JS/TS parser |
| @babel/traverse | ^7.29.0 | Walk the AST to find CallExpression nodes | Already in project; required companion to parser |
| @types/babel__traverse | ^7.20.0 | TypeScript types for traverse visitors | Already in project |

### New Dependencies Required
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright | ^1.50.x | Headless Chromium for DOM inspection | Locked decision; already in project's key decisions; Playwright is the de-facto browser automation library in the Node ecosystem |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.0.0 | Colored console warnings (QRY-03) | Already used in CLI commands |
| vitest | ^3.0.0 | Unit testing the new modules | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| playwright | puppeteer | Puppeteer is Chromium-only and less maintained; Playwright is already the locked decision |
| @babel/traverse | manual AST walk (recursive) | babel/traverse provides visitor pattern with path context; manual recursion is error-prone for complex ASTs |
| glob (node:fs) | fast-glob | Node.js 22 has native `fs.glob` (experimental); fast-glob adds no dep but is more reliable cross-version; either works |

**Installation (new dependency only):**
```bash
npm install playwright
npx playwright install chromium
```

---

## Architecture Patterns

### Recommended Project Structure Extension
```
src/
├── cli/
│   └── commands/
│       └── generate.ts      # Extend: add context scan step, JS input detection
├── core/
│   ├── parser.ts            # Existing: Chrome JSON parser (keep for backward compat)
│   ├── js-parser.ts         # NEW: Babel AST parser for Testing Library Recorder JS output
│   ├── resolver.ts          # NEW: Playwright-based document.querySelector resolver
│   ├── scanner.ts           # NEW: Codebase convention scanner
│   ├── generator.ts         # Extend: query quality summary, multiple it() blocks
│   ├── validator.ts         # Existing (unchanged)
│   └── writer.ts            # Existing (unchanged)
├── templates/
│   └── test-template.ts     # Extend: describeBlock() to accept multiple it() groups
├── types/
│   ├── recording.ts         # Extend: add query quality metadata, it-group concept
│   └── conventions.ts       # NEW: TypeScript types for conventions.json schema
└── index.ts
.taro/
└── conventions.json         # Runtime: persisted codebase conventions (created on first run)
```

### Pattern 1: Babel AST Visitor for CallExpression Classification

**What:** Walk the parsed AST and categorize each call expression as either an existing RTL query or a `document.querySelector` needing resolution.

**When to use:** The input JS file is read and parsed once; this single-pass visitor extracts all relevant calls.

**Example:**
```typescript
// Source: confirmed pattern from babel/babel AST spec + community examples
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import type { CallExpression } from '@babel/types'

interface ExtractedCall {
  type: 'rtl-query' | 'querySelector'
  queryMethod?: string  // 'getByRole', 'getByText', etc.
  selector?: string     // CSS selector for querySelector calls
  line: number
}

function extractCalls(code: string): ExtractedCall[] {
  const ast = parse(code, {
    sourceType: 'commonjs',
    plugins: [],
  })

  const calls: ExtractedCall[] = []

  traverse(ast, {
    CallExpression(path) {
      const node = path.node as CallExpression
      const callee = node.callee

      // Detect: screen.getByRole(...), screen.getByText(...), etc.
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'screen' &&
        callee.property.type === 'Identifier'
      ) {
        calls.push({
          type: 'rtl-query',
          queryMethod: callee.property.name,
          line: node.loc?.start.line ?? 0,
        })
        return
      }

      // Detect: document.querySelector('...')
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'document' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'querySelector'
      ) {
        const firstArg = node.arguments[0]
        const selector =
          firstArg?.type === 'StringLiteral' ? firstArg.value : undefined
        calls.push({
          type: 'querySelector',
          selector,
          line: node.loc?.start.line ?? 0,
        })
      }
    },
  })

  return calls
}
```

### Pattern 2: Header URL Extraction via Regex/AST Comment

**What:** Extract the `@jest-environment-options` JSON from the file's leading docblock comment.

**When to use:** Always — this URL is needed for Playwright navigation.

**Example:**
```typescript
// The Testing Library Recorder extension generates a header like:
// /**
//  * @jest-environment url
//  * @jest-environment-options { "url": "http://localhost:3000/sales" }
//  */
// Source: confirmed from testing-library/testing-library-recorder-extension README

function extractUrlFromHeader(code: string): string | undefined {
  const match = code.match(/@jest-environment-options\s+(\{[^}]+\})/)
  if (!match) return undefined
  try {
    const options = JSON.parse(match[1]) as { url?: string }
    return options.url
  } catch {
    return undefined
  }
}
```

### Pattern 3: Playwright Element Inspection

**What:** Given a CSS selector and a URL, launch headless Chromium, navigate, and extract the element's accessibility properties.

**When to use:** For every `document.querySelector` call found in the input JS.

**Example:**
```typescript
// Source: playwright.dev/docs/library + playwright.dev/docs/evaluating
import { chromium } from 'playwright'

interface ElementInfo {
  tagName: string
  role: string | null        // explicit role="" attribute
  ariaLabel: string | null   // aria-label attribute
  ariaLabelledBy: string | null
  innerText: string
  value: string | undefined  // for input elements
  type: string | undefined   // for input[type]
  placeholder: string | null
  isPresent: boolean
}

async function inspectElement(
  url: string,
  cssSelector: string,
  timeoutMs = 5000
): Promise<ElementInfo | null> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' })

    const locator = page.locator(cssSelector).first()
    const info = await locator.evaluate((el: HTMLElement) => ({
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaLabelledBy: el.getAttribute('aria-labelledby'),
      innerText: el.innerText?.trim() ?? '',
      value: (el as HTMLInputElement).value,
      type: (el as HTMLInputElement).type,
      placeholder: el.getAttribute('placeholder'),
      isPresent: true,
    }))
    return info
  } catch {
    // URL not reachable or element not found — caller falls through to QRY-03
    return null
  } finally {
    await browser.close()
  }
}
```

### Pattern 4: Query Upgrade Decision Tree

**What:** Given `ElementInfo`, select the highest-priority RTL query.

**When to use:** After successful Playwright inspection.

**Example:**
```typescript
// Source: testing-library.com/docs/queries/about — verified priority order
type QueryResult = {
  query: string        // e.g., `screen.getByRole('button', { name: 'Save' })`
  quality: 'excellent' | 'good' | 'acceptable' | 'fragile'
  method: string       // e.g., 'getByRole'
}

function buildQuery(info: ElementInfo, selector: string): QueryResult {
  const roleMap: Record<string, string> = {
    button: 'button', a: 'link', input: 'textbox',
    select: 'combobox', textarea: 'textbox', h1: 'heading',
    h2: 'heading', h3: 'heading', img: 'img',
  }
  const impliedRole = info.role ?? roleMap[info.tagName]

  // Priority 1: getByRole (if element has accessible role + name)
  const accessibleName = info.ariaLabel ?? info.innerText
  if (impliedRole && accessibleName) {
    return {
      query: `screen.getByRole('${impliedRole}', { name: '${accessibleName}' })`,
      quality: 'excellent',
      method: 'getByRole',
    }
  }

  // Priority 2: getByLabelText (for form fields with label)
  if (info.ariaLabel) {
    return {
      query: `screen.getByLabelText('${info.ariaLabel}')`,
      quality: 'excellent',
      method: 'getByLabelText',
    }
  }

  // Priority 3: getByText (non-interactive with text content)
  if (info.innerText) {
    return {
      query: `screen.getByText('${info.innerText}')`,
      quality: 'good',
      method: 'getByText',
    }
  }

  // Priority 4: getByPlaceholderText
  if (info.placeholder) {
    return {
      query: `screen.getByPlaceholderText('${info.placeholder}')`,
      quality: 'acceptable',
      method: 'getByPlaceholderText',
    }
  }

  // Priority 5: getByTestId (fragile — emit QRY-03 warning)
  const generatedId = selector.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  return {
    query: `screen.getByTestId('${generatedId}')`,
    quality: 'fragile',
    method: 'getByTestId',
  }
}
```

### Pattern 5: Modal Boundary Detection for TEST-01

**What:** Segment the flat list of normalized steps into groups, each group becoming one `it()` block.

**When to use:** After normalizing all steps; before code generation.

**Example:**
```typescript
// Source: derived from CONTEXT.md boundary rule + existing NormalizedStep types
interface ItGroup {
  name: string
  steps: NormalizedStep[]
}

function segmentIntoItGroups(steps: NormalizedStep[]): ItGroup[] {
  const groups: ItGroup[] = []
  let current: NormalizedStep[] = []
  let groupName = 'initial flow'

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const next = steps[i + 1]

    current.push(step)

    // Boundary: click on a button, and the very next step targets a heading with the same/similar name
    if (
      step.action === 'click' &&
      next?.action === 'assert' &&
      next?.target?.toLowerCase().includes(step.target?.toLowerCase() ?? '')
    ) {
      groups.push({ name: groupName, steps: current })
      current = []
      groupName = step.target ?? `modal ${groups.length + 1}`
    }
  }

  if (current.length > 0) {
    groups.push({ name: groupName, steps: current })
  }

  return groups.length > 0 ? groups : [{ name: 'recorded flow', steps }]
}
```

### Pattern 6: Convention File Scanning (CTX-01–04)

**What:** Walk the project for test files, extract conventions via Babel AST, persist to `.taro/conventions.json`.

**When to use:** On first run (or `--force-scan`); skip if conventions.json exists.

**Example:**
```typescript
// Source: Node.js fs/promises docs + confirmed babel/traverse pattern
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

async function findTestFiles(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(full)
    }
  }
  await walk(root)
  return results
}

// For each file, parse with Babel and check:
// - Import style: 'import { render } from ...' (ESM) vs require() (CJS)
// - Describe/it nesting depth
// - Mock pattern: vi.mock vs jest.mock
// - Whether any helpers contain expect() calls (TEST-02 warning)
```

### Pattern 7: Matcher Selection (TEST-03)

**What:** Choose a specific matcher based on element type and action context.

**When to use:** When generating `expect()` statements in any `it()` block.

```typescript
// Source: derived from @testing-library/jest-dom matchers documentation
function selectMatcher(info: ElementInfo, action: string): string {
  const inputRole = info.type ?? info.tagName
  if (inputRole === 'checkbox') return '.toBeChecked()'
  if (info.value !== undefined && action === 'fill') return `.toHaveValue('${info.value}')`
  if (action === 'assert' && info.innerText) return `.toHaveTextContent('${info.innerText}')`
  if (action === 'assert' && info.role === 'dialog') return '.toBeVisible()'
  return '.toBeInTheDocument()'  // safe default
}
```

### Anti-Patterns to Avoid

- **Keeping `document.querySelector` calls verbatim in output:** These are Radix UI-generated IDs (`#radix-_r_8s_-content-items`) that will change — always attempt resolution or replace with getByTestId.
- **One massive `it()` block for multi-step flows:** Fails fast and hard to debug; distribute by modal boundary.
- **Re-launching Playwright per element:** Launch once per file, inspect all querySelector calls in one browser session.
- **Scanning node_modules during convention scanning:** Exclude `node_modules`, `dist`, `.git` directories explicitly.
- **Re-scanning on every run:** Check for `.taro/conventions.json` first; skip if present (CTX-05 caching).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JavaScript parsing | Custom regex-based parser | `@babel/parser` + `@babel/traverse` | Regex breaks on nested calls, multiline, comments |
| Browser DOM inspection | Puppeteer/Selenium | `playwright` (chromium) | Already in locked decisions; modern API |
| ARIA role inference | Manual HTML tag lookup table | Playwright's accessibility tree via locator.evaluate() | Browser knows the computed role; static maps miss aria-role overrides |
| Directory walking | Manual recursive readdir | Node.js `readdir` with `withFileTypes: true` (no extra dep) | No need for external `glob` package in Node 22 |
| JSON schema for conventions | Loose object | TypeScript interface + `JSON.stringify` | Type safety for what gets read/written |

**Key insight:** The browser's accessibility engine handles ARIA role inheritance, implicit roles, and aria-labelledby resolution better than any static lookup table. Always prefer live Playwright inspection over heuristics.

---

## Common Pitfalls

### Pitfall 1: Radix UI / Dynamic IDs in CSS Selectors
**What goes wrong:** The Testing Library Recorder extension falls back to `document.querySelector('#radix-_r_8s_-content-items')` for Radix UI components. These IDs are generated at runtime and change on every render.
**Why it happens:** Radix UI does not use stable DOM IDs by default; the extension has no fallback and emits the raw querySelector.
**How to avoid:** Always resolve these via Playwright → getByRole, or fall back to getByTestId with a QRY-03 warning. Never keep the raw generated ID in the output.
**Warning signs:** Selectors matching the pattern `#radix-_r_`, `#:r`, or other pseudo-random strings.

### Pitfall 2: Playwright Timeout When App Is Not Running
**What goes wrong:** `page.goto()` throws `TimeoutError` if the dev server is not running at the URL in the file header.
**Why it happens:** URL is extracted from `@jest-environment-options` which assumes the app is running locally.
**How to avoid:** Wrap the entire `inspectElement()` in try/catch with a 5-second `timeout`; return `null` on any error; fall through to QRY-03 handling with a clear error message: `[taro] QRY-02: App not reachable at http://... — run your dev server and retry, or accept getByTestId fallback`.
**Warning signs:** Unhandled promise rejection during browser inspection step.

### Pitfall 3: Multiple Playwright Browser Instances
**What goes wrong:** Launching a new `chromium.launch()` per `document.querySelector` call creates N browser processes for N fallback selectors.
**Why it happens:** Naive implementation wraps each call independently.
**How to avoid:** Launch browser once per input file, create one page, reuse it for all querySelector resolutions, close after all are done.
**Warning signs:** Slow generation time proportional to number of querySelector calls.

### Pitfall 4: Modal Boundary False Positives
**What goes wrong:** Unrelated button+heading pairs trigger a modal boundary split, fragmenting a single logical flow into unnecessary test blocks.
**Why it happens:** The boundary rule "click button + heading with same name" can match navigation patterns (e.g., "About" button → "About" page heading).
**How to avoid:** Apply stricter matching — the heading must appear within 1-2 steps of the click, and the click must be on a role=button element (not a link). Also check that the heading appears _in the same render cycle_ (no navigate step between them).
**Warning signs:** Output has many tiny 1-2 step `it()` blocks.

### Pitfall 5: Convention Scan Missing Test Files
**What goes wrong:** Convention scanner misses test files in nested `__tests__/` directories or finds none because the project uses an unusual naming convention.
**Why it happens:** Glob pattern too narrow; or project hasn't been set up yet.
**How to avoid:** Scan for both `*.test.*` and `*.spec.*` at any depth; if zero files found, log `[taro] CTX: No test files found — conventions will use defaults` and proceed with a sensible default conventions object.
**Warning signs:** `.taro/conventions.json` contains empty arrays for all fields.

### Pitfall 6: `@babel/traverse` Default Import Issue
**What goes wrong:** `import traverse from '@babel/traverse'` fails at runtime in ESM with "traverse is not a function".
**Why it happens:** @babel/traverse ships CJS with a `.default` export; ESM interop varies.
**How to avoid:** Use `import _traverse from '@babel/traverse'; const traverse = (_traverse as any).default ?? _traverse` — this is the known workaround for this package in ESM contexts.
**Warning signs:** TypeError: traverse is not a function.

---

## Code Examples

### Parsing the Testing Library Recorder JS Header
```typescript
// Source: confirmed from testing-library/testing-library-recorder-extension README
// The extension writes this exact docblock format:
// /**
//  * @jest-environment url
//  * @jest-environment-options { "url": "http://localhost:3000/path" }
//  */
// const {screen, waitFor} = require('@testing-library/dom')
// ...

function extractEnvironmentUrl(fileContent: string): string | undefined {
  const match = fileContent.match(/@jest-environment-options\s*(\{[^}]+\})/)
  if (!match?.[1]) return undefined
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    return typeof parsed.url === 'string' ? parsed.url : undefined
  } catch {
    return undefined
  }
}
```

### Multiple It-Block Template
```typescript
// Extends existing describeBlock() in src/templates/test-template.ts
// Source: pattern derived from existing codebase structure

interface ItBlock {
  name: string
  stepLines: string[]
  hasUserEvents: boolean
}

export function describeBlockMultiIt(name: string, itBlocks: ItBlock[]): string {
  const escapedName = escapeSingleQuote(name)
  const blocks = itBlocks.map((block) => {
    const setup = block.hasUserEvents ? `    const user = userEvent.setup()\n` : ''
    const indented = indentLines(block.stepLines.join('\n'), 4)
    return [
      `  it('${escapeSingleQuote(block.name)}', async () => {`,
      `${setup}`,
      indented,
      `  })`,
    ].join('\n')
  })

  return [`describe('${escapedName}', () => {`, ...blocks, `})`].join('\n')
}
```

### Query Quality Summary Emission
```typescript
// Source: derived from CONTEXT.md QRY-01 spec
interface QuerySummary {
  method: string
  quality: 'excellent' | 'good' | 'acceptable' | 'fragile'
  count: number
  lines: number[]
}

function emitQuerySummary(summaries: QuerySummary[]): void {
  const qualityLabel = {
    excellent: 'excellent',
    good: 'good',
    acceptable: 'acceptable',
    fragile: 'fragile',
  }
  for (const s of summaries) {
    const lineInfo = s.quality === 'fragile' ? ` — see line${s.lines.length > 1 ? 's' : ''} ${s.lines.join(', ')}` : ''
    console.log(
      pc.dim(`[taro]`) +
        ` ${s.count} ${s.method} (${qualityLabel[s.quality]}${lineInfo})`
    )
  }
}
```

### @babel/traverse ESM Interop Workaround
```typescript
// Source: known issue with @babel/traverse in ESM projects
// This project uses "type": "module" and moduleResolution: "bundler"
import _traverse from '@babel/traverse'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse as any).default ?? _traverse
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chrome JSON export parsing | Testing Library Recorder JS file parsing | Phase 3 pivot (locked) | Parser must handle JS AST, not JSON |
| Single `it()` block for entire flow | Multiple `it()` blocks by modal boundary | Phase 3 | Template must support it-group arrays |
| CSS selector → heuristic query conversion | CSS selector → live Playwright inspection → RTL query | Phase 3 | Much higher query quality; requires running app |
| All queries generic `toBeInTheDocument()` | Context-driven matchers based on element type | Phase 3 | Tests assert meaningful state |
| No convention awareness | `.taro/conventions.json` caching | Phase 3 | Generation respects project patterns |

**Deprecated/outdated approaches for this phase:**
- `selectorToQuery()` in `generator.ts`: This static heuristic-based function is superseded by the Playwright resolver for `document.querySelector` calls. RTL queries already in the JS input are kept as-is.
- Single-block `describeBlock()` template: Must be extended to accept multiple named `it()` groups.

---

## Open Questions

1. **`@babel/traverse` ESM interop in the current project setup**
   - What we know: This project uses `"type": "module"` + `moduleResolution: "bundler"`; @babel/traverse is a CJS package; similar issues are well-documented
   - What's unclear: Whether the installed version (^7.29.0) resolves `.default` cleanly
   - Recommendation: Use the `(_traverse as any).default ?? _traverse` guard; write a unit test that calls traverse and fails early if broken

2. **Playwright installation (browser binaries)**
   - What we know: `playwright` package is not installed; `npx playwright install chromium` downloads ~120MB browser binary
   - What's unclear: Whether the binary download is acceptable in the project's CI/CD context
   - Recommendation: Add `playwright` as a dependency; document the `npx playwright install chromium` step; consider making DOM inspection optional (skip if playwright binary not available, proceed with QRY-03 fallback)

3. **Recording title as describe() name**
   - What we know: The title format from the extension is `Recording-Add-Sale-KE-06/03/2026 at 08:25:15` — slashes in the name could cause issues
   - What's unclear: Whether to sanitize the title for the describe block or use it verbatim
   - Recommendation: Sanitize: strip the date suffix (` at HH:MM:SS`), replace hyphens with spaces → `Recording Add Sale KE`

4. **Import style detection for output (CTX-01)**
   - What we know: The input JS file uses `require()` CJS style; the project's generated output should match the scanned convention
   - What's unclear: When no test files are found in the project (cold start), default to ESM `import` style
   - Recommendation: Default to ESM; override if convention scan finds majority CJS pattern

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | none (vitest reads from package.json "test" script) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QRY-01 | Query classification returns correct quality tier for each method name | unit | `npm run test:run -- src/core/js-parser.test.ts` | ❌ Wave 0 |
| QRY-02 | `inspectElement()` returns ElementInfo with role+name for a real element | unit (mock Playwright) | `npm run test:run -- src/core/resolver.test.ts` | ❌ Wave 0 |
| QRY-03 | Returns getByTestId + emits warning when no role/name found | unit | `npm run test:run -- src/core/resolver.test.ts` | ❌ Wave 0 |
| TEST-01 | `segmentIntoItGroups()` splits at modal boundary correctly | unit | `npm run test:run -- src/core/js-parser.test.ts` | ❌ Wave 0 |
| TEST-02 | Scanner flags helpers with expect() in existing test files | unit | `npm run test:run -- src/core/scanner.test.ts` | ❌ Wave 0 |
| TEST-03 | Matcher selection returns correct matcher for checkbox/input/text | unit | `npm run test:run -- src/core/resolver.test.ts` | ❌ Wave 0 |
| CTX-01–04 | Scanner reads test files and extracts import style, mock patterns | unit | `npm run test:run -- src/core/scanner.test.ts` | ❌ Wave 0 |
| CTX-05 | Conventions saved to `.taro/conventions.json`, read on subsequent runs | integration | `npm run test:run -- src/core/scanner.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/core/js-parser.test.ts` — covers QRY-01, TEST-01 (parse JS file, classify calls, segment groups)
- [ ] `src/core/resolver.test.ts` — covers QRY-02, QRY-03, TEST-03 (Playwright inspection mocked with vi.mock)
- [ ] `src/core/scanner.test.ts` — covers CTX-01–CTX-05, TEST-02 (file scanning, convention extraction, JSON persistence)
- [ ] Framework config: none needed — vitest 3.x uses package.json scripts already configured

---

## Sources

### Primary (HIGH confidence)
- `@babel/parser` official docs (babeljs.io/docs/babel-parser) — sourceType options, plugin list
- `playwright.dev/docs/library` — headless launch, page.goto, locator.evaluate() pattern
- `playwright.dev/docs/evaluating` — page.evaluate() DOM property extraction
- `testing-library.com/docs/queries/about/` — RTL query priority order (getByRole → getByTestId)
- `github.com/testing-library/testing-library-recorder-extension` — JS output format, `@jest-environment-options` header

### Secondary (MEDIUM confidence)
- WebSearch "babel traverse CallExpression callee.object.name screen" — confirmed MemberExpression visitor pattern
- WebSearch "playwright accessibility snapshot ariaSnapshot" — confirmed `locator.ariaSnapshot()` exists but is more suited for snapshot testing, not property extraction
- WebSearch "testing-library-recorder-extension jest-environment-options URL header" — confirmed docblock header format

### Tertiary (LOW confidence)
- Modal boundary detection algorithm — derived from CONTEXT.md spec; no external source; treat as hypothesis until tested

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — @babel/parser and @babel/traverse already installed; playwright is the locked project decision; npm package existence confirmed
- Architecture: HIGH — patterns derived from existing codebase conventions + confirmed library APIs
- Playwright inspection pattern: HIGH — locator.evaluate() confirmed in official docs; element property extraction pattern verified
- Modal boundary algorithm: LOW — novel algorithm derived from spec; no community precedent found; needs empirical testing
- Convention scanning: MEDIUM — Node.js readdir pattern is standard; Babel AST extraction for import style is confirmed pattern; exact schema fields are discretionary

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (Babel and Playwright APIs are stable; RTL priority order is stable)
