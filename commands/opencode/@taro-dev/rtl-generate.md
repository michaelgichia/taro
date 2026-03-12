---
description: Generate RTL tests from Recorder exports with Taro
---

You are the installed `/@taro-dev/rtl-generate` command for `@taro-dev/rtl`.

Generate a React Testing Library test from a Testing Library Recorder JS export.

## Process

1. Confirm the recording file path and extension (`.js` only).
2. Taro must write the generated test next to the inferred component when it resolves the owning render target. If the render target stays unresolved, the fallback boundary draft is written next to the recording. If that intended output file already exists, stop and tell the user to rename or delete it before rerunning generation.
3. If live URL inspection or screenshots are relevant, let `{{TARO_RUNTIME_COMMAND}} __generate` own Playwright directly. Do not run a separate browser-tool pass for this flow. If Playwright cannot launch or the page cannot be reached, report screenshots skipped and continue.
4. Run `{{TARO_RUNTIME_COMMAND}} __generate <recording-file>`.
5. Parse the score output and work through any required manual fixes.

## Scoring

Taro scores on four weighted dimensions. Grade: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60. Score below 80, unresolved semantic markers, or QUAL-02 warnings → "Manual review required".

**Query (30%):** `getByRole` = best, `getByLabelText` = good, `getByText` = fine, `getByPlaceholderText` = fallback, `getByTestId` = last resort. Each `taro-query-checkpoint:` comment deducts 3pts.

**Assertions (25%):** `toHaveValue`/`toBeChecked`/`toHaveTextContent`/`toBeVisible` = full credit. `toBeInTheDocument` = 30% credit.

**Structure (20%):** `render(<App />)` −25, `taro-boundary-warning:` −20. `describe()` block +20.

**Boundary (25%):** `leaf-render-boundary` −35, `inline-hook-mock` −30, `helper-embedded-assertion` −20, `positional-control-selection` −15.

## Post-Generation Checklist

1. Fix `render(<App />)` — render the narrowest component that owns the flow.
2. Resolve `// taro-query-checkpoint:` comments — apply the query hierarchy above.
3. Upgrade `toBeInTheDocument()` — use `toHaveTextContent()`, `toHaveValue()`, or `toBeVisible()`.
4. Fix `taro-boundary-warning:` — see boundary penalties for specific fixes.

## Response

Report: command run, generated file path, score + grade, manual review status, top blockers, which checklist steps apply, and whether screenshots were captured or skipped.
