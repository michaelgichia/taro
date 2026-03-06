# Phase 4: Self-Scoring & Convention Learning - Research

**Researched:** 2026-03-06
**Domain:** Test Quality Scoring, Convention Analysis, Pattern Learning
**Confidence:** HIGH

## Summary

Phase 4 implements self-scoring and convention learning capabilities for Taro. Self-scoring evaluates generated test quality before and after file creation using AST analysis. Convention learning analyzes existing test patterns in the codebase and persists them for future runs.

The standard approach combines `@typescript-eslint/typescript-estree` for AST parsing with ESLint rules for quality gates. Convention storage uses SQLite (via `better-sqlite3`) for local persistence in `.taro/`. Pre-write audits validate test structure via AST traversal. Post-write verification runs syntax and import checks.

**Primary recommendation:** Implement scoring infrastructure first, then convention learning. Use ESLint rules as the foundation for quality gates.

---

## Standard Stack

### Core Libraries for Self-Scoring

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @typescript-eslint/typescript-estree | 8.x | Parse TypeScript code to AST | Official ESLint parser, TypeScript-aware |
| ESLint | 9.x | Quality rule engine | Industry standard for code linting |
| typescript | 5.x | Type checking | Already in project dependencies |

### Convention Storage

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | 11.x | Synchronous SQLite | Fast local storage, no external deps |
| sql.js | 1.x | WebAssembly SQLite | When native modules problematic |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | 1.x | Terminal colors | CLI output (already installed) |
| zod | 3.x | Schema validation | Validate convention data structures |

**Installation:**

```bash
# Core runtime
npm install @typescript-eslint/typescript-estree eslint typescript better-sqlite3

# Development
npm install -D @types/better-sqlite3
```

---

## Architecture Patterns

### Recommended Project Structure for Phase 4

```
src/
├── scorer/
│   ├── index.ts              # Scoring orchestrator
│   ├── quality-gates.ts      # Quality criteria evaluation
│   ├── pre-audit.ts         # Pre-write structural validation
│   ├── post-verify.ts       # Post-write syntax/import checks
│   └── rules/                # Custom ESLint rules
│       ├── no-fragile-queries.ts
│       ├── no-empty-tests.ts
│       └── require-matchers.ts
├── learner/
│   ├── index.ts              # Learning orchestrator
│   ├── analyzer.ts           # Test pattern analysis
│   ├── extractor.ts          # Convention extraction
│   ├── storage.ts            # SQLite persistence
│   └── cache.ts              # Convention caching
├── scorer.ts                 # Main export
└── learner.ts                # Main export
```

### Pattern 1: Pre-Write Audit (SCR-02)

**What:** Validate test structure before file creation
**When to use:** After test code generation, before writing to filesystem

```typescript
// Source: AST-based validation pattern
import { parse } from '@typescript-eslint/typescript-estree';

interface QualityScore {
  overall: number;      // 0-100
  criteria: {
    structure: number;   // Has describe/it blocks
    queries: number;     // Uses robust queries
    matchers: number;    // Has meaningful assertions
    noFragility: number; // No brittle selectors
  };
  issues: string[];
}

function preWriteAudit(code: string): QualityScore {
  const ast = parse(code, { loc: true, range: true });
  const issues: string[] = [];
  
  let hasDescribe = false;
  let hasIt = false;
  let robustQueries = 0;
  let fragileQueries = 0;
  let hasMatchers = false;
  
  function visit(node: any) {
    // Check for describe block
    if (node.type === 'CallExpression' && 
        node.callee?.name === 'describe') {
      hasDescribe = true;
    }
    
    // Check for test/it block
    if (node.type === 'CallExpression' && 
        node.callee?.name === 'it' || node.callee?.name === 'test') {
      hasIt = true;
    }
    
    // Check query methods
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const method = node.callee.property?.name;
      if (['getByRole', 'getByLabelText', 'getByText'].includes(method)) {
        robustQueries++;
      }
      if (['querySelector', 'getByTestId'].includes(method)) {
        fragileQueries++;
      }
    }
    
    // Check for expect statements with matchers
    if (node.type === 'CallExpression' && 
        node.callee?.object?.name === 'expect') {
      hasMatchers = true;
    }
    
    // Recurse children
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach((child: any) => visit(child));
        } else if (node[key].type) {
          visit(node[key]);
        }
      }
    }
  }
  
  visit(ast);
  
  // Validate
  if (!hasDescribe) issues.push('Missing describe block');
  if (!hasIt) issues.push('Missing test case');
  
  // Calculate scores
  const structure = (hasDescribe && hasIt) ? 100 : 0;
  const totalQueries = robustQueries + fragileQueries;
  const queries = totalQueries > 0 
    ? Math.round((robustQueries / totalQueries) * 100) 
    : 50;
  const matchers = hasMatchers ? 100 : 0;
  const noFragility = fragileQueries === 0 ? 100 : 25;
  
  const overall = Math.round((structure + queries + matchers + noFragility) / 4);
  
  return {
    overall,
    criteria: { structure, queries, matchers, noFragility },
    issues
  };
}
```

