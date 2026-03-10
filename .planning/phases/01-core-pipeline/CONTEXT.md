# Phase 1 Context: Core Pipeline

**Phase:** 1 of 4
**Goal:** Users can invoke Tayo from CLI and generate valid RTL tests from Chrome Recorder exports

## CLI Commands

### Setup & Discovery
```bash
tayo init           # Scaffold Tayo internal state, config, conventions
tayo map-codebase   # Deep discovery - read tests, components, mocks, patterns
```

### Generation
```bash
tayo generate ./recordings/add-sale-ke.js    # Single file
tayo generate ./recordings/                  # Batch mode
```

### Maintenance
```bash
tayo remap   # Full rediscovery after structural changes
tayo sync    # Light update without full rediscovery
```

### Inspection & Debugging
```bash
tayo inspect ./recordings/add-sale-ke.js     # Preview without writing
tayo score ./src/path/TestFile.test.tsx     # Quality audit
```

### State Management
```bash
tayo state show   # Show current project knowledge
tayo state reset # Wipe internal state
```

## Instructions Files

Per-generation instructions override default behavior:
```bash
tayo generate ./recordings/flow.js -i ./instructions/flow.md
```

Instructions can specify:
- Mock overrides (use specific factory)
- Scope hints (happy path only)
- Naming directives (specific file names)
- Assertion guidance (keep specific assertions)
- Exclusion rules (ignore certain interactions)

Global instructions via:
```bash
tayo init --global-instructions ./tayo-instructions.md
```

## Requirements (from Roadmap)

- CLI-01, CLI-02 (CLI Interface)
- INPT-01, INPT-02, INPT-03 (Core Input Processing)
- GEN-01, GEN-02, GEN-03, GEN-04, GEN-05 (Test Generation)

## Design Principles

- Instructions augment Tayo's decisions, not replace them
- Conflicts with core quality rules should be flagged
- Instructions files are committable (audit trail)
- Tayo is a stateful agent that lives in the project
