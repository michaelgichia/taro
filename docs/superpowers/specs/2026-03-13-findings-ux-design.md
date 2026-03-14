# Findings UX Design

**Date:** 2026-03-13
**Status:** Approved

## Problem

Taro's findings (boundary violations, missing mocks, mutation lifecycle gaps, follow-up actions) are currently printed as prose mixed into operational `[taro]` log noise on stdout. There is no structural separation between progress logs and actionable findings, no machine-readable format, and no exit code signal. This makes it difficult for an AI agent to reliably extract and act on findings.

## Consumer

The primary consumer is an **AI agent** (Claude Code, Copilot, etc.) that runs `taro generate` and reads its output. The agent decides case by case whether to fix a finding immediately or flag it for the human developer.

## Design

### Output channel split

All operational logs (`[taro]` progress, warnings, score output, marker diagnostics) move to **stderr**. In scope for this change:
- `src/cli/commands/generate.ts` — all `console.log` call sites (note: existing `console.warn` calls already write to stderr in Node.js and require no change)
- `src/core/generator.ts` — the single `console.log` call in `emitQuerySummary` at line 375
- `src/core/scanner.ts` — the single `console.log` call at line 62 (`[taro] CTX: No test files found`)

Modules that return structured results without side-effect `console.log` calls (`src/core/scorer.ts`, `src/core/mock-intelligence.ts`, `src/core/verifier.ts`, `src/scorer/post-verify.ts`, `src/core/resolver.ts`) require no changes.

**stdout is reserved exclusively for the findings envelope.** If no findings exist, stdout is silent.

Agents can isolate findings cleanly:
```sh
taro generate recording.js 2>/dev/null   # stdout = findings only, or empty
```

### Findings envelope format

When findings exist, stdout contains exactly:

```
=== taro:findings:start ===
[SEVERITY] category — message. file#line references.
...
=== taro:findings:end ===
```

Rules:
- One finding per line, no line breaks within a finding
- Severity values: `BLOCKING`, `HIGH`, `ADVISORY`
- Categories are short free-form labels: `boundary`, `data-layer`, `mutation`, `follow-up`, `fixture`, `instability`
- **`Finding.message` must be plain text — no picocolors/ANSI codes.** stdout must be machine-readable.
- No findings at all → stdout silent, exit 0
- `HIGH`/`ADVISORY`-only run → envelope emitted to stdout, exit 0

Example output:
```
=== taro:findings:start ===
[BLOCKING] boundary — tenant-provider not mocked inline. AddNewOrgForm.tsx#L68 calls useTenant(). Established pattern: AddNewAppForm.test.tsx#L35.
[BLOCKING] boundary — shared ToastMessage mock missing. Component emits toasts at AddNewOrgForm.tsx#L80. Reset pattern: AddNewAppForm.test.tsx#L54.
[HIGH] data-layer — resetDataLayerMock not wired in beforeEach. Shared support at digitax-data-layer.ts#L251. Affected tests: AddNewOrgForm.test.tsx#L87, #L94.
[ADVISORY] mutation — loading state not covered. Assert submit button shows "Saving profile..." and is disabled. Source: AddNewOrgForm.tsx#L186.
[ADVISORY] mutation — success state not covered. Assert createOrganisationMutate payload and ToastMessage.success call.
[ADVISORY] mutation — error state not covered. Override useCreateOrganisationMutationMock to call onError.
[ADVISORY] follow-up — render through dialog trigger boundary, not <AddNewOrgForm /> directly.
=== taro:findings:end ===
```

### Exit code

| Condition | Exit code |
|---|---|
| No findings | 0 |
| Only `HIGH` / `ADVISORY` findings | 0 |
| Any `BLOCKING` finding | 1 |
| Fatal runtime error (file not found, parse failure, write failure) | 2 |

Exit 1 always accompanies a findings envelope on stdout. Exit 2 means a fatal infrastructure error with no findings envelope — agents can distinguish the two cases by exit code alone.

