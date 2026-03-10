---
name: "@tayo-dev/rtl-generate"
description: "Generate React Testing Library tests from Recorder JS or Chrome Recorder JSON exports with Tayo."
---

# Tayo Generate

Use `$@tayo-dev/rtl-generate` when the user wants to turn a Recorder JS export or Chrome Recorder JSON export into a React Testing Library test.

## Inputs

- path to the recording file (`.js` or `.json`)
- optional `--output <path>`
- optional `--dry-run`
- optional `--force`

## Execution

Run `tayo generate <recording-file>` with the requested flags.

## Response contract

Report:

- the generated test path
- the Tayo score
- whether the output still needs manual review and the top blockers if present
- any follow-up work required to fix component imports, placeholder queries, or flaky selectors
