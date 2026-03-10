# Feature Research

**Domain:** Testing Library Recorder JS baseline transformation for React Testing Library
**Researched:** 2026-03-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| First-class `.js` input parity | The README and CLI already advertise `.js` support, so users expect `tayo generate ./recording.js` to work as a primary path, not as an experiment | MEDIUM | Same command surface as JSON: `--dry-run`, `--output`, `--force`, scoring, and verified file output |
| AST-based interpretation of recorder JS | Users expect Tayo to understand a recorder export without asking them to run or hand-edit the raw transcript first | HIGH | Parse the Testing Library Recorder export as source code, recover actions/assertion markers/environment metadata, and avoid treating the file as a finished test |
| Stable query recovery with truthful fallback | Recorder JS commonly mixes strong Testing Library queries with brittle `document.querySelector(...)` selectors; users expect Tayo to improve that | HIGH | Preserve semantic query data when present, upgrade CSS selectors when possible, and emit warnings instead of pretending confidence when not possible |
| Maintainable component-test output | The point of Tayo is not to replay the recorder transcript; it is to turn that transcript into code a team can keep | HIGH | Output should resemble `sample/sample-add-sale-test.ts`: setup/render, helper extraction, explicit assertions, grouped tests, and reduced recorder noise |
| Convention, mock, and verification parity with existing generation | Users expect the JS path to benefit from the same codebase awareness as the JSON path | MEDIUM | Reuse convention scanning/merging, mock analysis, score reporting, and post-write syntax verification on the JS path |
| Truthful CLI/help/docs coverage | Users choose the input path based on docs and command help; misleading wording creates immediate trust loss | LOW | Help text, README examples, and milestone docs must describe `.js` as a baseline artifact that Tayo transforms, not a transcript it merely reprints |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Recovery of nested Testing Library intent | JS exports already contain richer query structure than raw JSON; recovering that lets Tayo generate stronger tests with less guesswork | HIGH | Preserve details like `getByRole(..., { name })`, placeholder/text intent, and assertion context instead of collapsing them to `"click"` or bare roles |
| Recorder-noise cleanup plus intent segmentation | Extension exports include duplicate clicks, `dblClick` noise, and long single-flow transcripts; users value tests organized around user intent instead | MEDIUM | Build on current cleanup/grouping to produce helper-oriented flows and multiple `it()` blocks where the recording clearly contains separate checkpoints |
| Mock-aware component-test shaping | Users want component tests that fit their repo, not generic DOM scripts | HIGH | Use repo mock/convention analysis to steer structure and assertions so the JS path can reach the quality bar shown in `sample/sample-add-sale-test.ts` |
| Optional live DOM enrichment without making it mandatory | When the recording has an environment URL, Tayo can rescue brittle selectors; when it does not, the product should still work locally and honestly | MEDIUM | Use DOM inspection as an enhancement for selector recovery, not as a hard dependency or the primary truth source |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Execute the recorder JS as-is | It looks fast because the export is already JavaScript with `userEvent` calls | Produces brittle transcript tests with duplicate noise, raw `querySelector` usage, no component render/setup model, and no codebase-aware structure | Treat the JS file as a baseline artifact, recover intent from it, and regenerate a maintainable component test |
| Promise one-shot perfect mocks/imports for every project | Users want zero-touch output | App-specific render trees, providers, and mock contracts vary too much; pretending certainty creates false confidence and expensive cleanup | Use project conventions and mock analysis to generate the best structure available, then surface ambiguity honestly |
| Turn v1.3 into browser-first replay or E2E output | Recorder exports include live URLs and page state, so browser execution feels adjacent | That shifts the milestone away from local-first RTL generation into Playwright-style behavior, increasing flakiness and scope | Use live inspection only to improve query recovery while keeping component-test generation as the source of value |
| Regress or sideline Chrome Recorder JSON support | JS is the active milestone, so it can be tempting to focus only on the new path | The product already promises dual input support; breaking JSON would turn a new feature into a regression release | Keep JS and JSON on a shared quality bar while using v1.3 to raise JS fidelity |

## Expected Behaviors

- Running `tayo generate ./recording.js` should feel like a normal supported flow, not a special-case command path.
- Tayo should parse recorder JS as source code and recover user actions, assertions, query metadata, and environment hints without executing the raw export as the final test.
- When the export includes strong Testing Library queries, the generated test should preserve that semantics instead of flattening it to generic `getByText()` or role-only lookups.
- When the export falls back to `document.querySelector(...)`, Tayo should try to upgrade those selectors using the recorded environment URL and DOM inspection when available; otherwise it should warn and fall back truthfully.
- Duplicate clicks, `dblClick` noise, and transcript-only churn should be filtered so the generated test reads like intentional test code.
- The resulting file should look like a maintainable component test for this repo: clear setup, helper boundaries where useful, explicit assertions, mock-aware organization, project conventions, score output, and post-write verification.
- The user-facing docs/help/examples should explain that recorder JS is a baseline artifact Tayo transforms into a project test, not a finished test file users are expected to keep verbatim.

## Explicit Exclusions

- Direct execution of the Testing Library Recorder export as the shipped test artifact
- Dropping or regressing Chrome Recorder JSON support
- Non-React framework support or browser E2E/Playwright test generation
- Solving every repo-specific provider/import/mock problem automatically in v1.3
- Installer, packaging, or broad `Tayo`/`tayo` naming work unrelated to JS baseline quality

## Feature Dependencies