### Pattern 2: Post-Write Verification (SCR-03)

**What:** Verify generated tests for syntax validity and imports
**When to use:** After writing test file to filesystem

```typescript
// Source: Verification pattern
import { parse } from '@typescript-eslint/typescript-estree';
import * as fs from 'fs';
import * as path from 'path';

interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function postWriteVerification(filePath: string): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check file exists
  if (!fs.existsSync(filePath)) {
    errors.push('File does not exist');
    return { valid: false, errors, warnings };
  }
  
  // 2. Read file content
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 3. Syntax validation via AST parsing
  try {
    parse(content, { 
      loc: true, 
      errorOnUnknownASTType: true 
    });
  } catch (e: any) {
    errors.push(`Syntax error: ${e.message}`);
    return { valid: false, errors, warnings };
  }
  
  // 4. Check for required imports
  const requiredImports = ['@testing-library/react', 'describe', 'it', 'expect'];
  const missingImports: string[] = [];
  
  for (const imp of requiredImports) {
    if (!content.includes(imp)) {
      missingImports.push(imp);
    }
  }
  
  if (missingImports.length > 0) {
    errors.push(`Missing imports: ${missingImports.join(', ')}`);
  }
  
  // 5. Check for common issues
  if (content.includes('screen.debug()')) {
    warnings.push('Contains screen.debug() - remove before commit');
  }
  if (content.includes('test.skip') || content.includes('it.skip')) {
    warnings.push('Contains skipped tests');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

### Pattern 3: Convention Extraction (CNV-01)

**What:** Analyze existing test patterns to derive project conventions
**When to use:** During `taro init` or `taro map-codebase`

```typescript
// Source: Pattern analysis for convention learning
import { parse } from '@typescript-eslint/typescript-estree';
import * as fs from 'fs';
import * as path from 'path';

interface TestConvention {
  naming: {
    pattern: 'camelCase' | 'kebab-case' | 'snake_case';
    describePrefix: string;
    itTemplate: string;
  };
  structure: {
    describePerComponent: boolean;
    helpersInDescribe: boolean;
    setupLocation: 'inside' | 'outside';
  };
  queries: {
    preferred: string[];
    avoided: string[];
  };
  matchers: {
    common: string[];
  };
  imports: {
    common: string[];
  };
}

function extractConventions(testDir: string): TestConvention {
  const convention: TestConvention = {
    naming: {
      pattern: 'camelCase',
      describePrefix: '',
      itTemplate: 'should {behavior}'
    },
    structure: {
      describePerComponent: true,
      helpersInDescribe: true,
      setupLocation: 'inside'
    },
    queries: {
      preferred: ['getByRole', 'getByLabelText'],
      avoided: ['querySelector']
    },
    matchers: {
      common: ['toBeInTheDocument', 'toHaveBeenCalledWith']
    },
    imports: {
      common: ['@testing-library/react', 'userEvent']
    }
 //  };
  
  Scan all test files
  const testFiles = glob.sync(`${testDir}/**/*.{test,spec}.{ts,tsx}`);
  
  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const ast = parse(content, { loc: true });
    
    // Extract patterns from AST
    analyzeNamingConvention(ast, convention);
    analyzeStructure(ast, convention);
    analyzeQueries(ast, convention);
    analyzeMatchers(ast, convention);
    analyzeImports(ast, convention);
  }
  
  return convention;
}

