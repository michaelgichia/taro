---
phase: 03-query-test-design-intelligence
plan: 06
subsystem: cli-commands
tags: [cli, pipeline-integration, js-parser, resolver, scanner, generator]
dependencies:
  requires:
    - 03-02 (js-parser)
    - 03-03 (resolver)
    - 03-04 (scanner)
    - 03-05 (template/generator multi-it)
  provides:
    - Complete Phase 3 pipeline wired into CLI
    - Single entry point: `taro generate <file>`
  affects:
    - Phase 4 (Self-Scoring)
tech-stack:
  added: []
  patterns:
    - Dual-pipeline CLI command (JS + JSON detection)
    - Playwright DOM inspection for query resolution
    - Conventions caching in .taro/conventions.json
key-files:
  created: []
  modified:
    - src/cli/commands/generate.ts (Phase 3 pipeline integration)
decisions: []
metrics:
  duration: 2 min
  completed: "2026-03-06"
---

# Phase 3 Plan 6: Wire Phase 3 Pipeline into CLI

## Summary

Wired the complete Phase 3 pipeline into the existing `taro generate` command with JS file detection. The CLI now intelligently routes between JS and JSON recording formats, invoking the appropriate pipeline.

## What Was Built

**Complete Phase 3 Pipeline Integration:**

1. **JS Detection Logic** - File extension (`.js`) or `@jest-environment-options` marker triggers JS pipeline
2. **Context Scanning** - Scans conventions on first run, caches in `.taro/conventions.json`
3. **Babel AST Parsing** - Parses Testing Library Recorder JS format via js-parser
4. **Playwright Resolution** - Resolves document.querySelector selectors via live DOM inspection
5. **Multi-it() Generation** - Generates segmented test blocks from itGroups
6. **Query Quality Summary** - Emits console output with query method counts and quality ratings

**JSON Pipeline Preserved:**
- All existing Chrome Recorder JSON handling unchanged
- Validates, parses, generates single-it() test as before

## Verification

Automated checks passed:
- `npm run build` ✓
- `npm run test:run` ✓ (24/24 tests green)

Manual verification checkpoint required per plan design.

## Usage

```bash
# JS format (Phase 3 pipeline)
taro generate recording.js
taro generate recording.js --dry-run

# JSON format (Phase 1 pipeline, unchanged)
taro generate recording.json
```

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None encountered.
