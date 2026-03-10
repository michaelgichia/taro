# Phase 3: Query & Test Design Intelligence - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the Testing Library Recorder extension JS output into production-quality RTL tests by:
1. Parsing the JS file (AST-based), not JSON
2. Resolving `document.querySelector` fallbacks into proper RTL queries via live DOM inspection
3. Distributing steps into multiple `it()` blocks by modal/dialog boundaries
4. Enforcing context-aware matchers and scanning codebase conventions

Creating posts, recording interactions, or running tests are out of scope. This phase reads JS exports and writes improved test files.

</domain>

<decisions>
## Implementation Decisions

### Input Format (Architecture Pivot)
- Input is a **JS file** exported by the Testing Library Recorder extension — NOT Chrome JSON
- The JS file contains already-resolved RTL queries (`screen.getByRole(...)`, `screen.getByText(...)`) mixed with `document.querySelector(...)` fallbacks where the extension gave up
- Phase 1's JSON parser is no longer the primary pipeline — Phase 3 replaces it with a JS/AST parser
- Use **Babel AST parsing** (`@babel/parser`) to walk the JS file and identify:
  - `screen.getBy*()` calls → already good, keep
  - `document.querySelector(...)` calls → need resolution or flagging

### Query Priority (QRY-01)
- Follow RTL recommended priority order: `getByRole → getByLabelText → getByText → getByPlaceholderText → getByTestId`
- This is the target output standard — every generated query should aim for the highest applicable level
- After generation: emit a query quality summary to console (e.g., `3 getByRole (excellent), 2 getByText (good), 1 getByTestId (fragile — see line 12)`)

### Document.querySelector Resolution (QRY-02)
- When a `document.querySelector(cssSelector)` is found:
  1. Parse the `@jest-environment-options` URL from the JS file header
  2. Use **Playwright** to navigate to that URL and locate the element by the CSS selector
  3. Extract: ARIA role + accessible name → generate `screen.getByRole(role, { name: '...' })`
- Playwright inspection requires the app to be running at the URL — if not reachable, fall through to QRY-03 handling

### Accessibility Gap Handling (QRY-03)
- If Playwright finds the element but it has **no accessible role or name** (truly inaccessible):
  - Replace `document.querySelector(...)` with `screen.getByTestId('...')` (generated ID)
  - Emit a console warning: `[tayo] QRY-03: No accessible query for #radix-... — consider adding aria-label or data-testid to this element`
- Warning level: element-specific + actionable suggestion (not just a count, not full HTML dump)

### Test Concern Distribution (TEST-01)
- Boundary detection rule: **modal/dialog open = heading appearing after a button click with same/similar name**
  - Example: `click button('Add Sale')` → next step targets `heading('Add Sale')` → this is a modal boundary
  - Each modal interaction sequence becomes its own `it()` block
- Each `it()` block is **fully self-contained**: own `render()` + `userEvent.setup()` — no shared `beforeEach`
- Steps before the first modal boundary (initial page setup) form the first `it()` block

### dblClick Noise Handling
- `dblClick` → `click` pairs on the same element = redundant (noise from the recorder)
- Filter: if a `dblClick` and `click` target the same element consecutively, keep only the `click`
- This is already a Phase 2 concern (REC-01/02) — Phase 3 assumes it's handled upstream or includes it as part of JS parsing

### Helper Functions (TEST-02)
- Phase 3 does **not** generate helper functions
- When scanning existing test files (CTX-02), flag any existing helpers that contain `expect()` statements — log a warning
- Helper generation deferred to a future phase

### Meaningful Matchers (TEST-03)
- Replace generic `toBeInTheDocument()` with context-driven matchers based on element type and action:
  - Input with a value → `toHaveValue('...')`
  - Text content assertion → `toHaveTextContent('...')`
  - Checkbox → `toBeChecked()`
  - Visibility → `toBeVisible()`
  - Presence (default fallback) → `toBeInTheDocument()`
- Infer from the element's role/type extracted during Playwright inspection

### Context Scanning (CTX-01–04)
- Scan on **first run only** — if `.tayo/conventions.json` exists, use cached; skip re-scan
- Developer can force refresh with `tayo scan` command
- What to scan:
  - Existing test files (`*.test.ts/tsx`, `*.spec.ts/tsx`) — import style, describe/it patterns, matcher usage
  - Folder & naming conventions — colocated vs `__tests__/`, TS vs JS, file naming
  - Shared mock files — `__mocks__/`, MSW handlers, `vi.mock`/`jest.mock` patterns
  - **Not** package.json/tsconfig (Claude's discretion)

### Convention Storage (CTX-05)
- Store learned conventions in `.tayo/conventions.json`
- Updated after each run with any new patterns observed
- Format: JSON (machine-readable, fast to parse on next invocation)

### Claude's Discretion
- Exact `.tayo/conventions.json` schema
- How to handle Playwright timeout / app-not-running gracefully
- Whether to lint-fix the generated output automatically
- `tayo scan` CLI command design (flags, output format)

</decisions>

<specifics>
## Specific Ideas

- The sample input has the URL in the jest-environment-options comment header — Tayo extracts this URL to drive Playwright to the right page for DOM inspection
- The `#radix-_r_8s_-content-items` selectors are Radix UI generated IDs (unstable) — these are exactly the cases Playwright needs to resolve into accessible queries
- The recording title format is `Recording-Add-Sale-KE-06/03/2026 at 08:25:15` — Tayo should use this as the `describe()` block name
- The input uses `require()` style — Tayo output should match the project's import style (learned from CTX-01 scan: ESM vs CJS)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/parser.ts` — currently handles Chrome JSON; needs to be replaced or extended with a JS/AST parser for the new input format. The `NormalizedRecording` type can be reused as the internal representation.
- `src/core/generator.ts` — `selectorToQuery()` will be replaced by the Playwright-based resolver; the rest of the structure (describe/it generation) remains relevant
- `src/templates/test-template.ts` — `describeBlock()` currently generates one `it()` block; needs to support multiple `it()` blocks for concern distribution
- `src/types/recording.ts` — `NormalizedStep`, `NormalizedAction` types reusable after JS parsing

### Established Patterns
- Immutable data flow: parse → normalize → generate → write (keep this; add a "resolve" step between normalize and generate)
- `GeneratedTest` interface in generator.ts — extend to carry query quality metadata for the summary output
- Error handling: `throw new Error('...')` with descriptive messages (existing pattern in parser.ts and writer.ts)

### Integration Points
- `src/cli/commands/generate.ts` — context scanning step runs here before generation; check for `.tayo/conventions.json`, run scan if missing
- `.tayo/` directory — new directory created by Tayo for persistent state (conventions.json); writer.ts pattern for mkdir is reusable
- Playwright already in the project stack (PROJECT.md key decisions: "Playwright for UI inspection — already in React ecosystem")

</code_context>

<deferred>
## Deferred Ideas

- Helper function generation (extract repeated setup sequences into assertion-free helpers) — future phase
- `tayo scan` as a standalone command — Phase 3 adds auto-scan; explicit `tayo scan` command can come later
- Support for both JS and JSON input formats — Phase 3 is JS-only; JSON format support deferred

</deferred>

---

*Phase: 03-query-test-design-intelligence*
*Context gathered: 2026-03-06*
