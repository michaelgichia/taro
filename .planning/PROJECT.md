# Taro

## What This Is

Taro is an agent-agnostic skill that transforms Chrome Recorder exports into production-quality React Testing Library tests. Developers record user flows in Chrome DevTools, export via the Testing Library Recorder extension, and hand it to Taro — which generates tests that reflect real user interactions, scores its own output, and learns project conventions over time through local `.taro/` state.

## Core Value

Reduce the effort to write and maintain tests by automatically generating high-quality, codebase-aware React Testing Library tests from browser recordings, so developers spend less time testing and more time building.

## Requirements

### Validated

- ✓ Taro accepts a Chrome Recorder export file as input — Phases 1-4
- ✓ Taro reads and understands the codebase conventions — Phases 3-4
- ✓ Taro generates React Testing Library tests from recordings — Phases 1-4
- ✓ Taro maintains internal state to improve over time — Phase 4

### Active

- [ ] Taro writes tests colocated with components

### Out of Scope

- [Non-React frameworks] — focused on React ecosystem only
- [Real-time recording during test execution] — input is exported recordings, not live capture
- [Test maintenance/updates] — v1 focuses on generation only

## Context

- **Input**: Chrome DevTools Recorder exports (JSON format from Testing Library Recorder extension)
- **Target**: React/Next.js applications using React Testing Library
- **Integration**: Single command invoked from project root (`taro generate ./recordings/flow.js`)
- **State**: Local files in `.taro/` directory
- **Output**: Test files written alongside components, following existing conventions

## Constraints

- **Framework**: React apps only (v1)
- **Testing Library**: React Testing Library (RTL)
- **Input Format**: Chrome Recorder JSON exports
- **CLI**: Must work as a skill/agent tool, not a GUI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Colocate tests with components | Matches React ecosystem best practices, easier to find | — Pending |
| Local file state (.taro/) | No external dependencies, developer owns data | Implemented across Phases 3-4 |
| Single command interface | Simple workflow, fits agent/CI integration | Implemented in Phase 1 |
| Playwright for UI inspection | Already in React ecosystem, robust screenshot capabilities | Implemented in Phase 3 |

---
*Last updated: 2026-03-07 after Phase 4*
