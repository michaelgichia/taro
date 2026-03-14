# Findings UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all Taro operational logs to stderr, emit structured findings to stdout in a machine-readable envelope, and signal blocking findings via exit code 1.

**Architecture:** A new `findings-reporter.ts` module owns the `Finding` type and envelope formatting. Three existing files (`generate.ts`, `generator.ts`, `scanner.ts`) have their `console.log` calls moved to stderr. The generate action gains a `findings: Finding[]` accumulator that is flushed to stdout at the end of every execution path.

**Tech Stack:** TypeScript, Node.js `process.stderr`/`process.stdout`, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-findings-ux-design.md`

---

## File Map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `src/core/findings-reporter.ts` | `Finding` type, `formatFindingsBlock`, `hasBlockingFindings` |
| Create | `src/core/findings-reporter.test.ts` | Unit tests for the above |
| Modify | `src/core/scanner.ts:62` | Move `console.log` → stderr |
| Modify | `src/core/generator.ts:375` | Move `console.log` in `emitQuerySummary` → stderr |
| Modify | `src/cli/commands/generate.ts` | All `console.log` → stderr; `process.exit(1)` → `exit(2)`; remove `enforceMarkerGateExit`; wire findings accumulator + envelope flush |

---

## Chunk 1: findings-reporter module + small stderr fixes

### Task 1: findings-reporter — write the failing tests

**Files:**

- Create: `src/core/findings-reporter.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// src/core/findings-reporter.test.ts
import { describe, expect, it } from "vitest";
import {
  formatFindingsBlock,
  hasBlockingFindings,
} from "./findings-reporter.js";
import type { Finding } from "./findings-reporter.js";

describe("formatFindingsBlock", () => {
  it("returns empty string when findings array is empty", () => {
    expect(formatFindingsBlock([])).toBe("");
  });

  it("wraps findings in sentinel lines", () => {
    const findings: Finding[] = [
      {
        severity: "BLOCKING",
        category: "boundary",
        message: "tenant-provider missing.",
      },
    ];
    const result = formatFindingsBlock(findings);
    expect(result).toBe(
      "=== taro:findings:start ===\n[BLOCKING] boundary — tenant-provider missing.\n=== taro:findings:end ==="
    );
  });

  it("emits one line per finding in severity order as provided", () => {
    const findings: Finding[] = [
      { severity: "BLOCKING", category: "boundary", message: "A." },
      { severity: "HIGH", category: "data-layer", message: "B." },
      { severity: "ADVISORY", category: "mutation", message: "C." },
    ];
    const lines = formatFindingsBlock(findings).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("=== taro:findings:start ===");
    expect(lines[1]).toBe("[BLOCKING] boundary — A.");
    expect(lines[2]).toBe("[HIGH] data-layer — B.");
    expect(lines[3]).toBe("[ADVISORY] mutation — C.");
    expect(lines[4]).toBe("=== taro:findings:end ===");
  });

  it("does not include a trailing newline (caller appends it)", () => {
    const findings: Finding[] = [
      {
        severity: "ADVISORY",
        category: "follow-up",
        message: "Fix render path.",
      },
    ];
    expect(formatFindingsBlock(findings).endsWith("\n")).toBe(false);
  });
});