function analyzeNamingConvention(ast: any, conv: TestConvention) {
  // Find describe block names
  const describeNames: string[] = [];
  
  function visit(node: any) {
    if (node.type === 'CallExpression' && 
        node.callee?.name === 'describe') {
      const firstArg = node.arguments?.[0];
      if (firstArg?.type === 'Literal') {
        describeNames.push(firstArg.value);
      }
    }
    // Recurse
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach((child: any) => visit(child));
        } else if (node[key].type) {
          visit(node[key]);
        }
      }
    }
  }
  
  visit(ast);
  
  // Determine naming pattern
  if (describeNames.length > 0) {
    const hasKebab = describeNames.some(n => n.includes('-'));
    const hasSnake = describeNames.some(n => n.includes('_'));
    
    if (hasKebab) conv.naming.pattern = 'kebab-case';
    else if (hasSnake) conv.naming.pattern = 'snake_case';
  }
}
```

### Pattern 4: Convention Persistence (CNV-02)

**What:** Store learned conventions in SQLite for reuse
**When to use:** After convention extraction, on subsequent runs

```typescript
// Source: SQLite-based convention storage
import Database from 'better-sqlite3';

interface TaroState {
  conventions: TestConvention;
  lastUpdated: string;
  version: string;
}

class ConventionStore {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }
  
  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conventions (
        id INTEGER PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT
      );
    `);
  }
  
  saveConventions(conventions: TestConvention) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conventions (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);
    
    stmt.run('naming', JSON.stringify(conventions.naming));
    stmt.run('structure', JSON.stringify(conventions.structure));
    stmt.run('queries', JSON.stringify(conventions.queries));
    stmt.run('matchers', JSON.stringify(conventions.matchers));
    stmt.run('imports', JSON.stringify(conventions.imports));
  }
  
  loadConventions(): TestConvention | null {
    const get = this.db.prepare('SELECT key, value FROM conventions');
    const rows = get.all() as { key: string; value: string }[];
    
    if (rows.length === 0) return null;
    
    const conventions: any = {};
    for (const row of rows) {
      conventions[row.key] = JSON.parse(row.value);
    }
    
    return conventions as TestConvention;
  }
  
  // CNV-03: Cache for faster subsequent runs
  getCached(key: string): any | null {
    const stmt = this.db.prepare(`
      SELECT value FROM cache 
      WHERE key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
    `);
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }
  
  setCached(key: string, value: any, ttlSeconds?: number) {
    const expiresAt = ttlSeconds 
      ? `datetime('now', '+${ttlSeconds} seconds')`
      : null;
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, expires_at)
      VALUES (?, ?, ${expiresAt || 'NULL'})
    `);
    stmt.run(key, JSON.stringify(value));
  }
}
```

### Pattern 5: Quality Gates Integration

**What:** Run ESLint rules as quality gates
**When to use:** Pre-write audit phase

```typescript
// Source: ESLint-based quality gates
import { Linter } from 'eslint';
import * as tsEstree from '@typescript-eslint/typescript-estree';

const linter = new Linter();

// Define custom rules for test quality
linter.defineRule('no-fragile-queries', {
  create(context) {
    return {
      CallExpression(node: any) {
        const method = node.callee?.property?.name;
        const obj = node.callee?.object?.name;
        
        // Check for fragile queries
        if (method === 'querySelector' || method === 'querySelectorAll') {
          context.report({
            node,
            message: 'Avoid querySelector in tests. Use Testing Library queries instead.'
          });
        }
        
        if (method === 'getByTestId' && obj === 'screen') {
          context.report({
            node,
            message: 'getByTestId should be last resort. Prefer getByRole.'
          });
        }
      }
    };
  }
});

linter.defineRule('no-empty-tests', {
  create(context) {
    return {
      CallExpression(node: any) {
        if (node.callee?.name === 'it' || node.callee?.name === 'test') {
          const body = node.arguments?.[1];
          // Check if test body is empty or only has comment
          if (!body || 
              (body.type === 'BlockStatement' && body.body.length === 0)) {
            context.report({
              node,
              message: 'Test should not be empty'
            });
          }
        }
      }
    };
  }
});

