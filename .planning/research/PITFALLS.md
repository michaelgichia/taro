# Pitfalls Research

**Domain:** Test Generation (Chrome Recorder to React Testing Library)
**Researched:** March 6, 2026
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Generating Brittle CSS/XPath Selectors

**What goes wrong:**
The Chrome Recorder exports selectors that prioritize CSS classes and XPath based on browser DOM state. These selectors break when:
- CSS classes are auto-generated (React, Angular, Vue production builds)
- Component styles change
- DOM structure shifts slightly
- Tests run in different environments

The generated test fails with "Unable to find element" errors, causing CI failures and test maintenance burden.

**Why it happens:**
Chrome Recorder captures the DOM state at recording time, using whatever selectors were stable in the browser. It doesn't understand that:
- Generated class names (e.g., `.jsx-123456`) are unstable
- XPath can be overly specific to DOM structure
- The test environment differs from the browser recording environment

**How to avoid:**
1. **Implement selector transformation** - Convert CSS/XPath to semantic queries (getByRole, getByLabelText)
2. **Create fallback chain** - Try semantic queries first, then data-testid, then stable CSS
3. **Add selector validation** - Detect generated class names and warn/auto-convert
4. **Integrate with codebase analysis** - Scan React components for accessible names and test-ids

**Warning signs:**
- Selectors contain `.jsx-`, `.css-`, or hashed class names
- Long XPath expressions (more than 3 levels deep)
- Selectors using element indexes (`:nth-child`)
- No accessibility attributes in the recorded DOM

**Phase to address:**
**Phase 2: Core Parser & Selector Transformation** - This is a core parsing problem that must be solved before test generation can work reliably.

---

### Pitfall 2: E2E-to-Unit Test Paradigm Mismatch

**What goes wrong:**
Chrome Recorder produces end-to-end style tests (navigate to URL, click elements, verify page state). Converting directly to React Testing Library produces:
- Tests that require full app rendering
- Tests that can't isolate components
- Tests dependent on routing/navigation
- Tests requiring global state/providers

These tests become integration tests masquerading as unit tests, slow to run, and brittle.

**Why it happens:**
- Chrome Recorder records user flows across the entire application
- RTL is designed for component-level testing with shallow rendering
- E2E tests assume a running server and full DOM; RTL assumes Jest + jsdom
- The recording captures cross-component interactions but not component boundaries

**How to avoid:**
1. **Detect component boundaries** - Analyze routing and page structure to identify logical components
2. **Generate component-scoped tests** - Instead of full URL navigation, render individual components
3. **Provide test structure options** - Allow "full app" vs "isolated component" test generation
4. **Extract mock data** - Convert recorded state into mock data for component props/context
5. **Generate wrapper configurations** - Create necessary test utilities (providers, stubs)

**Warning signs:**
- Tests start with `render(<App/>)` or navigate to full URLs
- Multiple components rendered in a single test
- Tests depend on global state or Redux providers
- No isolation between test cases (shared state leaks)

**Phase to address:**
**Phase 3: React Codebase Analysis** - Understanding component structure is essential for generating appropriate tests.

---

### Pitfall 3: Ignoring Async/Wait Patterns

**What goes wrong:**
Chrome Recorder includes timeout configuration but generates tests that:
- Don't handle React's async rendering
- Don't wait for state updates
- Don't handle loading states
- Race against DOM updates

Tests fail intermittently with "element not found" or "expected X but found Y" because the test executes before React has updated the DOM.

**Why it happens:**
- Browser replay has built-in waits for page loads
- React state updates are asynchronous and may batch
- The recording doesn't capture the "think time" between actions
- Loading spinners, skeleton screens, and optimistic UI cause timing issues

**How to avoid:**
1. **Analyze recorded timing hints** - Extract waitForElement steps and convert to RTL async patterns
2. **Detect state change patterns** - Identify when actions trigger async updates
3. **Generate findBy queries** - Use async queries (findBy*) for elements that appear after interactions
4. **Add explicit waits** - Generate waitFor patterns for known async scenarios (API calls, transitions)
5. **Configure proper timeouts** - Set appropriate timeouts matching the recorded replay settings

