---
name: "@tayo-dev/rtl-generate"
description: "Generate or preview React Testing Library tests from Testing Library Recorder JS or Chrome Recorder JSON exports with Tayo. Use when a user provides a recording file, asks to convert a Recorder flow into an RTL test, wants a dry run, or needs to regenerate or overwrite an existing generated test."
---

# Tayo Generate

Invoke this skill with `$@tayo-dev/rtl-generate`.

## Inputs

- path to the recording file (`.js` or `.json`)
- optional `--output <path>`
- optional `--dry-run`
- optional `--force`

## Preflight

1. Confirm the recording file exists and uses a supported extension.
2. Decide whether to write next to the input file or use `--output <path>`.
3. If the target file already exists and the user did not explicitly ask to replace it, stop and surface `--force` instead of overwriting implicitly.
4. Prefer `--dry-run` when the user wants to inspect convention fit before writing files.

## Execution

Run `tayo generate <recording-file>` with the requested flags.
Use `tayo generate --dry-run <recording-file>` when preview is safer than writing.
Use `tayo generate --output <path> <recording-file>` for a custom destination.
Use `tayo generate --force <recording-file>` only when overwriting is explicitly desired.

## Understanding the Score

Tayo scores on four weighted dimensions:

| Dimension | Weight | What lowers it | What raises it |
|-----------|--------|----------------|----------------|
| `query` | 30% | `getByTestId` (20pts), each `tayo-query-checkpoint:` (−3pts, cap −40) | `getByRole` (100pts), `getByLabelText` (80pts), `getByText` (60pts) |
| `assertions` | 25% | All `toBeInTheDocument()` only (30% credit); no assertions (0) | `toHaveValue()`, `toBeChecked()`, `toHaveTextContent()`, `toBeVisible()` (full credit) |
| `structure` | 20% | `render(<App />)` (−25), `tayo-boundary-warning:` (−20), single test >2000 chars (−20) | `describe()` block (+20), each extra `it()` block (+15, cap +30) |
| `boundary` | 25% | See boundary penalties below | Clean separation of concerns |

**Grade thresholds:** A ≥ 90 · B ≥ 80 · C ≥ 70 · D ≥ 60 · F < 60

Score < 80 or a QUAL-02 marker failure → Tayo emits `Manual review required`.

### Query priority (high → low)

When Tayo cannot recover a high-quality query, it leaves a `// tayo-query-checkpoint:` comment. Fix these by applying the hierarchy:

1. `getByRole('button', { name: /submit/i })` — best; tests accessibility tree
2. `getByLabelText(/email address/i)` — for labelled form fields
3. `getByText(/welcome back/i)` — for visible text nodes
4. `getByPlaceholderText(/search/i)` — acceptable fallback
5. `getByTestId('submit-btn')` — last resort; always try to replace

### Boundary issue types and penalties

`tayo-boundary-warning:` comments mark one of four structural problems:

| Type | Penalty | Cause | Fix |
|------|---------|-------|-----|
| `leaf-render-boundary` | −35 | Renders `*Form`, `*Dialog`, `*Modal`, or `*Drawer` directly while the flow involves container-level interaction | Render the nearest page/module component that owns the trigger button and dialog lifecycle |
| `inline-hook-mock` | −30 | `vi.mock`/`jest.mock` defines `use*Query` or `use*Mutation` hooks inline | Move to a shared fixture or raise the render boundary so the test owns less hook detail |
| `helper-embedded-assertion` | −20 | A helper function outside a test body contains `expect()` | Keep helpers focused on setup/navigation; move assertions into the `it()` body |
| `positional-control-selection` | −15 | `getAllByRole('button')[2]` — positional indexing | Scope with `within(container)` or use a more specific accessible name |

### QUAL-02 marker quality gate

Tayo detects semantic markers in the recording. If markers were detected but no marker-derived assertions were emitted, QUAL-02 fails and overrides the assertion dimension. The fix is to ensure assert steps in the recording produce strong matchers in the output.

## Post-run Checklist

Work through these after every generation:

1. **Fix `render(<App />)`** — search the repo for the component that owns the recorded flow. Replace with the narrowest component that includes the trigger and expected outcome.

2. **Resolve `// tayo-query-checkpoint:` comments** — each marks a selector Tayo could not convert. Apply the query hierarchy above using the aria label, role, or visible text from the recording.

3. **Upgrade weak assertions** — replace bare `toBeInTheDocument()` with `toHaveTextContent()`, `toHaveValue()`, or `toBeVisible()` when the expected outcome is known.

4. **Fix `tayo-boundary-warning:` comments** — use the boundary type table above to choose the right fix.

5. **Re-score** — run `tayo generate --dry-run --force <file>` to see the updated score without overwriting manual edits.

## Post-run Review

Always inspect:

- the generated path or dry-run stdout
- the Tayo score and grade
- whether Tayo reported manual review required
- the top blockers in the banner output
- unresolved render targets, placeholder queries, boundary warnings, or missing mock follow-up

If Tayo reports manual review required, explain the blockers instead of presenting the result as production-ready.

## Response Contract

Report:

- the command you ran
- the generated test file path
- the Tayo score and grade (e.g. `82/100 (B) — query: 90, assertions: 75, structure: 80, boundary: 85`)
- whether manual review is required and the top blockers
- which post-run checklist steps apply and what to do for each
