# Stack Research

**Domain:** Test Generation Tool - Chrome Recorder to React Testing Library
**Researched:** 2026-03-06
**Confidence:** MEDIUM

Note: This is a greenfield domain with no established "standard" stack. Recommendations are based on ecosystem research, existing tools in adjacent spaces (Playwright, Puppeteer, code generation tools), and modern 2025 best practices.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.7.x | Language | Essential for CLI tools with complex AST handling. Provides type safety for code generation which is critical when producing valid test code. |
| Node.js | 22.x (LTS) | Runtime | Modern LTS with native ESM support, required for modern package ecosystems. |
| @babel/parser | 7.29.x | AST parsing | Industry standard for parsing JavaScript/TypeScript. Used by ESLint, Prettier, and most code transformation tools. Essential for analyzing React component structure. |
| @babel/traverse | 7.29.x | AST traversal | Paired with parser for complete AST manipulation - needed to understand component structure (props, state, JSX). |
| @babel/template | 7.29.x | Code generation | Safe template literal support for generating test code snippets - avoids string concatenation vulnerabilities. |
| React Testing Library | 19.x | Test output format | The target testing library. Understanding its API surface is essential for generating correct tests. |
| @testing-library/dom | 10.x | DOM queries | Underlies React Testing Library - needed for selector generation. |
| commander | 12.x | CLI framework | Industry standard for Node.js CLIs. Better TypeScript support than yargs, smaller bundle. |

### Browser Automation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Playwright | 1.50.x | Browser control | Microsoft-maintained, cross-browser, active development. Superior to Puppeteer for multi-browser testing. Used for element inspection/screenshot validation. |
| @playwright/test | 1.50.x | Test runner | Can run generated tests directly. Useful for validating generated test output. |

### AST Analysis for React

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @babel/plugin-transform-react-jsx | 7.29.x | JSX handling | Required for proper JSX AST parsing and transformation. |
| @babel/preset-react | 7.29.x | React presets | Bundle of React-specific transforms - simplifies configuration. |
| @babel/preset-typescript | 7.29.x | TypeScript support | Required for parsing .tsx files. |
| eslint | 9.x | AST analysis | Provides rich API for analyzing component patterns, can use its AST utilities for code conventions detection. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.24.x | Schema validation | Validating Chrome Recorder export JSON schema before processing. |
| picocolors | 1.x | Terminal colors | Lightweight colored output for CLI. |
| ink | 5.x | Interactive CLI | If building TUI (terminal UI) for the tool. |
| conf | 13.x | Config storage | Storing user preferences and project conventions. |
| jsonpath-plus | 10.x | JSON path queries | Querying the Chrome Recorder export structure. |
| vitest | 3.x | Testing framework | Testing the tool itself. Fast, Vite-based, similar DX to generated test output. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| eslint + typescript-eslint | Linting | Essential for validating generated code quality. |
| prettier | Code formatting | Required to format generated test code. |
| vitest | Unit testing | Fast test runner for the tool. |
| Changesets | Version management | For release management if CLI is published. |

## Installation