**Warning signs:**
- Recording has explicit wait steps (waitForElement, waitForExpression)
- Interactions followed by assertions without await
- Loading states visible in recorded steps
- Network requests captured in recording

**Phase to address:**
**Phase 2: Core Parser & Selector Transformation** - Async handling is fundamental to test reliability.

---

### Pitfall 4: Using fireEvent Instead of user-event

**What goes wrong:**
Generated tests use `fireEvent` from DOM Testing Library, which:
- Doesn't simulate real user behavior accurately
- Misses subtle interactions (hover, focus, blur sequences)
- Doesn't trigger React's synthetic events properly
- Can pass tests that would fail in real user interaction

Kent C. Dodds (Testing Library creator) recommends user-event over fireEvent.

**Why it happens:**
- Chrome Recorder exports fireEvent-compatible event data
- Converting to user-event requires understanding event sequences
- The recording doesn't capture the full interaction context (focus -> type -> blur)
- Simple translation is easier than semantic event simulation

**How to avoid:**
1. **Map event types to user-event functions**:
   - click → userEvent.click()
   - type/change → userEvent.type() or userEvent.clear() + userEvent.type()
   - hover → userEvent.hover()
   - keyboard → userEvent.keyboard()
2. **Generate event sequences** - For input: focus -> clear -> type -> blur (or skip blur if not needed)
3. **Provide configuration** - Allow opting between fireEvent and user-event
4. **Document the trade-off** - Make users aware of the difference

**Warning signs:**
- fireEvent.click() calls in generated tests
- fireEvent.change() with direct value assignment
- No user-event import in generated tests

**Phase to address:**
**Phase 4: Test Generator Engine** - Event simulation is part of test generation logic.

---

### Pitfall 5: No Convention Awareness

**What goes wrong:**
Generated tests:
- Don't follow project naming conventions (filename.test.js vs spec.tsx)
- Don't colocate tests with components (tests in __tests__ vs next to components)
- Don't use project's testing patterns (describe/it vs test)
- Don't integrate with project's test utilities or custom render functions
- Use different assertion styles than the project

The generated tests feel "foreign" and developers rewrite them instead of using them.

**Why it happens:**
- Generic test generation ignores project context
- No analysis of existing test files to learn patterns
- Testing Library has many "right ways" (screen vs container, expect vs should)
- Project may have custom render functions or providers

**How to avoid:**
1. **Analyze existing test files** - Parse project to learn:
   - Test file naming patterns
   - Directory structure conventions (colocated vs separate)
   - Assertion library preferences (Jest vs Chai)
   - Test organization (describe blocks, naming)
   - Custom render functions or providers
2. **Detect project framework** - Identify Next.js, Create React App, Vite, etc.
3. **Match project conventions** - Generate tests that look like project's existing tests
4. **Support customization** - Allow project-specific templates or configurations
5. **Generate test utilities** - Create project's custom render if needed

**Warning signs:**
- Test filenames don't match project patterns
- Tests don't import project's utilities
- Different assertion library than project uses
- Test structure differs from project's style

**Phase to address:**
**Phase 3: React Codebase Analysis** - Convention detection is part of codebase understanding.

---

### Pitfall 6: No Learning/Adaptation System

**What goes wrong:**
The tool:
- Doesn't remember corrections developers make
- Repeats the same mistakes across multiple recordings
- Can't adapt to project-specific patterns
- Loses knowledge when project structure changes

Developers abandon the tool because it doesn't improve over time.

**Why it happens:**
- No persistent state between tool invocations
- No feedback loop for corrections
- Each recording processed in isolation
- No model of what "good" looks like for this specific project

**How to avoid:**
1. **Store learning state** - Remember:
   - Which selectors worked vs failed
   - Manual overrides applied
   - Component-Test file mappings
   - Preferred query types per component
2. **Provide correction mechanisms** - Allow developers to:
   - Flag incorrect selections
   - Suggest better queries
   - Mark tests as needing review
3. **Apply learned knowledge** - Use history to improve future generations
4. **Export/share learnings** - Allow team-level knowledge sharing

**Warning signs:**
- Same selector failures across multiple recordings
- Developers repeatedly editing generated tests
- No way to provide feedback to the generator

