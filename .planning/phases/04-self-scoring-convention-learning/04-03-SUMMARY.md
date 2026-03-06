---
phase: 04-self-scoring-convention-learning
plan: 03
subsystem: convention-learning
tags:
  - convention-learning
  - ast-analysis
  - pattern-detection
  - tdd

dependency_graph:
  requires:
    - 04-01 (Scorer Infrastructure)
    - 04-02 (Pre-Write Audit and Post-Write Verification)
  provides:
    - Convention analyzer module
    - TestConvention type system
    - learnConventions() API
  affects:
    - 04-04 (Convention Application)

tech_stack:
  added:
    - "@typescript-eslint/typescript-estree (already in deps)"
  patterns:
    - AST-based pattern detection
    - Convention merging from multiple sources

key_files:
  created:
    - src/learner/types.ts (71 lines)
    - src/learner/index.ts (121 lines)
    - src/learner/analyzer.ts (582 lines)

decisions_made:
  - "Used @typescript-eslint/typescript-estree for AST parsing (aligned with 04-01)"
  - "Naming pattern detection: camelCase, kebab-case, snake_case detection from describe block names"
  - "Convention merging: OR logic for structure, union for queries/matchers/imports"

metrics:
  completed: 2026-03-06
  duration: 5 min
  tasks_completed: 2/2
---

# Phase 4 Plan 3 Summary: Convention Learning Module

## Objective
Create convention learning module that analyzes existing test patterns. Implements CNV-01 (Taro derives conventions from observation).

## Tasks Completed

### Task 1: Set up learner module structure ✓

**Commit:** `9c834f6`

**Changes:**
- Created `src/learner/types.ts` with `TestConvention` interface
- Created `src/learner/index.ts` with `learnConventions()` and `ConventionStore`

**Key exports:**
- `TestConvention` - interface covering naming, structure, queries, matchers, imports
- `learnConventions(testDir: string)` - main entry point
- `ConventionStore` - class for managing learned conventions

### Task 2: Implement convention analyzer ✓

**Commit:** `f73d512`

**Changes:**
- Created `src/learner/analyzer.ts` with full AST-based analysis

**Features:**
- `analyzeTestFile(filePath)` - extract conventions from single test file
- `extractConventions(testDir)` - analyze all test files in directory
- Naming pattern detection: camelCase, kebab-case, snake_case
- Query preference extraction: getByRole, getByLabelText, etc.
- Matcher pattern extraction: toBeInTheDocument, toHaveValue, etc.
- Import pattern extraction
- Structure pattern detection: describePerComponent, setupLocation

## Verification

All success criteria met:
- [x] TestConvention type covers naming, structure, queries, matchers, imports
- [x] analyzeTestFile returns partial convention for single file
- [x] extractConventions combines multiple files into unified convention
- [x] Naming pattern detection works for camelCase, kebab-case, snake_case

## Usage Example

```typescript
import { learnConventions, ConventionStore } from './src/learner/index.js';

// Learn from existing test files
const conventions = learnConventions('./src/__tests__');

console.log(conventions.naming.pattern);      // 'camelCase' | 'kebab-case' | 'snake_case'
console.log(conventions.queries.preferred);    // ['getByRole', 'getByLabelText', ...]
console.log(conventions.matchers.common);      // ['toBeInTheDocument', 'toHaveValue', ...]

// Store conventions for later use
const store = new ConventionStore();
store.add('my-project', conventions);
```

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies

This plan built upon:
- 04-01: Scorer Infrastructure (provided AST parsing foundation)
- 04-02: Pre-Write Audit and Post-Write Verification (provided quality gates AST logic)

This plan enables:
- 04-04: Convention Application (applying learned conventions to generated tests)