```bash
# Core runtime and language
npm install node@22 typescript@5

# Babel for AST parsing and code generation
npm install @babel/parser@7 @babel/traverse@7 @babel/template@7
npm install @babel/plugin-transform-react-jsx@7 @babel/preset-react@7 @babel/preset-typescript@7

# React Testing Library (for API reference/types)
npm install @testing-library/dom@10 @testing-library/react@19 react@19

# CLI and utilities
npm install commander@12 zod@3 picocolors@1

# Browser automation
npm install playwright@1 @playwright/test@1

# Dev dependencies
npm install -D vitest@3 eslint@9 @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier@3
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| commander | yargs | If you prefer yargs' declarative CLI definition style. commander is more minimal. |
| commander | oclif | If you need built-in autoupdate, hooks, or enterprise features. commander is lighter. |
| Playwright | Puppeteer | Puppeteer is Google-maintained, Chromium-only. Playwright is cross-browser with better API. Use Puppeteer if you only need Chrome and want Google ecosystem. |
| Playwright | Selenium | Selenium is older, slower, harder to configure. Playwright is modern replacement. |
| @babel/parser | ts-morph | ts-morph provides higher-level TypeScript AST manipulation. Use if you only target TypeScript and want easier API. |
| @babel/parser | espree | espree is ESLint's parser, mostly for JavaScript. Use babel for full JS+TS+JSX support. |
| ESLint | Prettier | Prettier is for formatting only. ESLint provides rule-based analysis for code conventions. Use both together. |
| vitest | Jest | Jest is older, slower. Vitest is faster, Vite-based, compatible Jest API. Use Jest if you need maximum compatibility with existing test setups. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| CoffeeScript | Deprecated, no active development. | TypeScript |
| Flow | Meta (Facebook) deprecated Flow in favor of TypeScript. | TypeScript |
| tsc (alone) for AST | TypeScript compiler is for compilation, not AST manipulation. | @babel/parser + @babel/typescript |
| String concatenation for code gen | Error-prone, security risk (injection). | @babel/template |
| puppeteer (for UI inspection) | Chromium-only, less maintained than Playwright. | Playwright |
| Mocha (for tool tests) | Older, less features than vitest/jest. | Vitest |
| jscodeshift (alone) | Codemod tool, not general-purpose. | @babel/parser + @babel/traverse |
| Cypress (for inspection) | Cypress is for running E2E, not browser inspection/automation. | Playwright |

## Stack Patterns by Variant

**If targeting only Chromium:**
- Use Puppeteer instead of Playwright
- Smaller bundle, slightly faster Chromium launching
- But: lose cross-browser testing capability

**If building a library (not CLI):**
- Consider publishing as ESM module
- May want to use tsup or unbuild for bundling
- Consider vitest for test runner

**If integrating with existing tools:**
- ESLint plugin: Use eslint's plugin API directly
- VS Code extension: Use VS Code's Language Server Protocol
- Webpack loader: Use @babel/loader

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @babel/parser@7 | babel@7 packages | Ensure all @babel/* packages use same major version. |
| @testing-library/react@19 | react@18, react@19 | RTL 19 supports React 18+. |
| @playwright/test@1 | playwright@1 | Keep these in sync. |
| TypeScript@5 | ESLint@9 | Use @typescript-eslint/* packages for ESLint 9. |
| commander@12 | Node.js 18+ | Modern commander requires Node 18 minimum. |

## Chrome Recorder Export Format Notes

The Chrome Recorder exports JSON in a specific format. Based on ecosystem research:

- Chrome Recorder (Chrome DevTools) exports structured JSON with:
  - `title`: Recording name
  - `steps`: Array of interaction steps
  - `settings`: Configuration (selector types, etc.)
  - Each step has: `type`, `selector`, `value`, etc.

- Chrome also has a "Testing Library" extension that exports in Playwright/Puppeteer format
- TheRecorder panel supports extensions that can customize export format

For Taro, you'll need to:
1. Parse the JSON export format
2. Map recorded actions to Testing Library queries
3. Generate appropriate assertions
4. Handle selector conversion (Chrome's selectors may need transformation for RTL)

## Sources

- GitHub: microsoft/playwright — Verified current (v1.58.2 as of Feb 2026)
- GitHub: facebook/react — Verified current (v19.2.4 as of Jan 2026)
- GitHub: babel/babel — Verified current (v7.29.1 as of Feb 2026)
- GitHub: Microsoft/TypeScript — Verified current (v5.9.3 as of Oct 2025)
- testing-library.com — DOM Testing Library documentation
- developer.chrome.com — Chrome DevTools Recorder documentation
- GitHub: checkly/headless-recorder — Reference for recorder export patterns (deprecated but informative)
- GitHub: ChromeDevTools/devtools-protocol — Chrome DevTools Protocol reference

---

*Stack research for: Chrome Recorder to React Testing Library Test Generator*
*Researched: 2026-03-06*
