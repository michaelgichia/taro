# How tr Decides What to Write

When the same recording produces a different test in two different repos — or when generation suddenly switches style after a new sibling test is added — the behavior looks like nondeterminism. It isn't. The output is a deterministic function of (a) the recording, (b) what's currently in the repo, and (c) what `.taro/state.json` has learned from past tests. This document explains that function, so a contributor reading a generated test can reason about _why it looks the way it does_ and trace any surprise back to a specific input.

For the strict module-order contract (which file runs in which stage), see [`PIPELINE.md`](./PIPELINE.md). This document layers two things on top of that contract: what evidence each stage consumes, and the disproportionate role past tests play in shaping the output.

## The eight pre-write stages

`gen`, `geni`, and `target` run nine stages. The first eight assemble evidence; the ninth materializes the file. The first eight are documented here because that's where every "why did it pick X?" question lives.

**1. Intake.** Validate the Testing Library Recorder `.js` export, parse it via AST (not regex), normalize it into Taro's JS baseline. Produces a parsed, normalized recording.

**2. State bootstrap.** Load `.taro/state.json`, layer `.taro/overrides.json` on top, resolve auth inputs. Produces the bootstrapped state, a candidate package profile, the override policy, and the runtime auth config. Every downstream stage reads from this.

**3. Visual preflight.** If the recording has a URL, drive Playwright to the recorded page _before_ the repo is searched. Confirms landmarks, recovers from auth walls, captures a starting-point or auth-checkpoint screenshot. Without this stage, repo grounding would search against the recording's intent alone — Playwright proves that intent against the live DOM and discards selector candidates that don't survive the round trip.

**4. Repo grounding.** Combine recording evidence with the confirmed visual context to search the repo for the file under test. Enrich semantic markers (the `taro-query-checkpoint` tags and role/label hints) with what the repo actually contains. Produces ranked context matches and enriched marker evidence.

**5. Package resolution.** Resolve which monorepo package owns the new test from the grounded matches. Refresh stale learned state if needed. Produces the effective package profile and resolved conventions surface — both critical inputs to how the code will look.

**6. Planning.** Analyze mock boundaries (which collaborators must be mocked, which can stay real). Build the raw suite plan. Assemble render-target candidates from both learned state and grounded matches. Produces mock analysis, raw suite plan, and a render-target candidate set.

**7. Boundary shaping.** Pick the actual render target. Plan shared boundary support (render helpers, provider wrappers). Recover selector evidence from the DOM and recording. Hydrate the suite plan with the strongest trustworthy queries. Produces the resolved render target, boundary support plan, resolved queries, and hydrated suite plan.

**8. Emission.** Generate the RTL test code, apply boundary policy, compute the quality `ScoreResult`, emit review warnings. This stage also runs the pre-write audit — see the next section. Produces the generated code, the score, and marker and boundary diagnostics.

Stage 9 (Materialization) is the actual `writeFileSync`. By the time control reaches it, every decision about _what the test should look like_ has already been made.

## The pre-write gate

Stage 8 doesn't write the file. After it produces code, `preWriteAudit` (`src/scorer/pre-audit.ts`) runs `evaluateQualityGates` on the code. Every quality-gate issue at severity `error` becomes a blocking reason and the orchestrator refuses to call `writeFileSync`. Warnings are recorded as advisory and surface in the score, but they don't block the write.

This is documented because "Taro refused to write my test" otherwise looks like a bug. It's the audit. The full list of blocking conditions is in [`GRADING.md`](./GRADING.md) under the four-dimension scorer.

## What informs the output

Five evidence sources feed Emission. They are layered — later sources refine or override earlier ones.

| Source | Contributes | Lives in |
| --- | --- | --- |
| The recording | User-level intent: clicks, types, navigation, semantic `dblClick` assertion checkpoints, ordered selector chains | `.js` recorder export → `ParsedStep` → `InteractionIntent` |
| Visual preflight | Live confirmation that the recorded page rendered; live role/label/text evidence; selector validation before the generator trusts them | `src/core/resolver.ts`; screenshots in `.taro/` |
| Repo grounding | Which file owns this flow; its real props and collaborators; sibling tests that already exist; mocks they use | `src/core/semantic-marker-enrichment.ts`; ranked context matches |
| Learned package conventions | Import style, runner, folder pattern, file extension, render helpers actually used in this package, provider wrappers, repeated mock targets, shared mock factories | `.taro/state.json` → `packages.<packagePath>` |
| Explicit overrides | User corrections that take priority over learned conventions for one run | `.taro/overrides.json` |

## Past tests as the dominant signal

Of the five sources above, past tests are the heaviest weight on the output. The recording determines _what_ the test asserts; past tests determine _how it's written_. This section is the largest in the document because the past-test learning subsystem is the part most likely to surprise a reader — it's invisible behavior driven by files (`.taro/state.json`, SQLite) that look like opaque state.

There are three distinct learning paths, and they feed different stages.

### Convention learning

`src/learner/` walks every existing test file in the repo and ASTs it. From that walk it derives `TestConvention` records covering:

