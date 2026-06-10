---
name: "@tr/rtl:geni"
description: Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Taro, forcing interactive auth recovery.
argument-hint: "<path/to/recording.js>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
argument-instructions: |
  Accept exactly one argument: the path to a Testing Library Recorder `.js` export.
  Example: /@tr/rtl:geni path/to/recording.js
  Stop if the input is missing or does not end in `.js`.
---

Run the same workflow as `/@tr/rtl:gen`, but force interactive Playwright auth recovery by running `{{TARO_RUNTIME_COMMAND}} __generate -i <recording-file>` for the first pass. If Taro emits `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support` findings, run one bounded mock-review repair pass using the `/@tr/rtl:mocks` contract, then `{{TARO_RUNTIME_COMMAND}} __regrade <generated-test-file>`, and keep edits only when syntax, score, flow coverage, and blocking findings do not regress. Treat any requested `--min-score <0-100>` as the final post-review gate.

Report: command run, generated file path, score + grade, manual review status, top blockers, whether the mock-review pass ran and was accepted or rolled back, and whether interactive auth recovery was triggered.
