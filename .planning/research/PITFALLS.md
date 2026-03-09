# Pitfalls Research

**Domain:** Testing Library Recorder JS baseline support in Taro
**Researched:** 2026-03-09
**Confidence:** HIGH

Current repo evidence is already strong. A dry run of `node dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run` on 2026-03-09 produced a blank suite title, 55 intent groups, 23 fragile `getByTestId` fallbacks, `<App />` placeholder renders, and a 44/100 score. The pitfalls below are based on that run plus the current implementation in `src/core/js-parser.ts`, `src/cli/commands/generate.ts`, `src/core/recording-intelligence.ts`, `src/core/generator.ts`, `src/core/resolver.ts`, `src/core/scorer.ts`, `src/templates/test-template.ts`, `sample/sample-rest-recordingextension-output.js`, and `sample/sample-add-sale-test.ts`.

Likely v1.3 phase slices referenced below:
- JS AST normalization
- Selector and assertion recovery
- Suite synthesis and mock/context integration
- Verification gates and scoring parity
- CLI/docs and JSON parity

## Critical Pitfalls

### Pitfall 1: Nested RTL queries are flattened into fake actions and fake targets

**What goes wrong:**
Real recorder code like `userEvent.click(screen.getByRole('button', { name: 'Add Sale (Invoice)' }))` is parsed as two separate steps: a click whose target becomes the literal fallback `"click"` and an assert whose target becomes only `"button"`. The current dry run turns that into code such as `await user.click(screen.getByText('click'))` and `expect(screen.getByRole('button')).toBeInTheDocument()`, which preserves syntax but loses the real user intent.

**Why it happens:**
`src/core/js-parser.ts` currently handles `screen.getBy*` calls and `userEvent.*` calls independently, and `extractStringArg()` only understands raw string and template literals. That means nested `CallExpression` targets are not reconstructed, query options like `{ name: 'Save' }` are dropped, and every `screen.getBy*` is treated as a standalone assert even when it is just the operand of a click or type. The current parser test only covers a toy input with `userEvent.click('Save')`, not real Recorder output.

**How to avoid:**
Model the JS baseline around nested AST recovery, not flat call counting. Parse `userEvent` calls first, unwrap the nested query expression into structured query metadata, preserve method plus options, and only emit an assert when the recorder call actually represents a checkpoint. Add a golden parser test based on `sample/sample-rest-recordingextension-output.js` so this never regresses back to string-slicing behavior.

**Warning signs:**
Generated code queries for `"click"` or `"type"`, `getByRole()` loses its accessible name, and parsed step counts look closer to total call-expression count than actual user actions.

**Phase to address:**
Likely v1.3 JS AST normalization

---

### Pitfall 2: Flow segmentation creates many `it()` blocks that cannot possibly pass

**What goes wrong:**
The current JS path can turn one wizard flow into dozens of tiny `it()` blocks. In the sample dry run, the single sale flow became 55 intent groups. Each generated block calls `render(<App />)` independently, so later groups start from a fresh render while assuming earlier dialog and form state already exists. That produces a suite that looks organized but is behaviorally impossible.

**Why it happens:**
The downstream path ignores the parser's own `itGroups` as meaningful structure and re-groups via `analyzeRecording()`. `src/core/recording-intelligence.ts` flushes a group on every assert, and `src/templates/test-template.ts` renders a fresh app inside every generated `it()`. The result is a structure score reward for fragmentation rather than for runnable scenario design. Title extraction is also fragile, so the sample run printed an empty suite name and repetitive group names like `confirm click` and `edit type`.

**How to avoid:**
Only split into multiple tests when the shared setup can be reconstructed safely. For dependent wizard flows, prefer one end-to-end test plus synthesized helpers, or promote stable setup prefixes into shared helper functions before creating separate `it()` blocks. Use semantic milestones such as "open add sale dialog", "fill other details", and "save sale" as grouping anchors, matching the helper style in `sample/sample-add-sale-test.ts`.

**Warning signs:**
One recorder file yields dozens of tests, group names are verbs plus raw recorder noise (`confirm dblClick`), the suite title is blank, and every block begins with `render(<App />)` despite later steps clearly depending on earlier state.

**Phase to address:**
Likely v1.3 suite synthesis and helper extraction

---

