---
name: "@taro-test/rtl:target"
description: Generate repository-aware RTL tests from an explicit component file or component directory with optional Recorder input.
argument-hint: "<path/to/component-or-directory>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
argument-instructions: |
  Accept exactly one required argument: the path to the component file or component directory to test.
  If the argument is a directory, run target mode with `--directory-loop`.
  If the user also provides a Recorder file path in the prompt, pass it through only for single-file targeting.
  Example: /@taro-test/rtl:target src/features/CheckoutForm.tsx
---

<objective>
Generate a colocated React Testing Library test for a specific component file or component directory.

Taro must:

- treat the supplied target path as the render target or directory root of record
- optionally combine a single component target with a Recorder `.js` export when one is supplied
- infer conservative, user-visible assertions from the component itself when no Recorder file exists
- run directory-loop mode when the supplied path is a directory, skipping non-component source files
- keep boundary warnings or blocking findings explicit instead of faking confidence

Output: a generated test written next to the supplied component, plus a report containing the command run, component path, optional recording path, generated file path, score and grade, manual review status, and the most important blockers or advisories. </objective>

<process>
1. Confirm whether the target path is a component file or a component directory.
2. Accept an optional Recorder `.js` file path only when the target is a single file.
3. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file>` for component-only generation.
4. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file> --recording <recording-file>` when both single-file inputs are present.
5. Run `{{TARO_RUNTIME_COMMAND}} __target <component-directory> --directory-loop` when the target path is a directory.
6. The supplied path is authoritative for output placement.
7. In directory mode, skip non-component `.ts` or `.tsx` files and report the tracker path.
8. If the component surface is too opaque for safe inference, report the blocking finding instead of improvising a weak draft.
9. Report the generated file path or tracker path, score and grade, whether manual review is required, and the top blockers or advisories.
</process>