- **Import style** — ESM vs CJS, named vs default, the path aliases this project actually uses
- **Matcher preferences** — does the codebase reach for `toHaveTextContent` or `toHaveProperty('textContent', ...)`; `toBeInTheDocument` or `toBeTruthy`
- **Query preferences** — which RTL queries dominate; whether `findByRole` is preferred over `getByRole` + `waitFor`
- **Naming patterns** — `describe` title style, `it` title style, file-naming pattern (`*.test.tsx` vs `*.spec.tsx`)
- **Structure conventions** — one `describe` per file or nested; `beforeEach` setup or per-test setup; helper naming (`setup`, `build*`, `render*`)

Conventions persist in SQLite for fast lookup across runs. The result: if your existing tests prefer `findByRole` for async work, new generations match that — even though "use `findByRole`" is nowhere in Taro's own code.

### Package profile learning

For each package (monorepo-aware), `.taro/state.json` stores observed concrete artifacts under `packages.<packagePath>`:

```jsonc
{
  "renderHelpers":      [{ "name": "renderWithProviders", "importPath": "@/tests/renderWithProviders",
                           "importKind": "named", "sourceTestFile": "...", "usageCount": 8, "usesWithin": true }],
  "providerWrappers":   [...],
  "renderTargets":      [...],
  "repeatedMockTargets":[...],
  "sharedMockFactories":[...]
}
```

Each artifact carries a `confidence` (high / medium / low) and a list of evidence files. The generator doesn't invent a `renderWithProviders` helper if your package already has one — it imports the existing one. It doesn't write `vi.mock("../api")` inline if `tests/mocks/api.ts` exists and seven other tests in the package import it.

When confidence is low, the generator falls back deterministically (typically to a more conservative default) rather than guessing.

### Graded test history

Beyond convention learning, Taro grades every existing test using a richer regex+AST scorer (`src/core/existing-test-grader.ts`) than the standard quality gates. It counts strong vs presence assertions, role/label/text/test-id query counts, shared-mock-import patterns, passthrough `vi.mock` patterns, render-helper imports, setup-helper detection, `beforeEach` and mock-reset detection, and `BASE_PROPS`/`DEFAULT_PROPS` constants.

Each grade lands in `.taro/state.json` under `gradedTests` (and under `generatedTests` for tests Taro authored). The history is used three ways:

- **High-graded tests become exemplars.** When the generator needs a pattern for "how does this package handle async form submission?" it pulls the highest-graded sibling test for that component family and mirrors its shape.
- **Low-graded tests become warnings.** Patterns that appear _only_ in low-graded tests get deprioritized. The generator won't propagate a smell just because the smell is already in the repo.
- **The nearest sibling test gets special weight.** From `agents/taro-gen.md`: "Prioritize target source, nearest sibling test, shared mock setup, nearest fixture store, then config." When generating a test for `Foo.tsx`, the test next to it is the strongest single signal for shape.

## Where each source enters the pipeline

This is the table that lets you trace a behavior back to a stage when something looks wrong.

| Source | Enters at | Used by |
| --- | --- | --- |
| Recording (intent) | Stage 1 (Intake) | Stages 3, 4, 6, 7, 8 |
| `.taro/state.json` (state, conventions, ledgers) | Stage 2 (State bootstrap) | Every downstream stage |
| `.taro/overrides.json` | Stage 2 (State bootstrap) | Stages 5, 7, 8 |
| Playwright DOM | Stage 3 (Visual preflight) | Stages 4, 7 |
| Repo file matches | Stage 4 (Repo grounding) | Stages 5, 6, 7, 8 |
| Package profile (`packages.<packagePath>`) | Stage 5 (Package resolution) | Stages 6, 7, 8 |
| Graded test history (`gradedTests`, `generatedTests`) | Stage 5 (Package resolution) | Stages 7, 8 |
| Quality gates | Stage 8 (Emission, pre-write audit) | Blocks or allows Stage 9 |

If a generation picked the wrong render helper, the answer is in Stage 5 or 7 — read the package profile. If it generated `getByTestId` when the repo prefers `getByRole`, the answer is in convention learning — re-derive `TestConvention` for that package. If it mirrored a smell from a sibling test, the answer is in graded test history — that sibling's grade is too high, or its smell is being read as a pattern.

## Why this document exists

Taro's output looks deterministic from the inside (it is) and stochastic from the outside (until you know the inputs). Without a single document mapping evidence sources to pipeline stages, three failure modes are common:

- A contributor "fixes" generation behavior by patching the generator when the real fix is to refresh `.taro/state.json` or correct a convention.
- A user sees the generator change its style after one new test lands in the repo and assumes Taro is broken.
- A reviewer of a generation-stage change can't tell which downstream stages still hold the invariants the old code relied on.

This document exists to short-circuit all three. The pipeline contract belongs to [`PIPELINE.md`](./PIPELINE.md). The scoring contract belongs to [`GRADING.md`](./GRADING.md) and [`../taro/references/quality-scoring.md`](../taro/references/quality-scoring.md). The behavioral rules the generator enforces on top of evidence (one behavior per test, no `.toBeDefined()` wrapping, hoisted `vi.fn()` mocks, etc.) belong to [`../agents/taro-gen.md`](../agents/taro-gen.md). What this document uniquely covers is the _path from inputs to output_ — and specifically how disproportionately past tests shape that path.