linter.defineRule('require-matchers', {
  create(context) {
    let inTestBody = false;
    let hasExpect = false;
    
    return {
      CallExpression(node: any) {
        // Track if we're inside a test body
        if (node.callee?.name === 'it' || node.callee?.name === 'test') {
          inTestBody = true;
          hasExpect = false;
        }
        
        // Check for expect in test
        if (inTestBody && node.callee?.object?.name === 'expect') {
          hasExpect = true;
        }
        
        // After test body ends
        if (inTestBody && hasExpect === false && node.type === 'BlockStatement') {
          context.report({
            message: 'Test should have at least one expect statement'
          });
        }
      }
    };
  }
});

// Use with config
const config = {
  languageOptions: {
    parser: tsEstree,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  },
  rules: {
    'no-fragile-queries': 'error',
    'no-empty-tests': 'error',
    'require-matchers': 'error'
  }
};

function runQualityGates(code: string): { passed: boolean; errors: any[] } {
  const messages = linter.verify(code, config);
  const errors = messages.filter(m => m.severity === 2);
  
  return {
    passed: errors.length === 0,
    errors
  };
}
```

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript parsing | Custom regex parser | @typescript-eslint/typescript-estree | Handles all TS features, ESLint integration |
| Quality rules | Custom validation functions | ESLint with custom rules | Extensible, community rules available |
| Convention storage | JSON files | better-sqlite3 | Fast queries, ACID compliant, widely used |
| Import validation | String matching | AST-based import analysis | Handles all import syntax, edge cases |
| Test pattern detection | Heuristic string scans | AST traversal | Accurate, handles all code variations |

**Key insight:** The combination of TypeScript ESLint parser + ESLint rules provides a robust foundation for quality gates. Custom rules can be incrementally added for project-specific checks.

---

## Common Pitfalls

### Pitfall 1: Scoring Criteria Mismatch

**What goes wrong:** Generated tests score well but are not actually useful
**Why it happens:** Focusing on structural elements (has describe, has it) rather than meaningful assertions
**How to avoid:** Weight matchers and assertion quality higher than structure
**Warning signs:** High scores but tests that don't verify anything meaningful

### Pitfall 2: Convention Overfitting

**What goes wrong:** Learned conventions are too specific to first project
**Why it happens:** Not normalizing patterns (e.g., exact test names vs. templates)
**How to avoid:** Extract patterns, not exact values. Store templates like "should {action}"
**Warning signs:** Convention cache doesn't apply to new test files

### Pitfall 3: Cache Invalidation

**What goes wrong:** Outdated conventions cause worse test generation
**Why it happens:** Not invalidating cache when project structure changes
**How to avoid:** Add cache versioning, invalidate on `taro remap`
**Warning signs:** Generated tests don't match newer project patterns

### Pitfall 4: Pre-Write Blocking

**What goes wrong:** Strict pre-write audit prevents any test generation
**Why it happens:** Scoring threshold too high, not distinguishing blocking vs. warning issues
**How to avoid:** Separate blocking issues (syntax, missing imports) from warnings (query choice)
**Warning signs:** Taro fails to generate tests for edge cases

### Pitfall 5: Performance Regression

**What goes wrong:** Convention learning slows down subsequent runs
**Why it happens:** Re-analyzing all test files on every run
**How to avoid:** Cache analyzed data, only re-scan changed files
**Warning signs:** `taro generate` gets progressively slower

---

## Code Examples

### Complete Scoring Pipeline (SCR-01, SCR-02, SCR-03)

```typescript
// Source: Integration pattern
import { generateTestCode } from '../generator';
import { preWriteAudit } from './pre-audit';
import { postWriteVerification } from './post-verify';
import { ConventionStore } from '../learner/storage';

interface ScoringResult {
  passed: boolean;
  score: number;
  issues: string[];
  warnings: string[];
}