**Phase to address:**
**Phase 5: Learning & Persistence** - This is a later-phase feature but should be architected early.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Generate only fireEvent | Simpler code generation | Less accurate user simulation, tests may miss bugs | Only for MVP, plan user-event in Phase 4 |
| Use data-testid exclusively | Guaranteed element selection | Fragile to refactoring, violates Testing Library principles | Only when no semantic queries available |
| Skip async handling | Faster initial generation | Intermittent test failures | Never acceptable - fix in Phase 2 |
| One-size-fits-all output | Works for any project | Doesn't match any project's conventions | MVP only, fix in Phase 3 |
| Flat test structure | Simpler code | Hard to maintain, no organization | Never acceptable |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Chrome Recorder JSON | Assuming stable format | Validate schema, handle version differences |
| Puppeteer Replay | Copying replay logic directly | Adapt E2E concepts to RTL (different paradigms) |
| React components | Not analyzing component props | Extract props from recording to generate mock data |
| Test frameworks | Hardcoding Jest assumptions | Detect and adapt to Vitest, Mocha, etc. |
| TypeScript | Generating plain JS | Analyze project for TS usage, generate accordingly |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Parse entire codebase | Slow startup, high memory | Lazy analysis, incremental parsing | Projects > 1000 components |
| Generate one file per recording | Too many small files | Batch or consolidate related tests | Large apps with many flows |
| Analyze on every run | Slower each subsequent run | Cache analysis results, invalidate on changes | CI/CD pipelines |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding real credentials from recordings | Credentials in test files | Detect and redact sensitive data |
| Recording API keys in flows | Secrets in exported JSON | Warn about sensitive data capture |
| Generating tests that require prod APIs | Tests hitting real services | Mock detection and substitution |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No preview of generated tests | Users don't know what they'll get | Show test preview before file creation |
| Overwriting existing tests | Lost work, developer frustration | Always create new files or warn before overwrite |
| No undo/rollback | Mistakes are permanent | Version control integration, undo support |
| Complex CLI only | Non-developers excluded | Consider GUI or VS Code extension |

## "Looks Done But Isn't" Checklist

- [ ] **Selector Generation:** Often missing accessibility-aware fallback chains — verify multiple query strategies implemented
- [ ] **Async Handling:** Often missing proper waitFor patterns — verify findBy queries and waitFor used appropriately
- [ ] **Component Isolation:** Often missing prop/mock extraction — verify component can render independently
- [ ] **Convention Matching:** Often missing project pattern analysis — verify tests match existing project style
- [ ] **Error Handling:** Often missing invalid JSON handling — verify graceful parsing failures
- [ ] **TypeScript:** Often missing type-aware generation — verify project TS config detected and applied

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Broken selectors | MEDIUM | Provide selector override command, re-parse with hints |
| Wrong test boundaries | MEDIUM | Allow manual component assignment, re-analyze |
| Async failures | LOW | Add waitFor/debug commands, show which queries need await |
| Convention mismatch | LOW | Re-run analysis, update configuration |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Brittle selectors | Phase 2: Core Parser | Run generated tests against refactored UI |
| Paradigm mismatch | Phase 3: Codebase Analysis | Verify tests render isolated components |
| Async issues | Phase 2: Core Parser | Test with slow network simulation |
| fireEvent usage | Phase 4: Test Generator | Verify user-event patterns |
| Convention mismatch | Phase 3: Codebase Analysis | Compare to existing test files |
| No learning | Phase 5: Learning | Test with repeated recordings |

## Sources

- Chrome DevTools Recorder Documentation: https://developer.chrome.com/docs/devtools/recorder
- Puppeteer Replay Library: https://github.com/puppeteer/replay
- React Testing Library Docs: https://testing-library.com/docs/react-testing-library/cheatsheet
- Testing Library Query Priority: https://testing-library.com/docs/queries/about
- Kent C. Dodds on fireEvent vs user-event: https://kentcdodds.com/blog/fire-event-vs-user-event
- Chrome Recorder Export Extensions: https://developer.chrome.com/docs/devtools/recorder/extensions
- Cypress Chrome Recorder (similar tool): https://github.com/cypress-io/cypress-chrome-recorder

---

*Pitfalls research for: Taro - Chrome Recorder to RTL Test Generation*
*Researched: March 6, 2026*
