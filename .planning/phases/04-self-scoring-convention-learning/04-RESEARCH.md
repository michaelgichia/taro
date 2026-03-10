# Phase 4: Self-Scoring & Convention Learning - Research

**Phase:** 04-self-scoring-convention-learning
**Research Date:** 2026-03-07
**Status:** Research Complete

---

## Executive Summary

Phase 4 adds self-scoring and convention learning to Tayo's test generation pipeline. This phase evaluates generated test quality before writing, verifies syntax after writing, and accumulates historical data to improve future runs. The implementation builds on existing Phase 1-3 infrastructure without modifying the core generation logic.

**Key Findings:**
- Multi-dimensional scoring can reuse `QueryResult[]` from generator.ts
- Pre-write audit integrates as checkpoint in generate.ts pipeline
- Post-write verification reuses @babel/parser (already a dependency)
- History.json and conventions.json updates follow existing file I/O patterns

---

## 1. Technical Approach for Multi-Dimensional Scoring

### 1.1 Query Quality Dimension

The query quality dimension evaluates the accessibility-first query methods used in generated tests.

**Implementation Strategy:**
- Use `GeneratedTestV3.queryResults[]` from generator.ts as input
- Map each query method to its weight:
  - `getByRole` = 1.0 (excellent - full accessibility support)
  - `getByLabelText` = 0.8 (very good - label association)
  - `getByText` = 0.6 (good - text content)
  - `getByPlaceholderText` = 0.5 (acceptable - placeholder is fragile)
  - `getByTestId` = 0.2 (fragile - test-only attribute)

**Code Location:** New file `src/core/scorer.ts`

**Calculation:**
```typescript
function calculateQueryScore(queryResults: QueryResult[]): number {
  if (queryResults.length === 0) return 100 // No queries to evaluate

  const weights: Record<string, number> = {
    getByRole: 1.0,
    getByLabelText: 0.8,
    getByText: 0.6,
    getByPlaceholderText: 0.5,
    getByTestId: 0.2,
    // Default to 0.3 for unknown methods
  }

  const totalWeight = queryResults.reduce((sum, qr) => {
    return sum + (weights[qr.method] ?? 0.3)
  }, 0)

  return Math.round((totalWeight / queryResults.length) * 100)
}
```

### 1.2 Assertion Specificity Dimension

This dimension evaluates whether assertions use specific matchers or generic ones.

**Scoring Logic:**
- Strong assertions (score = 1.0 each):
  - `toHaveValue()` - specific value check
  - `toBeChecked()` - checkbox state
  - `toHaveTextContent()` - text content
  - `toBeVisible()` - visibility
- Weak assertions (score = 0.3 each):
  - `toBeInTheDocument()` only - generic existence

**Implementation Strategy:**
- Parse the generated test code using regex or AST
- Count strong vs weak assertions
- Calculate percentage of strong assertions

**Regex Pattern for Assertion Detection:**
```typescript
const strongMatcherRegex = /\.toHaveValue\(|\.toBeChecked\(|\.toHaveTextContent\(|\.toBeVisible\(/g
const weakOnlyRegex = /\.toBeInTheDocument\(\)(?!\s*\.)/g
```

### 1.3 Test Structure Dimension

This dimension evaluates the organization of test code.

**Scoring Criteria:**
- Presence of `describe()` = +20 bonus
- Multiple `it()` blocks (≥2) = +15 per additional block
- Single monolithic `it()` with many steps = penalty

**Calculation:**
```typescript
function calculateStructureScore(code: string): number {
  const describeCount = (code.match(/describe\s*\(/g) ?? []).length
  const itCount = (code.match(/it\s*\(/g) ?? []).length

  let score = 50 // Base score

  // Bonus for describe block
  if (describeCount > 0) score += 20

  // Bonus for multiple it blocks
  if (itCount >= 2) {
    score += Math.min((itCount - 1) * 10, 30) // Cap at +30
  }

  // Penalty for single monolithic it (many lines without structure)
  const monolithicPenalty = itCount === 1 && code.length > 2000 ? -20 : 0

  return Math.max(0, Math.min(100, score + monolithicPenalty))
}
```

### 1.4 Aggregate Score Calculation

**Weighted Average:**
```typescript
function calculateAggregateScore(
  queryScore: number,
  assertionScore: number,
  structureScore: number
): { total: number; grade: string } {
  // Weight: query 40%, assertions 35%, structure 25%
  const weighted = (queryScore * 0.4) + (assertionScore * 0.35) + (structureScore * 0.25)
  const total = Math.round(weighted)

  const grade = total >= 90 ? 'A' :
                total >= 80 ? 'B' :
                total >= 70 ? 'C' :
                total >= 60 ? 'D' : 'F'

  return { total, grade }
}
```

