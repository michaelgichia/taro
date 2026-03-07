---
name: "@tayo-dev/rtl-generate"
description: "Generate React Testing Library tests from Recorder exports with Tayo."
---

# Tayo Generate

Use `$@tayo-dev/rtl-generate` when the user wants to turn a Chrome Recorder export into a React Testing Library test.

## Inputs

- path to the recording file
- optional `--output <path>`
- optional `--dry-run`
- optional `--force`

## Execution

Run `taro generate <recording-file>` with the requested flags.

## Response contract

Report:

- the generated test path
- the Tayo score
- any follow-up work required to fix component imports or flaky selectors