### Pitfall 3: Selector recovery depends on a live browser and falls back to invented test IDs

**What goes wrong:**
When the recorder contains `document.querySelector(...)`, generation tries to resolve those selectors by launching Playwright against the recorded URL. If the browser cannot launch, the app is down, or the selector no longer exists, the current path silently downgrades to sanitized `getByTestId()` values derived from the CSS selector text. Those test IDs do not exist in the product, so the generated test becomes fiction.

**Why it happens:**
`src/cli/commands/generate.ts` only creates `QueryResult` entries for `document.querySelector` calls, and `src/core/resolver.ts` treats missing DOM data as permission to invent a test ID. The sample dry run hit this path directly: Playwright failed, then Taro reported 23 fragile `getByTestId` queries. Because the fallback is framed as degraded quality rather than unresolved truth, the tool can still proceed to write code that is not grounded in the real UI.

**How to avoid:**
Never synthesize nonexistent test IDs from raw CSS. Treat unresolved selectors as a blocking checkpoint or emit explicit TODO placeholders that preserve the original selector and failure reason. Use AST-derived RTL queries first, use live DOM inspection only as an optional enhancer, and make "browser unavailable" visibly different from "element exists but needs a weaker query."

**Warning signs:**
`QRY-02` warnings, query summaries dominated by `getByTestId`, TODO placeholders based on CSS, or acceptable-looking output that still requires the local app and browser to be running just to reach baseline quality.

**Phase to address:**
Likely v1.3 selector and assertion recovery

---

### Pitfall 4: Scoring can report confidence that the JS path has not earned

**What goes wrong:**
The scoring layer can overstate quality for JS baselines. If a recorder uses only `screen.getBy*` calls and no `document.querySelector`, the current JS branch may produce no `queryResults` at all, which means `calculateQueryScore()` returns 100 even if the generated queries lost names, options, or intent. Structure scoring also rewards multiple `it()` blocks even when those tests are not runnable. Meanwhile, project state explicitly says scoring and mock intelligence are advisory only, so low-fidelity output can still be written.

**Why it happens:**
`classifyQuery()` exists in `src/core/js-parser.ts` but is not used by the write path. `src/core/scorer.ts` scores only the collected `queryResults`, and `src/cli/commands/generate.ts` only collects those for CSS selectors, not for `screen.getBy*` calls parsed from JS. Assertions also default to `.toBeInTheDocument()`, so weak presence checks can still look "good enough" to the current scorer.

**How to avoid:**
Emit query metadata for every recovered JS query, not just CSS fallbacks. Separate synchronization checkpoints from user-visible assertions, penalize blank titles and placeholder renders, and add write-blocking or approval checkpoints when semantic confidence is too low. A golden dry-run diff against `sample/sample-add-sale-test.ts` is a better gate than syntax plus score alone.

**Warning signs:**
No query summary for a query-heavy JS file, structure scores jump because the suite was over-split, output is dominated by `.toBeInTheDocument()`, or Taro writes files after clearly reporting F or D quality.

**Phase to address:**
Likely v1.3 verification gates and scoring parity

---

### Pitfall 5: Mock and project-context intelligence is logged but not actually used to shape JS output

**What goes wrong:**
The generated JS suite does not resemble the target quality bar. Instead of importing the real module under test, shared mocks, and helper structure, it renders `<App />` and emits generic user actions. That means the output cannot exercise auth, router, data-layer, and mutation behavior in the way `sample/sample-add-sale-test.ts` expects.

**Why it happens:**
The JS branch does run convention scanning and mock analysis, but those results are mostly printed, not enforced. `src/core/generator.ts` only uses convention data for import style, and `src/templates/test-template.ts` hardcodes `render(<App />)`. `src/core/mock-intelligence.ts` can tell that a repo prefers shared data-layer mocks and mutation lifecycle tests, but the code generator never turns that into a mock plan, helper import set, or target-module render path.

**How to avoid:**
Move from advisory mock intelligence to generation-time context planning. Resolve the candidate component/module before codegen, thread shared mock recommendations into the generator, and checkpoint when the render target or mock boundary is unknown. Treat the sample test as the minimum architectural bar for the JS baseline, not as a stretch goal.

**Warning signs:**
Generated code still contains `<App />`, has no repo-local imports, lacks `vi.mock()` or fixture wiring for a data-heavy flow, and cannot explain what module it is supposed to render.

