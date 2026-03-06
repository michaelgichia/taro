# Phase 1 Context: Core Pipeline

**Phase:** 1 of 4
**Goal:** Users can invoke Taro from CLI and generate valid RTL tests from Chrome Recorder exports

## CLI Commands

### Setup & Discovery
```bash
taro init           # Scaffold Taro internal state, config, conventions
taro map-codebase   # Deep discovery - read tests, components, mocks, patterns
```

### Generation
```bash
taro generate ./recordings/add-sale-ke.js    # Single file
taro generate ./recordings/                  # Batch mode
```

### Maintenance
```bash
taro remap   # Full rediscovery after structural changes
taro sync    # Light update without full rediscovery
```

### Inspection & Debugging
```bash
taro inspect ./recordings/add-sale-ke.js     # Preview without writing
taro score ./src/path/TestFile.test.tsx     # Quality audit
```

### State Management
```bash
taro state show   # Show current project knowledge
taro state reset # Wipe internal state
```

## Instructions Files

Per-generation instructions override default behavior:
```bash
taro generate ./recordings/flow.js -i ./instructions/flow.md
```

Instructions can specify:
- Mock overrides (use specific factory)
- Scope hints (happy path only)
- Naming directives (specific file names)
- Assertion guidance (keep specific assertions)
- Exclusion rules (ignore certain interactions)

Global instructions via:
```bash
taro init --global-instructions ./taro-instructions.md
```

## Requirements (from Roadmap)

- CLI-01, CLI-02 (CLI Interface)
- INPT-01, INPT-02, INPT-03 (Core Input Processing)
- GEN-01, GEN-02, GEN-03, GEN-04, GEN-05 (Test Generation)

## Design Principles

- Instructions augment Taro's decisions, not replace them
- Conflicts with core quality rules should be flagged
- Instructions files are committable (audit trail)
- Taro is a stateful agent that lives in the project
