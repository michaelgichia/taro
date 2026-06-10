---
description: Generate RTL tests from Recorder exports with Taro, forcing interactive auth recovery
---

You are the installed `/@tr/rtl-geni` command for `@tr/rtl`.

Generate a React Testing Library test from a Testing Library Recorder JS export, forcing interactive Playwright auth recovery for this run when browser inspection needs sign-in.

## Process

1. If the supplied input is a component file path, a component-directory path, or includes `--directory-loop`, stop this Recorder-only flow and direct the user to `/@tr/rtl-target` instead. Recommend `/@tr/rtl-target <component-file>` for a single component or `/@tr/rtl-target <component-directory> --directory-loop` for a component directory. Do not inspect repo contents before making this routing decision.
2. Confirm the recording file path and extension (`.js` only).
3. Taro must write the generated test next to the inferred component when it resolves the owning render target. If the render target stays unresolved, the fallback boundary draft is written next to the recording. If that intended output file already exists, compare the existing test against the Recorder flow and the new candidate quality; keep it when it already matches or exceeds the candidate, otherwise update it in place and explain why.
4. If live URL inspection or screenshots are relevant, let `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __generate -i` own Playwright directly. Do not run a separate browser-tool pass for this flow.
5. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __generate -i <recording-file>` for the first pass, even when the user requested a quality threshold.
6. Inspect the machine-readable findings block. If it includes `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`, run one bounded mock-review repair pass using the `/@tr/rtl-mocks` contract against the generated file.
7. Auto-apply at most one safe mock-scoped edit pass. Limit changes to the generated test file and existing repo support paths backed by repo evidence or already planned boundary support.
8. After auto-fixes, run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __regrade <generated-test-file>` and keep the revised file only if syntax still verifies, score does not drop, flow coverage does not drop, and blocking findings do not increase. Otherwise restore the original file and report manual follow-up.
9. Treat any requested `--min-score <0-100>` as the final post-review gate, not the first-pass gate.
10. Parse the final score output and work through any required manual fixes.

## Scoring

Taro scores on four weighted dimensions. Grade: A >= 90, B >= 80, C >= 70, D >= 60, F < 60. Score below 80, unresolved semantic markers, or QUAL-02 warnings -> "Manual review required".

Report: command run, generated file path, score + grade, manual review status, top blockers, whether the mock-review pass ran and was accepted or rolled back, and whether interactive auth recovery was triggered.