```text
First-class JS baseline input
    └──requires──> AST recovery of nested query/action/assertion metadata
                        └──requires──> normalized step model rich enough to preserve query intent

Stable selector upgrade
    └──requires──> environment URL extraction + DOM inspection fallback

Maintainable grouped output
    └──requires──> recorder-noise cleanup + intent grouping + code generator support
                        └──enhanced by──> convention scanning + mock analysis

Truthful docs/help ──requires──> shipped CLI behavior matching advertised `.js` support

Direct transcript execution ──conflicts──> maintainable component-test output
```

### Dependency Notes

- **First-class JS baseline input requires AST recovery of nested metadata:** the current pipeline can only produce good RTL code if the parser carries enough information forward from `userEvent`, `screen.*`, and assertion calls.
- **AST recovery requires a richer normalized step model:** if JS parsing drops query options or assertion context too early, the generator can only reconstruct shallow queries.
- **Stable selector upgrade requires environment URL extraction plus DOM inspection fallback:** `document.querySelector(...)` recovery is only reliable when the export includes a usable URL and the app can be inspected.
- **Maintainable grouped output requires cleanup, intent grouping, and generator support:** multi-`it()` output depends on removing recorder noise before grouping the remaining steps.
- **Convention scanning and mock analysis enhance maintainable output:** these are how the JS path becomes repo-aware instead of producing generic DOM tests.
- **Direct transcript execution conflicts with maintainable output:** the milestone exists to transform the recording, not to bless the recorder export as production-quality test code.

## Scope Notes

- The supported JS baseline for v1.3 is the Testing Library Recorder extension style shown in `sample/sample-rest-recordingextension-output.js`, including CommonJS imports and optional `@jest-environment-options`.
- The quality bar is the generated structure shown in `sample/sample-add-sale-test.ts`: readable helper boundaries, explicit assertions, and test cases that reflect component intent rather than raw click chronology.
- "Maintainable" in this milestone means substantially better than the transcript by default. It does not require eliminating every project-specific follow-up edit in every repo.
- If Tayo cannot recover a strong query or assertion safely, it should degrade with a warning and a weaker fallback instead of inventing precision.

## MVP Definition

### Launch With (v1.3)

- [ ] Recorder extension `.js` files work as a documented primary input to `tayo generate`
- [ ] AST parsing recovers actions, nested query data, assertion markers, and environment metadata from recorder JS
- [ ] `document.querySelector(...)` steps are upgraded to stronger queries when possible and warned/fallen back when not
- [ ] Generated output is structured as maintainable RTL component tests with cleanup, grouping, helpers, and explicit assertions
- [ ] JS generation benefits from convention learning, mock analysis, scoring, and post-write verification
- [ ] CLI help, README examples, and milestone docs describe the JS baseline path accurately

### Add After Validation (v1.x)

- [ ] Broader support for more recorder idioms such as richer `within(...)` patterns, async wait variants, and keyboard-heavy flows once the base JS path is stable
- [ ] Better remediation hints when Tayo detects inaccessible source components that force weak queries
- [ ] Reusable setup/mock templates for common app patterns if repeated demand shows the same gaps across repos

### Future Consideration (v2+)

- [ ] Direct recorder-extension integrations or export helpers beyond file-based input
- [ ] Non-React targets or browser/E2E output formats
- [ ] Interactive review tooling for approving or refining generated tests before write

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Primary `.js` input parity in `tayo generate` | HIGH | MEDIUM | P1 |
| Nested query/action/assertion recovery from JS AST | HIGH | HIGH | P1 |
| Selector upgrade plus truthful warning path | HIGH | HIGH | P1 |
| Maintainable grouped output instead of transcript replay | HIGH | HIGH | P1 |
| Convention and mock-aware JS generation parity | HIGH | MEDIUM | P1 |
| Optional live DOM enrichment for query rescue | MEDIUM | MEDIUM | P2 |
| Repo-specific auto-mock scaffolding | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Raw Recorder JS Export | Current Tayo JS Path | Our Approach |
|---------|------------------------|----------------------|--------------|
| Input contract | Executable transcript file from the extension | Accepted by extension/header detection, but still behaves like a thin translation path | Treat `.js` as a first-class baseline input with the same trust level as JSON |
| Query fidelity | Contains full nested query calls, but not in a maintainable final form | Current parser drops much of the nested query intent and reconstructs shallow queries | Preserve and use nested query metadata so generated tests keep meaningful selectors |
| Test structure | Single long `test()` dominated by interaction chronology | Can emit grouped tests, but grouping quality is limited by shallow parsing | Generate helper-oriented, intent-based component tests closer to `sample/sample-add-sale-test.ts` |
| Selector handling | Often falls back to raw `document.querySelector(...)` | Resolver support exists, but only enriches what the parser can surface | Make selector rescue a standard, honest part of the JS path when environment data exists |
| Codebase awareness | None | Convention scanning, scoring, and mock analysis already exist | Ensure JS support actually benefits from those systems instead of bypassing them |

## Sources

- `/Users/michaelgichia/workspace/tayo/.planning/PROJECT.md`
- `/Users/michaelgichia/workspace/tayo/README.md`
- `/Users/michaelgichia/workspace/tayo/src/core/js-parser.ts`
- `/Users/michaelgichia/workspace/tayo/src/cli/commands/generate.ts`
- `/Users/michaelgichia/workspace/tayo/src/core/generator.ts`
- `/Users/michaelgichia/workspace/tayo/src/core/recording-intelligence.ts`
- `/Users/michaelgichia/workspace/tayo/sample/sample-rest-recordingextension-output.js`
- `/Users/michaelgichia/workspace/tayo/sample/sample-add-sale-test.ts`

---
*Feature research for: Testing Library Recorder JS baseline transformation*
*Researched: 2026-03-09*