**Output Format:**
```
[tayo] Score: 78/100 (B) — query: 85, assertions: 70, structure: 80
```

---

## 2. Pre-Write Audit Integration

### 2.1 Pipeline Position

The pre-write audit runs after test generation but before file writing. This is already implied in the context:

```
parse → validate → generate → [SCORE] → write → [VERIFY] → [UPDATE CONVENTIONS]
```

### 2.2 Integration in generate.ts

**Location:** `src/cli/commands/generate.ts`

**Insertion Point:** After `generateTestFromGroups()` and before `writeTestFile()`

```typescript
// After generation (around line 140 in current generate.ts)
const scoreResult = scoreGeneratedTest(generated.code, queryResults)

console.log(
  pc.dim('[tayo]') + ` Score: ${scoreResult.total}/100 (${scoreResult.grade}) — ` +
  `query: ${scoreResult.dimensions.queryQuality}, ` +
  `assertions: ${scoreResult.dimensions.assertionSpecificity}, ` +
  `structure: ${scoreResult.dimensions.testStructure}`
)

// Emit hints for low-scoring dimensions
if (scoreResult.dimensions.queryQuality < 60) {
  const testIdCount = queryResults.filter(qr => qr.method === 'getByTestId').length
  console.log(pc.yellow(`[tayo] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`))
}

if (scoreResult.dimensions.assertionSpecificity < 60) {
  console.log(pc.yellow('[tayo] Tip: Add specific matchers like toHaveValue() for better assertions'))
}

if (scoreResult.dimensions.testStructure < 60) {
  console.log(pc.yellow('[tayo] Tip: Split into multiple it() blocks for better test organization'))
}

// Continue to write regardless of score
const result = await writeTestFile(generated.code, outputPath, { ... })
```

### 2.3 Hints Implementation

**Hint Generation Rules:**
- Query < 60: Count getByTestId queries, suggest adding aria-labels
- Assertions < 60: Suggest specific matchers based on element types
- Structure < 60: Suggest splitting into multiple it() blocks

---

## 3. Post-Write Verification Integration

### 3.1 Babel Parser Integration

The `@babel/parser` package is already in dependencies (used in js-parser.ts).

**Verification Function:**
```typescript
import * as babelParser from '@babel/parser'

export interface VerificationResult {
  valid: boolean
  error?: string
}

export function verifySyntax(code: string, filePath: string): VerificationResult {
  try {
    // Determine parser options based on file extension
    const isTsx = filePath.endsWith('.tsx')
    const isTs = filePath.endsWith('.ts')

    const plugins = isTsx ? ['typescript', 'jsx'] :
                    isTs ? ['typescript'] :
                    ['jsx']

    babelParser.parse(code, {
      sourceType: 'module',
      plugins,
    })

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown parse error'
    }
  }
}
```

### 3.2 Integration in generate.ts

**Insertion Point:** After successful file write

```typescript
// After writeTestFile succeeds
const verification = verifySyntax(generated.code, outputPath)

if (!verification.valid) {
  console.error(pc.red('[tayo] Error: Post-write verification failed'))
  console.error(pc.red(`  ${verification.error}`))
  process.exit(1)
}

console.log(pc.green('[tayo] ✓ post-write verified'))
```

---

## 4. Data Structures

### 4.1 Score Types (New File: src/types/score.ts)

```typescript
export interface ScoreDimensions {
  queryQuality: number       // 0-100
  assertionSpecificity: number // 0-100
  testStructure: number       // 0-100
}

export interface ScoreResult {
  total: number              // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  dimensions: ScoreDimensions
}

export interface HistoryEntry {
  timestamp: string          // ISO 8601
  recordingFile: string      // Input file path
  score: number             // 0-100
  grade: string
  dimensions: ScoreDimensions
}
```

### 4.2 History.json Schema

**File:** `.tayo/history.json`

```typescript
// Array of HistoryEntry
[
  {
    "timestamp": "2026-03-07T10:30:00.000Z",
    "recordingFile": "/path/to/recording.json",
    "score": 78,
    "grade": "B",
    "dimensions": {
      "queryQuality": 85,
      "assertionSpecificity": 70,
      "testStructure": 80
    }
  }
]
```

### 4.3 Conventions Update Strategy

**Merge Strategy:** Additive, don't overwrite existing majority votes

**Implementation:** Create new function `mergeConventions()` in scanner.ts:

