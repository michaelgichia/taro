---
name: "source-command-tr-rtl-target"
description: "Generate repository-aware RTL tests from an explicit component file or component directory with optional Recorder input."
---

# source-command-tr-rtl-target

Use this skill when the user asks to run the migrated source command `@tr-rtl-target`.

## Command Template

<objective>
Generate a React Testing Library test for a specific component file or component directory, using a sibling `tests/` folder for target outputs.

Taro must:

- treat the supplied target path as the render target or directory root of record
- optionally combine a single component target with a Recorder `.js` export when one is supplied
- infer conservative, user-visible assertions from the component itself when no Recorder file exists
- run directory-loop mode when the supplied path is a directory, skipping non-component source files
- keep boundary warnings or blocking findings explicit instead of faking confidence

Output: a generated or reused target test path, plus a report containing the command run, component path, optional recording path, generated file path, score and grade, manual review status, and the most important blockers or advisories. </objective>

<process>
1. Confirm whether the target path is a component file or a component directory.
2. Accept an optional Recorder `.js` file path only when the target is a single file.
3. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __target <component-file>` for component-only generation.
4. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __target <component-file> --recording <recording-file>` when both single-file inputs are present.
5. Run `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __target <component-directory> --directory-loop` when the target path is a directory.
6. For single-file runs, keep any requested `--min-score <0-100>` as a final post-review gate instead of passing it to the first `__target` call.
7. If the single-file findings block includes `mock-boundary`, `mock-instability`, `mock-lifecycle`, or `mock-support`, run one bounded mock-review repair pass using the `/@tr-rtl/cli:mocks` contract, then `'/opt/homebrew/Cellar/node@24/24.14.0_1/bin/node' '/Users/michaelgichia/workspace/taro/dist/index.js' __regrade <generated-test-file>`, and keep edits only when syntax, score, flow coverage, and blocking findings do not regress.
8. In directory-loop mode, skip the automatic mock-review loop in v1 and keep existing `--min-score` behavior.
9. The supplied path is authoritative for the render target or directory root. For file targets, reuse exact existing component tests or place new outputs under the local `tests/` or `__tests__/` convention, defaulting to `tests/`. For directory targets, move immediate colocated test files into `tests/` and rewrite relative imports before processing components.
10. In directory mode, skip non-component `.ts` or `.tsx` files and report the tracker path.
11. If the component surface is too opaque for safe inference, report the blocking finding instead of improvising a weak draft.
12. Report the generated file path or tracker path, score and grade, whether manual review is required, and the top blockers or advisories.
</process>
