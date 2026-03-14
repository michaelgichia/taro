---
name: "@taro-test/rtl:generate-i"
description: Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Taro, forcing interactive auth recovery.
argument-hint: "<path/to/recording.js>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
argument-instructions: |
  Accept exactly one argument: the path to a Testing Library Recorder `.js` export.
  Example: /@taro-test/rtl:generate-i path/to/recording.js
  Stop if the input is missing or does not end in `.js`.
---

Run the same workflow as `/@taro-test/rtl:generate`, but force interactive Playwright auth recovery by running `{{TARO_RUNTIME_COMMAND}} __generate -i <recording-file>`.

Report: command run, generated file path, score + grade, manual review status, top blockers, and whether interactive auth recovery was triggered.