```typescript
export async function mergeConventions(
  projectRoot: string,
  newPatterns: Partial<ConventionFile>
): Promise<void> {
  const existing = await readConventions(projectRoot)

  if (!existing) {
    // No existing conventions, use defaults
    return
  }

  // Analyze new patterns from generated file
  const updated: ConventionsSchema = { ...existing }

  // Additive merge: don't change majority vote unless new pattern is strong
  if (newPatterns.importStyle && newPatterns.importStyle !== existing.importStyle) {
    // Only update if existing is unknown or same pattern appears multiple times
    // For now, skip to maintain stability
  }

  await persistConventions(projectRoot, updated)
}
```

---

## 5. Edge Cases and Pitfalls

### 5.1 Empty Query Results

**Scenario:** No query results available (e.g., dry-run mode or no selectors resolved)

**Handling:**
- Query dimension defaults to 100 if no queries to evaluate
- Log informational message: `[tayo] Score: --/100 (N/A) — no queries to evaluate`

### 5.2 Parse Errors in Generated Code

**Scenario:** Babel parser fails on generated code

**Handling:**
- This should never happen with correct template generation
- If it does, treat as critical bug: exit 1 with clear error
- Add to error message: "This is a Tayo bug. Please report it."

### 5.3 History File Growth

**Scenario:** history.json grows unbounded over many runs

**Phase 4 Decision:** No pruning in Phase 4
- History is append-only per requirements
- Future phase can add rotation or stats display
- Note: For very large histories, consider JSON streaming for reads

### 5.4 Concurrent Writes

**Scenario:** Multiple Tayo processes running simultaneously

**Handling:**
- Use file system locking or atomic writes
- For Phase 4: Simple append is acceptable (low contention expected)
- Future: Use `fs.promises.writeFile` with flag `'ax'` to fail if exists

### 5.5 Invalid History JSON

**Scenario:** history.json is corrupted or invalid

**Handling:**
- Read with try/catch
- If invalid, back up corrupted file and start fresh
- Log warning: `[tayo] Warning: history.json corrupted, starting fresh`

### 5.6 Score Threshold Edge Cases

**Scenario:** All dimensions score perfectly (100)

**Handling:**
- Grade = "A+" (special case for perfect score)
- No hints emitted (nothing to improve)

**Scenario:** Score exactly 60 (boundary)

**Handling:**
- Grade = "D" (per standard thresholds)
- Hints should NOT be emitted (threshold is < 60, not ≤ 60)

---

## 6. Implementation Files

### 6.1 New Files Required

| File | Purpose |
|------|---------|
| `src/core/scorer.ts` | Core scoring logic for all three dimensions |
| `src/types/score.ts` | TypeScript types for scores and history |
| `src/core/verifier.ts` | Post-write syntax verification |

### 6.2 Modified Files

| File | Changes |
|------|---------|
| `src/cli/commands/generate.ts` | Add pre-write audit, post-write verification, history append |
| `src/core/scanner.ts` | Export `persistConventions`, add `mergeConventions` |

### 6.3 No Changes Required

| File | Reason |
|------|--------|
| `src/core/generator.ts` | Already produces GeneratedTestV3 with queryResults |
| `src/core/writer.ts` | Post-write runs after writer completes |
| `src/core/resolver.ts` | Already provides query quality via QueryResult |

---

## 7. Testing Strategy

### 7.1 Unit Tests for Scorer

```typescript
// scorer.test.ts
describe('calculateQueryScore', () => {
  it('returns 100 for empty query results', () => {
    expect(calculateQueryScore([])).toBe(100)
  })

  it('returns 100 for all getByRole queries', () => {
    const queries = [{ method: 'getByRole', quality: 'excellent' }]
    expect(calculateQueryScore(queries)).toBe(100)
  })

  it('calculates weighted average correctly', () => {
    const queries = [
      { method: 'getByRole', quality: 'excellent' },
      { method: 'getByTestId', quality: 'fragile' }
    ]
    // (1.0 + 0.2) / 2 = 0.6 = 60
    expect(calculateQueryScore(queries)).toBe(60)
  })
})
```

### 7.2 Integration Tests

- Test full pipeline with sample recordings
- Verify score output format matches specification
- Verify history.json append works
- Verify syntax verification catches malformed output

---

## 8. Summary

Phase 4 implementation is straightforward given the existing codebase:

1. **Scoring** - New `scorer.ts` module processes `GeneratedTestV3.queryResults[]` and generated code
2. **Pre-write audit** - Simple checkpoint in `generate.ts` that logs score and hints
3. **Post-write verification** - Reuses existing `@babel/parser` dependency
4. **History tracking** - Append to `.tayo/history.json` with new types
5. **Convention learning** - Re-scan generated file, merge into conventions.json

**Risk Level:** Low - Implementation builds on stable Phase 1-3 infrastructure without modifying core generation logic.

---

## RESEARCH COMPLETE
