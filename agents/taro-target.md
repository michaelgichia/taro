---
name: "@taro-test/rtl-target"
description: "Generate repository-aware React Testing Library tests from a specific component file, with an optional Testing Library Recorder `.js` export to supply concrete interaction flow."
---

# Taro Target

Invoke this skill with `$@taro-test/rtl-target`.

## Purpose

Generate a colocated RTL test for an explicit component path.

- The component file path is required.
- A Recorder `.js` file is optional.
- When a Recorder file is present, Taro must keep that behavioral evidence but force the supplied component as the render target.
- When no Recorder file is present, Taro must infer a production-oriented render contract from the component's accessible surface and nearby repo conventions.

## Workflow

1. Confirm the component file path.
2. If the user also has a Recorder `.js` file, capture that path too.
3. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file>` when no recording is provided.
4. Run `{{TARO_RUNTIME_COMMAND}} __target <component-file> --recording <recording-file>` when both inputs are provided.
5. Report the written test path, score and grade, manual review status, and any blockers or follow-up findings.

## Guardrails

- Never replace the supplied component with a repo-inferred render target.
- Keep generation colocated next to the supplied component basename.
- Treat component-only inference conservatively; if the component surface is too opaque, report the blocking finding instead of fabricating a weak smoke test.
- Do not run a second hand-written parser for Recorder input. Let Taro own the parsing pipeline.

## Response Contract

Return:

- command run
- component path
- optional recording path
- generated file path
- score and grade
- whether manual review is still required
- the top blockers or advisories that still matter