**Phase to address:**
Likely v1.3 suite synthesis and mock/context integration

---

### Pitfall 6: The new JS path drifts away from the existing JSON path and the product story

**What goes wrong:**
Users hear that `.js` is supported, but the product surface still speaks JSON in key places. `README.md` says `taro generate <file>` accepts both `.json` and `.js`, while `src/cli/commands/generate.ts` still describes the command as "Generate RTL test from Chrome Recorder export" with an argument description that says "Chrome Recorder JSON export file." At the same time, the JS path is implemented as a large special-case branch inside `generate.ts`, so fixes can land on one path but not the other.

**Why it happens:**
JS baseline support is being appended to a mature JSON pipeline instead of being modeled as another normalized input source sharing the same downstream guarantees. Product copy, help text, and package description are not sourced from a single truth, so drift is already visible before v1.3 execution starts.

**How to avoid:**
Define one normalized recording contract for both JSON and JS inputs, then keep cleanup, generation, scoring, and verification shared wherever possible. Add parity fixtures so both input types must satisfy the same downstream invariants. Unify CLI/help/package wording before shipping the milestone so public claims match the implemented quality bar.

**Warning signs:**
README, package metadata, and `taro generate --help` disagree; new behavior is added only inside the JS branch; JSON regression tests stop running during JS milestone work.

