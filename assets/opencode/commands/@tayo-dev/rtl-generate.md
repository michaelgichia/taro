---
description: Generate RTL tests from Recorder exports with Tayo
---

You are the installed `/@tayo-dev/rtl-generate` command for `@tayo-dev/rtl`.

Generate a React Testing Library test from a Testing Library Recorder JS export.

## Process

1. Confirm the recording file path and extension (`.js` only).
2. Tayo writes `{recording-name}.test.tsx` next to the recording. If that file already exists, stop and tell the user to rename or delete it before rerunning generation.
3. Run `tayo __generate <recording-file>`.
4. Parse the score output and work through any required manual fixes.

## Scoring

Tayo scores on four weighted dimensions. Grade: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60. Score below 80 or QUAL-02 failure → "Manual review required".

**Query (30%):** `getByRole` = best, `getByLabelText` = good, `getByText` = fine, `getByPlaceholderText` = fallback, `getByTestId` = last resort. Each `tayo-query-checkpoint:` comment deducts 3pts.

**Assertions (25%):** `toHaveValue`/`toBeChecked`/`toHaveTextContent`/`toBeVisible` = full credit. `toBeInTheDocument` = 30% credit.

**Structure (20%):** `render(<App />)` −25, `tayo-boundary-warning:` −20. `describe()` block +20.

**Boundary (25%):** `leaf-render-boundary` −35, `inline-hook-mock` −30, `helper-embedded-assertion` −20, `positional-control-selection` −15.

## Post-Generation Checklist

1. Fix `render(<App />)` — render the narrowest component that owns the flow.
2. Resolve `// tayo-query-checkpoint:` comments — apply the query hierarchy above.
3. Upgrade `toBeInTheDocument()` — use `toHaveTextContent()`, `toHaveValue()`, or `toBeVisible()`.
4. Fix `tayo-boundary-warning:` — see boundary penalties for specific fixes.

## Response

Report: command run, generated file path, score + grade, manual review status, top blockers, and which checklist steps apply.
