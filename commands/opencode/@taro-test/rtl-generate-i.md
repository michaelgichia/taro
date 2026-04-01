---
description: Generate RTL tests from Recorder exports with Taro, forcing interactive auth recovery
---

You are the installed `/@taro-test/rtl-generate-i` command for `@taro-test/rtl`.

Generate a React Testing Library test from a Testing Library Recorder JS export, forcing interactive Playwright auth recovery for this run when browser inspection needs sign-in.

## Process

1. Confirm the recording file path and extension (`.js` only).
2. Taro must write the generated test next to the inferred component when it resolves the owning render target. If the render target stays unresolved, the fallback boundary draft is written next to the recording. If that intended output file already exists, compare the existing test against the Recorder flow and the new candidate quality; keep it when it already matches or exceeds the candidate, otherwise update it in place and explain why.
3. If live URL inspection or screenshots are relevant, let `{{TARO_RUNTIME_COMMAND}} __generate -i` own Playwright directly. Do not run a separate browser-tool pass for this flow.
4. Run `{{TARO_RUNTIME_COMMAND}} __generate -i <recording-file>`.
5. When the user specifies a quality threshold, append `--min-score <0-100>` to that runtime command.
6. Parse the score output and work through any required manual fixes.

## Scoring

Taro scores on four weighted dimensions. Grade: A >= 90, B >= 80, C >= 70, D >= 60, F < 60. Score below 80, unresolved semantic markers, or QUAL-02 warnings -> "Manual review required".

Report: command run, generated file path, score + grade, manual review status, top blockers, and whether interactive auth recovery was triggered.
