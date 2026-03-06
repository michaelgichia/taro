# Project Research Summary

**Project:** Taro - Chrome Recorder to React Testing Library Test Generator
**Domain:** Developer Tools / Test Automation
**Researched:** 2026-03-06
**Confidence:** MEDIUM-HIGH

## Executive Summary

Taro is a CLI tool that transforms Chrome DevTools Recorder exports into React Testing Library (RTL) component tests. This addresses a significant gap in the React testing ecosystem: Chrome Recorder exports E2E-style tests optimized for Playwright/Puppeteer, but modern React development increasingly prefers fast, isolated component tests using RTL. The tool parses recorder JSON, converts browser selectors to semantic RTL queries, analyzes the target codebase for component structure and testing conventions, and generates colocated test files.

Research indicates the core technical challenge is selector transformation—converting brittle CSS/XPath selectors (common in Chrome Recorder exports) into robust accessibility-based queries (getByRole, getByLabelText). This must be solved before test generation can work reliably. Secondary challenges include bridging the E2E-to-unit paradigm mismatch (where recording-level flows must map to component-level tests) and handling React's asynchronous rendering patterns. The recommended approach prioritizes a minimal parser-writer-generator pipeline in Phase 1, followed by the critical selector transformation work in Phase 2, with project analysis deferred to Phase 3.

Key risks include: generated tests may remain brittle without proper async handling (Phase 2 must address this); the paradigm mismatch between recorded flows and component tests requires careful boundary detection; and convention awareness is essential or developers will rewrite generated tests instead of using them.

## Key Findings

### Recommended Stack

The stack reflects a modern Node.js CLI built with TypeScript for type-safe code generation. Babel packages handle AST parsing and code generation—@babel/parser for input analysis, @babel/traverse for component structure inspection, and @babel/template for safe test code generation. Playwright serves as the browser automation layer for element inspection and test validation. React Testing Library 19.x and @testing-library/dom 10.x provide the target API surface for code generation. Commander 12.x offers CLI framework capabilities.

**Core technologies:**
- TypeScript 5.7.x — Essential for CLI tools with complex AST handling; provides type safety for code generation
- @babel/parser + @babel/traverse + @babel/template — Industry standard for parsing and generating code
- React Testing Library 19.x — Target testing library; understanding its API surface is essential
- Playwright 1.50.x — Cross-browser automation superior to Puppeteer
- commander 12.x — Lightweight CLI framework with excellent TypeScript support

### Expected Features

**Must have (table stakes):**
- Chrome Recorder JSON parsing — Core input format; must handle all step types (click, fill, select, scroll, assert)
- Valid RTL query generation — Must generate getByRole, getByText, getByLabelText—not CSS selectors
- Test structure generation — Proper describe/it blocks with imports
- Jest/Vitest compatibility — Standard React test runners
- Test file creation — Write valid .test.js files to filesystem

**Should have (competitive):**
- Project convention analysis — Detect existing test patterns (naming, folder structure, query preferences)
- Smart selector-to-query conversion — Convert aria selectors to getByRole, label text to getByLabelText
- Test colocation — Place .test.js files next to component files
- Multiple selector fallback — Try alternatives if primary selector fails

**Defer (v2+):**
- Learning state — Remember user corrections over time (Phase 5)
- Incremental test updates — Merge generated code with manual edits
- Custom convention support — Project-specific patterns

### Architecture Approach

The architecture follows a pipeline pattern: Parser normalizes Chrome Recorder JSON → Analyzer inspects the codebase for component structure and conventions → Generator transforms steps to RTL test code → Writer creates test files. Key components include the Convention Store (persists learned project patterns), Project Context (current project configuration), and Learning Store (remembers selector preferences).

**Major components:**
1. Parser — Validates and normalizes Chrome Recorder JSON export to internal step representations
2. Analyzer — Inspects codebase via AST parsing to extract component metadata and detect conventions
3. Generator — Transforms parsed steps to RTL test code using template engine and selector strategies
4. Writer — Handles file operations, path resolution, and colocated test placement

### Critical Pitfalls

1. **Brittle CSS/XPath Selectors** — Chrome Recorder exports selectors that break with generated class names, DOM changes, and React production builds. Must implement selector transformation to semantic queries (getByRole, getByLabelText) with fallback chains. Address in Phase 2.

2. **E2E-to-Unit Paradigm Mismatch** — Recorded flows span the entire app but RTL tests should isolate components. Must detect component boundaries and generate component-scoped tests, not full app renders. Address in Phase 3.

3. **Ignoring Async/Wait Patterns** — React's asynchronous rendering causes race conditions. Generated tests must use findBy* queries and waitFor patterns. Address in Phase 2.

4. **Using fireEvent Instead of user-event** — fireEvent doesn't simulate real user behavior. Must map event types to user-event functions (click → userEvent.click, type → userEvent.type). Address in Phase 4.