describe("hasBlockingFindings", () => {
  it("returns false for empty array", () => {
    expect(hasBlockingFindings([])).toBe(false);
  });

  it("returns false when only HIGH and ADVISORY findings exist", () => {
    expect(
      hasBlockingFindings([
        { severity: "HIGH", category: "data-layer", message: "X." },
        { severity: "ADVISORY", category: "mutation", message: "Y." },
      ])
    ).toBe(false);
  });

  it("returns true when at least one BLOCKING finding exists", () => {
    expect(
      hasBlockingFindings([
        { severity: "ADVISORY", category: "mutation", message: "Y." },
        { severity: "BLOCKING", category: "boundary", message: "Z." },
      ])
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
pnpm test src/core/findings-reporter.test.ts
```

Expected: `Cannot find module './findings-reporter.js'`

### Task 2: findings-reporter — implement the module

**Files:**

- Create: `src/core/findings-reporter.ts`

- [ ] **Step 1: Create the module**

```ts
// src/core/findings-reporter.ts
export type FindingsSeverity = "BLOCKING" | "HIGH" | "ADVISORY";

export interface Finding {
  severity: FindingsSeverity;
  /** Short free-form label: boundary | data-layer | mutation | follow-up | fixture | instability */
  category: string;
  /** Plain text only — no ANSI/picocolors codes. stdout must be machine-readable. */
  message: string;
}

export function formatFindingsBlock(findings: Finding[]): string {
  if (findings.length === 0) return "";
  const lines = findings.map(
    (f) => `[${f.severity}] ${f.category} — ${f.message}`
  );
  return [
    "=== taro:findings:start ===",
    ...lines,
    "=== taro:findings:end ===",
  ].join("\n");
}

export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "BLOCKING");
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
pnpm test src/core/findings-reporter.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/findings-reporter.ts src/core/findings-reporter.test.ts
git commit -m "feat: add findings-reporter module with envelope format and blocking gate"
```

### Task 3: stderr redirect in scanner.ts and generator.ts

**Files:**

- Modify: `src/core/scanner.ts:62`
- Modify: `src/core/generator.ts:375`

These are single-line changes. No new tests needed — the behaviour is identical except the channel.

- [ ] **Step 1: Fix scanner.ts line 62**

Replace:

```ts
console.log(pc.yellow("[taro] CTX: No test files found — using defaults"));
```

With:

```ts
process.stderr.write(
  pc.yellow("[taro] CTX: No test files found — using defaults") + "\n"
);
```

- [ ] **Step 2: Fix generator.ts line 375 (`emitQuerySummary`)**

Locate the `console.log(` call inside `emitQuerySummary` (around line 375). Replace:

```ts
console.log(pc.dim("[taro]") + ` ${count} ${method} (${quality}${lineInfo})`);
```

With:

```ts
process.stderr.write(
  pc.dim("[taro]") + ` ${count} ${method} (${quality}${lineInfo})` + "\n"
);
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
pnpm test src/core/generator.test.ts src/core/scanner.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/scanner.ts src/core/generator.ts
git commit -m "fix: move scanner and generator console.log to stderr"
```

---

## Chunk 2: generate.ts — stderr split, exit codes, enforceMarkerGateExit removal

### Task 4: Introduce a stderr log helper in generate.ts

`generate.ts` has ~50 `console.log` call sites. Adding a thin `log()` helper avoids mechanical repetition and keeps the diff readable.

**Files:**

- Modify: `src/cli/commands/generate.ts` (top of file, before first `console.log`)

- [ ] **Step 1: Add the helper near the top of the file (after imports)**

Find the first non-import line at the top of the action handler section and add:

```ts
/** Write an operational log line to stderr. Never use console.log in this file — stdout is reserved for the findings envelope. */
function log(msg: string): void {
  process.stderr.write(msg + "\n");
}
```

- [ ] **Step 2: Replace every `console.log(` in generate.ts with `log(`**

Use your editor's find-and-replace within `generate.ts` only:

- Find: `console.log(`
- Replace: `log(`

**Important:** Replace only `console.log` — do NOT touch `console.error` or `console.warn` calls. Those already write to stderr.

Verify the replacement count matches the grep count (run `grep -c 'console\.log(' src/cli/commands/generate.ts` before and confirm it is now 0).

- [ ] **Step 3: Run generate.ts tests**

```bash
pnpm test src/cli/commands/generate.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "fix: route all generate.ts console.log calls to stderr via log() helper"
```

### Task 5: Change fatal process.exit(1) to process.exit(2)

**Files:**

- Modify: `src/cli/commands/generate.ts` — four call sites

- [ ] **Step 1: Change all four exit(1) fatal-error sites to exit(2)**

The four sites are at lines approximately 2478, 2528, 2538, 2972. Each is inside an error handler. Change each:

```ts
process.exit(1);
```

to:

```ts
process.exit(2);
```

Confirm no remaining `process.exit(1)` in the file:

```bash
grep 'process\.exit(1)' src/cli/commands/generate.ts
```

Expected: no output.

- [ ] **Step 2: Run tests**

```bash
pnpm test src/cli/commands/generate.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "fix: use exit(2) for fatal infrastructure errors, reserving exit(1) for BLOCKING findings"
```

### Task 6: Remove enforceMarkerGateExit

**Files:**

- Modify: `src/cli/commands/generate.ts` — lines ~1071-1073 (definition) and ~2969 (call site)

- [ ] **Step 1: Remove the function definition (lines ~1071-1073)**

Delete:

```ts
function enforceMarkerGateExit(scoreResult: ScoreResult): void {
  void scoreResult;
}
```

- [ ] **Step 2: Remove the call site (line ~2969)**

Delete the line:

```ts
enforceMarkerGateExit(scoreResult);
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/cli/commands/generate.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "fix: remove enforceMarkerGateExit no-op stub, superseded by BLOCKING findings gate"
```

---

## Chunk 3: generate.ts — findings accumulator and envelope emission

### Task 7: Wire findings accumulator and envelope flush

This is the core delivery task. The generate action needs a `findings` array, a way to accumulate `Finding` entries, and a flush at the end of every execution path.

**Files:**

- Modify: `src/cli/commands/generate.ts`

- [ ] **Step 1: Add findings import**

At the top of `generate.ts`, add to the existing local imports:

```ts
import {
  type Finding,
  formatFindingsBlock,
  hasBlockingFindings,
} from "../../core/findings-reporter.js";
```

- [ ] **Step 2: Add `flushFindings` helper at the top of the file (after the `log` helper)**

```ts
/** Emit the findings envelope to stdout and exit with the correct code. Call on every execution path exit. */
function flushFindings(findings: Finding[]): never {
  if (findings.length > 0) {
    process.stdout.write(formatFindingsBlock(findings) + "\n");
  }
  process.exit(hasBlockingFindings(findings) ? 1 : 0);
}
```

- [ ] **Step 3: Declare `findings` accumulator at the top of the action handler**

Inside the `.action(async (...) => {` callback, immediately after the `projectRoot` derivation, add:

```ts
const findings: Finding[] = [];
```

- [ ] **Step 4: Replace the early-return keep-existing path (line ~2921-2922)**

Replace:

```ts
if (!shouldOverwriteExistingOutput) {
  return;
}
```

With:

```ts
if (!shouldOverwriteExistingOutput) {
  flushFindings(findings);
}
```

- [ ] **Step 5: Replace the early-return assessment-error path (line ~2931)**

Replace:

```ts
          return
        }
      }
```

With (the `return` that follows the two `console.warn` calls in the catch block):

```ts
          flushFindings(findings)
        }
      }
```

- [ ] **Step 6: Replace the normal-completion exit at the end of the try block**

At the end of the `try { ... }` block that writes the test file (around line 2968-2973), after the `log(...)` call for `Created`/`Updated`, replace:

```ts
      } catch (err) {
        console.error(pc.red('Error:') + ` ${String(err)}`)
        process.exit(2)
      }
```

With:

```ts
      } catch (err) {
        process.stderr.write(pc.red('Error:') + ` ${String(err)}` + '\n')
        process.exit(2)
      }
      flushFindings(findings)
```

The `flushFindings` call goes **after** the try/catch block (i.e., after a successful write) so it only runs on the success path. Fatal errors still call `process.exit(2)` directly inside the catch.

- [ ] **Step 7: Run tests**

```bash
pnpm test src/cli/commands/generate.test.ts
```

Expected: all pass.

- [ ] **Step 8: Smoke-test channel separation manually (optional but recommended)**

If you have a local recording file:

```bash
node dist/cli.js generate path/to/recording.js 2>/dev/null
# stdout should be empty (no findings) or contain only the findings envelope
```

- [ ] **Step 9: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "feat: wire findings accumulator and envelope flush to generate action"
```

### Task 8: Verify full test suite is green

- [ ] **Step 1: Run full suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Final commit if any fixups needed**

```bash
git add -p
git commit -m "fix: address findings-ux test suite regressions"
```
