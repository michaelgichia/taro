# Feature Research

**Domain:** Test Generation Tools — Chrome Recorder to React Testing Library
**Researched:** 2026-03-06
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chrome Recorder JSON parsing | Core input format; users export from Chrome DevTools | LOW | Must handle all step types (click, fill, select, scroll, assert) |
| Valid RTL query generation | Tests must actually find elements | HIGH | Must generate getByRole, getByText, getByLabelText, etc. — not CSS selectors |
| Test structure generation | Users expect runnable test files | LOW | describe/it blocks, imports, proper RTL setup |
| Click event translation | Most common interaction | LOW | translate to fireEvent.click or userEvent.click |
| Fill/input event translation | Form filling is common | MEDIUM | handle input, textarea, checkbox, radio |
| Assertion generation | From recorded assertions | MEDIUM | Convert waitForElement to expect statements |
| Jest/Vitest compatibility | Standard React test runners | LOW | Generate tests that run with common config |
| Multiple selector handling | Recorder outputs multiple selectors per step | MEDIUM | Choose best RTL query from available selectors |
| Test file creation | Users expect actual files written | LOW | Write to filesystem at appropriate location |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Project convention analysis | Generated tests match existing codebase style | HIGH | Detect: test file naming, folder structure, query preferences |
| Test colocation | Tests live next to components, not separate folder | MEDIUM | Place .test.js next to .jsx/.tsx files |
| Learning state | Improve over time based on user corrections | HIGH | Remember which queries user prefers, fallback strategies |
| Smart selector-to-query conversion | Recorder selectors → best RTL queries | HIGH | aria → getByRole, label text → getByLabelText, testId → getByTestId |
| Component flow detection | Understand recorded steps relate to components | MEDIUM | Group steps into logical test cases |
| Auto-fix brittle selectors | Replace fragile selectors with robust alternatives | MEDIUM | Upgrade from getByText to getByRole when possible |
| Custom convention support | Respect project-specific patterns | MEDIUM | Follow project's query preferences, naming conventions |
| Incremental test updates | Re-generate without overwriting manual edits | HIGH | Merge generated code with existing test code |
| Regeneration from updated recordings | Re-run on modified Chrome Recorder exports | MEDIUM | Handle recording changes, preserve manual additions |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time recording | Users want to record directly in tool | Out of scope — Chrome Recorder already does this | Integrate with Chrome Recorder exports |
| E2E/Playwright test generation | Users may want both | Different paradigm; E2E vs component testing have different needs | Separate tool or explicit mode |
| Visual regression testing | Screenshots seem useful | Not RTL's purpose; creates massive maintenance burden | Use dedicated visual regression tools |
| Auto-modify source code | Fix components to be more testable | Dangerous; could break production | Generate tests only, leave code changes to humans |
| Test execution | Run tests after generation | Adds complexity; users have their own test runner | Just generate, let users run |
| Continuous recording | Monitor for changes | Not the workflow; recordings are discrete | Re-import on demand |
| Test maintenance/fixing | Automatically fix failing tests | Extremely complex; would need AI | Provide clear migration guidance |

## Feature Dependencies

```
[Chrome Recorder JSON Parsing]
    └──requires──> [Valid RTL Query Generation]
                        └──requires──> [Smart Selector-to-Query Conversion]
                                                    └──requires──> [Project Convention Analysis]

[Test Colocation]
    └──requires──> [Chrome Recorder JSON Parsing]

[Learning State]
    └──requires──> [Project Convention Analysis]

[Incremental Test Updates]
    └──requires──> [Test File Creation]

[Regeneration from Updated Recordings]
    └──requires──> [Test File Creation]
                        └──requires──> [Incremental Test Updates]
```

### Dependency Notes

- **Chrome Recorder JSON Parsing requires Valid RTL Query Generation:** Parsing alone isn't useful; the output must be valid RTL tests
- **Valid RTL Query Generation requires Smart Selector-to-Query Conversion:** Browser selectors (CSS, aria) must map to RTL queries (getByRole, getByLabelText)
- **Smart Selector-to-Query Conversion requires Project Convention Analysis:** Different projects prefer different queries; conversion must respect project preferences
- **Test Colocation requires Chrome Recorder JSON Parsing:** Must understand the recording to place tests appropriately
- **Learning State requires Project Convention Analysis:** Can't learn without understanding baseline conventions

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Chrome Recorder JSON parsing — handle clicks, fills, scrolls, asserts
- [ ] Basic RTL query generation — getByRole, getByText, getByLabelText
- [ ] Test structure generation — proper describe/it blocks with imports
- [ ] Test file creation — write valid .test.js files
- [ ] Jest compatibility — generate runnable tests

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Project convention analysis — detect existing test patterns
- [ ] Smart selector-to-query conversion — choose optimal RTL queries
- [ ] Test colocation — place tests next to components
- [ ] Multiple selector fallback — try alternatives if first fails
- [ ] Auto-fix brittle selectors — upgrade to more robust queries

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Learning state — improve from user corrections over time
- [ ] Incremental test updates — merge with manual edits
- [ ] Regeneration from updated recordings — handle recording changes
- [ ] Custom convention support — project-specific patterns

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chrome Recorder JSON parsing | HIGH | LOW | P1 |
| Valid RTL query generation | HIGH | HIGH | P1 |
| Test structure generation | HIGH | LOW | P1 |
| Test file creation | HIGH | LOW | P1 |
| Jest/Vitest compatibility | HIGH | LOW | P1 |
| Smart selector-to-query conversion | HIGH | HIGH | P1 |
| Project convention analysis | MEDIUM | HIGH | P2 |
| Test colocation | MEDIUM | MEDIUM | P2 |
| Assertion generation | MEDIUM | MEDIUM | P2 |
| Multiple selector handling | MEDIUM | MEDIUM | P2 |
| Auto-fix brittle selectors | LOW | MEDIUM | P3 |
| Learning state | LOW | HIGH | P3 |
| Incremental test updates | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Chrome Recorder (built-in) | Playwright Codegen | Our Approach |
|---------|---------------------------|-------------------|--------------|
| Output format | JSON (export) | Playwright tests | RTL tests |
| Target | Puppeteer replay | E2E tests | Component tests |
| Query generation | Selector strings | Smart locators | RTL queries |
| Project analysis | None | None | Detect conventions |
| Test location | Export anywhere | Export to file | Colocation |
| Learning state | None | None | Store preferences |

**Key differentiation:** Chrome Recorder exports JSON (requires transformation); Playwright generates E2E tests (different paradigm). Taro specifically targets RTL component tests with project-aware generation.

## Sources

- [Chrome Recorder Documentation](https://developer.chrome.com/docs/devtools/recorder) — Input format
- [Chrome Recorder Extensions](https://developer.chrome.com/docs/devtools/recorder/extensions) — Export customization
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro) — Target output format
- [Playwright Codegen](https://playwright.dev/docs/codegen) — Comparison benchmark
- [Puppeteer Replay](https://github.com/puppeteer/replay) — JSON format reference

---

*Feature research for: Test Generation Tools — Chrome Recorder to RTL*
*Researched: 2026-03-06*