This requires changing all four existing `process.exit(1)` call sites in `generate.ts` to `process.exit(2)`, including:
- File not found / not accessible
- Failed to parse recording
- Post-write syntax verification failure (internal Taro bug path)
- Unhandled error in the action handler catch block

No `--strict` flag at this stage (YAGNI).

### Findings collection mechanism

Findings are produced by Taro's AI runtime analysis (the verification gate that currently emits the `• Findings:` prose block as part of the skill execution). All existing `console.log` call sites in `generate.ts` are **operational logs** — they all move to stderr. None become `findings.push(...)` entries.

The `Finding[]` array is populated by refactoring the output path of the analysis: instead of assembling findings as prose and printing them, the analysis returns `Finding[]`. The exact generation logic (boundary checks, mock gap detection, mutation lifecycle analysis) is unchanged — only the output representation changes from prose to structured `Finding` objects.

The findings flush and exit happen **at the very end of the action handler**, after all generation and analysis is complete. Any early-return code paths (e.g., the "keep existing output" path) must also flush findings and call `process.exit` before returning, to preserve the exit code contract.

### `enforceMarkerGateExit` removal

`enforceMarkerGateExit` in `generate.ts` is currently a no-op stub (`void scoreResult`). It is intentionally removed as part of this change. Its intended gate logic is superseded by the BLOCKING findings mechanism — marker quality gate violations will surface as `[BLOCKING]` findings in the envelope.

## Implementation

### New file: `src/core/findings-reporter.ts`

```ts
export type FindingsSeverity = 'BLOCKING' | 'HIGH' | 'ADVISORY'

export interface Finding {
  severity: FindingsSeverity
  category: string  // plain text, no ANSI codes
  message: string   // plain text, no ANSI codes
}

export function formatFindingsBlock(findings: Finding[]): string {
  if (findings.length === 0) return ''
  const lines = findings.map(
    (f) => `[${f.severity}] ${f.category} — ${f.message}`
  )
  return [
    '=== taro:findings:start ===',
    ...lines,
    '=== taro:findings:end ===',
  ].join('\n')
}

export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'BLOCKING')
}
```

### Changes to `src/cli/commands/generate.ts`

1. Replace all `console.log(...)` and `console.warn(...)` calls with `process.stderr.write(... + '\n')` (or a thin `log(msg: string)` helper that writes to stderr).
2. Change the four existing `process.exit(1)` fatal-error call sites to `process.exit(2)`.
3. Remove `enforceMarkerGateExit` (no-op stub, superseded by findings mechanism).
4. The intelligence analysis is refactored to return `Finding[]` instead of printing prose; all findings are collected into a `Finding[]` array.
5. At the very end of the run: `if (findings.length > 0) { process.stdout.write(formatFindingsBlock(findings) + '\n') }`.
6. Exit: `process.exit(hasBlockingFindings(findings) ? 1 : 0)`.

### Changes to `src/core/generator.ts`

- `emitQuerySummary` (line 375): the single `console.log` call moves to `process.stderr.write(... + '\n')`.

### Changes to `src/core/scanner.ts`

- Line 62: `console.log(pc.yellow('[taro] CTX: No test files found — using defaults'))` moves to `process.stderr.write(... + '\n')`.

### No changes to

- `src/core/scorer.ts` and related scorer modules — return structured results, no side-effect `console.log`.
- `src/core/mock-intelligence.ts` — unchanged.
- `src/core/verifier.ts` — unchanged.
- `src/scorer/post-verify.ts` — unchanged.
- `src/core/resolver.ts` — all calls are `console.warn`, which already writes to stderr in Node.js.

## Out of scope

- `--strict` flag to promote `HIGH` findings to blocking
- JSON findings format (the line-based format is sufficient for agent parsing)
- A `.taro/findings.json` artifact (stdout is sufficient; files add complexity with no agent benefit given stdout capture is standard)