**Phase to address:**
Likely v1.3 CLI/docs and JSON parity

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Treat every nested `screen.getBy*` as its own assert | Very fast AST traversal | Produces fake steps, fake targets, and duplicate checks | Never |
| Convert unresolved CSS selectors into invented `getByTestId()` calls | Keeps generation moving when Playwright fails | Bakes nonexistent test IDs into user code and hides selector truth gaps | Never |
| Split on every assert to boost test structure | Easy path to multi-`it()` output and better structure scores | Creates many isolated tests that cannot recreate prior UI state | Never |
| Keep scoring advisory-only for JS baseline rollout | Fewer blockers during early development | Low-fidelity suites still get written and may be trusted by users | Only behind an explicit internal-only flag, not in the public path |
| Validate JS support with syntax-only tests and toy parser fixtures | Fast green CI | Misses real Recorder shapes and sample-quality regressions | Only as supplemental coverage, never as the main proof |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Testing Library Recorder JS exports | Parsing only string literals and ignoring nested query expressions | Recover the nested AST shape, including query method, accessible-name options, and whether a call is an action operand or an actual checkpoint |
| Playwright-based selector inspection | Treating a live browser and local app as required for acceptable generation | Use browser inspection as an optional enhancer, preserve unresolved selectors honestly, and never invent missing test IDs |
| Existing repo mock layers and conventions | Logging mock recommendations without feeding them into code generation | Resolve a render target, reuse shared mock helpers, and make the mock plan part of generation rather than console output |
| JSON pipeline parity | Building a JS-only branch with its own cleanup and scoring assumptions | Normalize both inputs to one downstream contract and run parity tests on both |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One assert equals one intent group | Recorder wizard flows explode into dozens of `it()` blocks and very large snapshots/diffs | Group by semantic milestones, not raw assert count | Breaks visibly on flows with 10+ assertions; the sample already explodes to 55 groups |
| Separate browser launches for visual capture and selector inspection | JS generation gets slow and noisy, especially when the browser cannot launch | Reuse a single inspection session or skip optional inspection after the first hard browser failure | Breaks in CI, locked-down desktops, or any run with 20+ selector lookups |
| Full-repo convention and mock scans on first JS run | First-run latency becomes dominated by repository scanning instead of recorder parsing | Cache aggressively and keep discovery scoped to likely target modules/tests before falling back to broader scans | Becomes painful in medium-to-large monorepos or when generating repeatedly during iteration |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Preserving real org IDs, customer PINs, phone numbers, and emails from recorder fixtures in committed samples or generated tests | Sensitive tenant or customer data leaks into the repo and downstream artifacts | Add redaction rules for URLs and visible text before fixture promotion or committed output |
| Auto-visiting arbitrary `@jest-environment-options` URLs from a recorder file | Taro can touch unintended local or internal services when the input comes from an untrusted source | Restrict or approve hosts before Playwright navigation, especially outside `localhost` |
| Capturing full-page screenshots of real app states into `.taro/visual` without explicit handling | Screenshots can persist sensitive data and accidentally get shared | Keep `.taro/` ignored, make visual capture opt-in for sensitive flows, and document that screenshots may contain live data |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Output reads like a recorder transcript instead of a maintainable test | Users lose trust in the JS baseline path and fall back to hand-written tests | Generate helper-based scenarios closer to `sample/sample-add-sale-test.ts`, not raw click-by-click transcripts |
| Blank suite names and repetitive test names like `confirm click` | The result is hard to review, hard to debug, and hard to keep | Derive titles from the `test()` name or semantic milestones, not fragile comment parsing |
| JS generation quality depends on the app being up and browser inspection succeeding | The feature feels flaky and environment-sensitive compared with JSON input | Make the baseline useful offline, and treat live inspection as optional enrichment |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **JS parser:** handles real nested Recorder calls like `userEvent.click(screen.getByRole(...))`, not just string-literal toy inputs
- [ ] **Generated suite:** uses a real render target and repo-local imports instead of `render(<App />)`
- [ ] **Selectors:** unresolved CSS selectors do not become invented `getByTestId()` calls
- [ ] **Assertions:** preserved query options and assertion intent survive code generation, especially accessible names on `getByRole()`
- [ ] **Structure:** multi-`it()` output is only produced when each test can recreate or share the required state
- [ ] **Parity:** JSON fixtures still pass the same downstream smoke checks after JS work lands
- [ ] **Product surface:** README, package metadata, and CLI help all describe the same input support truthfully

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Nested query flattening | HIGH | Rebuild parser output around nested query descriptors, regenerate golden fixtures, and invalidate any JS suites produced from the broken parser |
| Over-segmented multi-`it()` output | MEDIUM | Collapse dependent groups back into a smaller scenario set, synthesize shared helpers, and rerun dry-run comparison against the sample quality bar |
| Invented `getByTestId()` fallbacks | MEDIUM | Replace synthetic queries with unresolved-selector checkpoints, rerun generation without browser-dependent truth assumptions, and only reintroduce stable queries from real evidence |
| Mock/context blindness | HIGH | Identify the intended render target, wire required repo mocks and helpers, and compare the regenerated suite against the architectural patterns in `sample/sample-add-sale-test.ts` |
| JS/JSON product drift | MEDIUM | Reconcile help text, README, package copy, and parity tests from one source of truth before the next release candidate |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Nested query flattening | JS AST normalization | Golden parser fixture keeps nested `userEvent(screen.getBy*)` calls intact with method plus options |
| Over-segmented multi-`it()` output | Suite synthesis and helper extraction | Sample sale flow generates a small, runnable suite with shared helpers instead of dozens of isolated tests |
| Invented selector recovery | Selector and assertion recovery | Dry runs without a live browser preserve unresolved selectors honestly and do not emit fake test IDs |
| False scoring confidence | Verification gates and scoring parity | Query summaries include JS-derived `screen.getBy*` queries, weak-assertion rates are visible, and low-confidence runs checkpoint before write |
| Mock/context blindness | Suite synthesis and mock/context integration | Generated code renders a real target module, imports repo-local mocks, and covers mutation paths comparable to the sample quality bar |
| JS/JSON path drift | CLI/docs and JSON parity | JSON and JS fixtures both pass shared downstream smoke checks, and CLI/help/docs agree on supported inputs |

## Sources

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `src/core/js-parser.ts`
- `src/core/js-parser.test.ts`
- `src/cli/commands/generate.ts`
- `src/core/recording-intelligence.ts`
- `src/core/generator.ts`
- `src/core/generator.test.ts`
- `src/core/resolver.ts`
- `src/core/scorer.ts`
- `src/templates/test-template.ts`
- `sample/sample-rest-recordingextension-output.js`
- `sample/sample-add-sale-test.ts`
- `README.md`
- Verification commands run on 2026-03-09:
- `npm run build`
- `npm run test:run -- src/core/js-parser.test.ts src/core/generator.test.ts src/core/recording-intelligence.test.ts`
- `node dist/index.js generate sample/sample-rest-recordingextension-output.js --dry-run`

---
*Pitfalls research for: Testing Library Recorder JS baseline support in Taro*
*Researched: 2026-03-09*
