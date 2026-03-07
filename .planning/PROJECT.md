# Taro

## What This Is

Taro is an agent-agnostic skill that transforms Chrome Recorder exports into production-quality React Testing Library tests. Developers record user flows in Chrome DevTools, export via the Testing Library Recorder extension, and hand them to Taro, which generates tests that reflect real user interactions, scores its own output, and learns project conventions over time through local `.taro/` state.

## Core Value

Reduce the effort to write and maintain tests by automatically generating high-quality, codebase-aware React Testing Library tests from browser recordings, so developers spend less time testing and more time building.

## Current State

- **Shipped version:** v1.0 on 2026-03-07
- **Pipeline:** Chrome Recorder JSON and Testing Library Recorder JS both flow through generation
- **Quality layer:** scoring, post-write verification, and convention learning are active
- **Intelligence layer:** recording cleanup, dialog-aware visual capture, and mock analysis are implemented
- **Archive status:** v1.0 roadmap, requirements, and audit are stored in `.planning/milestones/`

## Requirements

### Validated

- ✓ Core pipeline from recorder input to generated test file output — v1.0
- ✓ Codebase-aware query and test-design intelligence — v1.0
- ✓ Self-scoring, post-write verification, and convention learning — v1.0
- ✓ Recording, visual, and mock intelligence recovery — v1.0

### Active

- [ ] Comprehensive README for public developers
- [ ] npm package published as `@tayo/rtl`
- [ ] Package fields and build verified for npm distribution

### Out of Scope

- [Non-React frameworks] — focused on React ecosystem only
- [Real-time recording during test execution] — input is exported recordings, not live capture
- [Test maintenance/updates] — v1 focuses on generation only

## Current Milestone: v1.1 Documentation & Deployment

**Goal:** Make Taro publicly installable and well-documented so any developer can discover, install, and use it.

**Target features:**
- Comprehensive README covering install, setup, `taro generate` usage, configuration, examples, and Claude skill integration
- npm package published as `@tayo/rtl` so `npx @tayo/rtl generate ./recording.js` works out of the box
- Package preparation: `files` field, version bump, build verification, `.npmignore`

## Context

- **Codebase size:** ~4,093 LOC TypeScript in `src/`
- **Input:** Chrome DevTools Recorder exports (JSON) and Testing Library Recorder JS
- **Target:** React/Next.js applications using React Testing Library
- **Integration:** Single command invoked from project root (`taro generate ./recordings/flow.js`)
- **State:** Local files in `.taro/` directory
- **Archive:** v1.0 planning artifacts live in `.planning/milestones/`

## Constraints

- **Framework**: React apps only (v1)
- **Testing Library**: React Testing Library (RTL)
- **Input Format**: Chrome Recorder JSON exports
- **CLI**: Must work as a skill/agent tool, not a GUI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Colocate tests with components | Matches React ecosystem best practices, easier to find | Pending next milestone |
| Local file state (.taro/) | No external dependencies, developer owns data | Implemented in v1.0 |
| Single command interface | Simple workflow, fits agent/CI integration | Implemented in v1.0 |
| Playwright for DOM and visual inspection | Already in React ecosystem, robust screenshot/state capabilities | Implemented in v1.0 |
| Advisory scoring instead of blocking writes | Preserve generation flow while still surfacing quality signals | Implemented in v1.0 |
| Gap recovery via Phases 5-7 | Recover missing roadmap scope without rewriting history | Implemented in v1.0 |

---
*Last updated: 2026-03-07 after v1.1 milestone start*
