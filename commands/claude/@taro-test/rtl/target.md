---
name: "@taro-test/rtl:target"
description: Generate repository-aware RTL tests from an explicit component file with optional Recorder input.
argument-hint: "<path/to/component.tsx>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Bash
argument-instructions: |
  Accept exactly one required argument: the path to the component file to test.
  If the user also provides a Recorder file path in the prompt, pass it through with `--recording`.
  Example: /@taro-test/rtl:target src/features/CheckoutForm.tsx
---
<objective>
Generate a colocated React Testing Library test for a specific component file.

Taro must:
- treat the component path as the render target of record
- optionally combine that component target with a Recorder `.js` export when one is supplied
- infer conservative, user-visible assertions from the component itself when no Recorder file exists
- keep boundary warnings or blocking findings explicit instead of faking confidence

Output: a generated test written next to the supplied component, plus a report containing the command run, component path, optional recording path, generated file path, score and grade, manual review status, and the most important blockers or advisories.
</objective>

<process>
1. Confirm the component file path.
2. Accept an optional Recorder `.js` file path when the user has one.
3. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file>` for component-only generation.
4. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file> --recording <recording-file>` when both inputs are present.
5. The supplied component path is authoritative for the render target and output placement.
6. If the component surface is too opaque for safe inference, report the blocking finding instead of improvising a weak draft.
7. Report the generated file path, score and grade, whether manual review is required, and the top blockers or advisories.
</process>
