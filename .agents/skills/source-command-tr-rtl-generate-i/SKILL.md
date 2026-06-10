---
name: "source-command-tr-rtl-geni"
description: "Generate deterministic, project-aware React Testing Library tests from Testing Library Recorder exports with Taro, forcing interactive auth recovery."
---

# source-command-tr-rtl-geni

Use this skill when the user asks to run the migrated source command `@tr-rtl-geni`.

## Command Template

Run the same workflow as `/@tr-rtl/cli:gen`, but force interactive Playwright auth recovery by running `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __generate -i <recording-file>` for the first pass. If Taro emits `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support` findings, run one bounded mock-review repair pass using the `/@tr-rtl/cli:mocks` contract, then `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __regrade <generated-test-file>`, and keep edits only when syntax, score, flow coverage, and blocking findings do not regress. Treat any requested `--min-score <0-100>` as the final post-review gate.

Report: command run, generated file path, score + grade, manual review status, top blockers, whether the mock-review pass ran and was accepted or rolled back, and whether interactive auth recovery was triggered.
