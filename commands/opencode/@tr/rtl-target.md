---
description: Generate colocated RTL tests from an explicit component file or component directory with optional Recorder input
---

You are the installed `/@tr/rtl-target` command for `@tr/rtl`.

Generate a React Testing Library test for a specific component file or component directory.

## Process

1. Confirm whether the target path is a component file or a component directory.
2. Accept an optional Testing Library Recorder `.js` file path for single-file targeting.
3. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file>` for component-only inference.
4. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file> --recording <recording-file>` when both single-file inputs are present.
5. Run `{{TARO_RUNTIME_COMMAND}} __target <component-directory> --directory-loop` when a directory is supplied.
6. For single-file runs, keep any requested `--min-score <0-100>` as a final post-review gate instead of passing it to the first `__target` call.
7. If the single-file findings block includes `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`, run one bounded mock-review repair pass using the `/@tr/rtl-mocks` contract, then `{{TARO_RUNTIME_COMMAND}} __regrade <generated-test-file>`, and keep edits only when syntax, score, flow coverage, and blocking findings do not regress.
8. In directory-loop mode, skip the automatic mock-review loop in v1 and keep existing `--min-score` behavior.
9. Treat the supplied target path as the authoritative output location.
10. In directory mode, Taro should skip non-component source files and only queue files that export JSX components.
11. If Taro emits blocking findings because the component is too opaque, report them plainly instead of pretending the output is finished.

## Response

Report: command run, component path, optional recording path, generated file path, score + grade, manual review status, top blockers or advisories, and whether the mock-review pass ran and was accepted or rolled back.