5. **No Convention Awareness** — Generic test generation ignores project patterns. Generated tests feel foreign and developers rewrite them. Must analyze existing test files to match project conventions. Address in Phase 3.

## Implications for Roadmap

Based on research, the following phase structure is recommended:

### Phase 1: Core Pipeline
**Rationale:** Establishes the basic processing flow with minimal dependencies; enables early validation of the core concept.
**Delivers:** Working CLI that parses Chrome Recorder JSON and generates basic test structure
**Addresses:** Chrome Recorder JSON parsing, test structure generation, test file creation, Jest/Vitest compatibility
**Avoids:** Nothing critical—this is the foundation

### Phase 2: Selector Transformation Engine
**Rationale:** This is the critical technical challenge; brittle selectors make tests fail in production. Must be solved before meaningful test generation is possible.
**Delivers:** Robust selector-to-query conversion with fallback chains, proper async handling using findBy queries and waitFor patterns
**Addresses:** Valid RTL query generation, smart selector-to-query conversion, async/wait patterns
**Avoids:** Pitfall 1 (brittle selectors), Pitfall 3 (async issues)
**Research flag:** Complex—selector strategy pattern needs careful implementation; may need to research specific RTL query priority rules

### Phase 3: Project Analysis & Conventions
**Rationale:** Convention matching determines whether developers accept generated tests; paradigm mismatch resolution requires understanding component boundaries.
**Delivers:** Codebase analyzer that extracts component metadata, detects test file conventions, generates component-scoped tests
**Addresses:** Project convention analysis, test colocation, component flow detection
**Avoids:** Pitfall 2 (paradigm mismatch), Pitfall 5 (convention mismatch)
**Research flag:** Analyzer performance on large codebases—may need caching strategy

### Phase 4: Test Generator Refinement
**Rationale:** Refines the generated test quality with user-event simulation instead of fireEvent.
**Delivers:** Tests using user-event library for accurate user behavior simulation
**Addresses:** fireEvent to user-event conversion, assertion generation improvements
**Avoids:** Pitfall 4 (fireEvent usage)

### Phase 5: Learning & Persistence (v2)
**Rationale:** Adds differentiation through continuous improvement; builds moat by learning project-specific patterns.
**Delivers:** Persistent store for selector preferences, correction mechanisms, incremental test updates
**Addresses:** Learning state, incremental test updates
**Avoids:** Pitfall 6 (no learning system)

### Phase Ordering Rationale

- Phase 1 before Phase 2: Need basic pipeline working before tackling selector transformation
- Phase 2 before Phase 3: Selector conversion is prerequisite for meaningful codebase analysis
- Phase 3 before Phase 4: Need convention awareness to generate quality tests before refinement
- Phase 5 last: Learning system depends on all other components being stable

The critical path runs through Phase 2 (selector transformation) as it addresses the most severe pitfalls. Async handling is embedded in Phase 2 rather than deferred because intermittent test failures destroy user trust.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Complex selector strategy implementation—RTL query priority rules need careful research
- **Phase 3:** Analyzer performance optimization for large codebases

Phases with standard patterns (skip research-phase):
- **Phase 1:** Well-documented input format (Chrome Recorder JSON) and output format (RTL)
- **Phase 4:** user-event API is well-documented; straightforward implementation

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Greenfield domain with no established standard; recommendations based on ecosystem research and adjacent tools |
| Features | HIGH | Clear table stakes from Chrome Recorder documentation and RTL ecosystem; differentiators well-understood |
| Architecture | MEDIUM | Pipeline pattern is standard; selector strategy pattern well-documented; convention learning is novel |
| Pitfalls | HIGH | Derived from extensive RTL/Testing Library experience documented by Kent C. Dodds and community |

**Overall confidence:** MEDIUM-HIGH

Research is grounded in well-documented APIs (Chrome Recorder, RTL) and established patterns. Uncertainty exists around convention learning—a novel approach without proven precedent—and selector transformation edge cases that will emerge only during implementation.

### Gaps to Address

- **Chrome Recorder export format variations:** Research assumed standard JSON structure; may need to handle extensions or custom exporters
- **Convention detection accuracy:** No established algorithms for detecting test patterns; may need iterative refinement
- **Large codebase performance:** Analyzer scaling not validated; may require significant optimization work
- **Learning system design:** Novel approach without reference implementations; may need pivoting based on user feedback

## Sources

### Primary (HIGH confidence)
- Chrome DevTools Recorder Documentation (developer.chrome.com/docs/devtools/recorder) — Input format verification
- React Testing Library Docs (testing-library.com) — Target output format, query priority rules
- Kent C. Dodds on fireEvent vs user-event — Critical pitfall guidance

### Secondary (MEDIUM confidence)
- Playwright Codegen — Comparison benchmark for similar tools
- Puppeteer Replay (GitHub) — JSON format reference
- Babel documentation — AST parsing patterns

### Tertiary (LOW confidence)
- Convention learning approach — Novel; needs validation through implementation
- Large codebase analyzer performance — Theoretical; needs real-world testing

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