async function generateWithScoring(
  recording: Recording,
  outputPath: string,
  store: ConventionStore
): Promise<ScoringResult> {
  // 1. Generate test code
  const code = generateTestCode(recording);
  
  // SCR-01: Score before writing
  const preScore = preWriteAudit(code);
  
  // Check blocking issues
  if (preScore.criteria.structure < 50) {
    return {
      passed: false,
      score: preScore.overall,
      issues: preScore.issues,
      warnings: []
    };
  }
  
  // Write to filesystem
  fs.writeFileSync(outputPath, code);
  
  // SCR-03: Post-write verification
  const postResult = postWriteVerification(outputPath);
  
  return {
    passed: postResult.valid && preScore.overall >= 70,
    score: preScore.overall,
    issues: [...preScore.issues, ...postResult.errors],
    warnings: postResult.warnings
  };
}
```

### Convention Learning Pipeline (CNV-01, CNV-02)

```typescript
// Source: Convention learning integration
import { extractConventions } from './extractor';
import { ConventionStore } from './storage';

async function learnConventions(projectRoot: string): Promise<void> {
  const store = new ConventionStore(path.join(projectRoot, '.taro/conventions.db'));
  
  // CNV-01: Derive from observation
  const testDirs = findTestDirectories(projectRoot);
  let combinedConventions: TestConvention | null = null;
  
  for (const dir of testDirs) {
    const conventions = extractConventions(dir);
    
    // Merge with existing (new values override)
    if (combinedConventions) {
      combinedConventions = mergeConventions(combinedConventions, conventions);
    } else {
      combinedConventions = conventions;
    }
  }
  
  if (combinedConventions) {
    // CNV-02: Persist for subsequent runs
    store.saveConventions(combinedConventions);
    console.log('Conventions learned and persisted');
  }
}

function findTestDirectories(projectRoot: string): string[] {
  // Find all test directories (src/__tests__, tests/, etc.)
  const patterns = [
    'src/**/*.test.ts',
    'src/**/*.test.tsx',
    'src/**/*.spec.ts',
    'src/**/*.spec.tsx',
    'tests/**/*.test.ts',
    'tests/**/*.spec.tsx'
  ];
  
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    const files = glob.sync(pattern, { cwd: projectRoot });
    for (const file of files) {
      dirs.add(path.dirname(path.join(projectRoot, file)));
    }
  }
  
  return Array.from(dirs);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual test review | Automated quality gates | 2020+ | Faster feedback, consistent standards |
| Project-specific rules | ESLint-based rules | 2019+ | Reusable, well-tested |
| Convention files | SQLite storage | 2021+ | Queryable, fast, ACID compliant |
| String pattern matching | AST-based analysis | 2018+ | Accurate, handles all syntax |
| No caching | Convention caching | 2022+ | Faster subsequent runs |

**Deprecated/outdated:**
- `jshint` - ESLint is now standard
- JSON config files for conventions - SQLite provides better query capabilities
- Manual import verification - AST-based is more accurate

---

## Open Questions

1. **Scoring Weight Calibration**
   - What we know: Structure, queries, matchers, and fragility are the main criteria
   - What's unclear: Optimal weights for each criterion
   - Recommendation: Start with equal weights, adjust based on user feedback

2. **Convention Versioning**
   - What we know: Projects evolve, conventions change
   - What's unclear: How to handle version mismatches between stored and actual conventions
   - Recommendation: Add version field, invalidate on major changes

3. **Minimum Viable Conventions**
   - What we know: Full convention extraction takes time
   - What's unclear: What's the minimum set of conventions needed for useful generation
   - Recommendation: Start with naming pattern and query preferences only

---

## Sources

### Primary (HIGH confidence)
- @typescript-eslint/typescript-estree documentation - https://typescript-eslint.io/packages/typescript-estree
- ESLint API documentation - https://eslint.org/docs/latest/
- better-sqlite3 npm page - https://www.npmjs.com/package/better-sqlite3
- Rigour quality gates approach - https://github.com/rigour-labs/rigour

### Secondary (MEDIUM confidence)
- Testing Library best practices for queries
- Community patterns for convention learning in AI code generators

### Tertiary (LOW confidence)
- Various blog posts on AST-based code analysis (need verification)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - Well-established libraries, fully documented
- Architecture: HIGH - Patterns from verified sources and integration patterns
- Pitfalls: MEDIUM - Based on common issues in code generation tools

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days for stable stack)
