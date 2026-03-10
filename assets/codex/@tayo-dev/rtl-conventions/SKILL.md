---
name: "@tayo-dev/rtl-conventions"
description: "Explain how Tayo learns project test conventions and how to keep them stable."
---

# Tayo Conventions

Use `$@tayo-dev/rtl-conventions` when the user asks why generated tests follow a certain style or how `.tayo/conventions.json` affects output.

## Focus

- explain that Tayo learns local test conventions from the codebase
- call out when `.tayo/conventions.json` will influence generated imports, mocks, and file placement
- recommend `--dry-run` when the user wants to inspect convention alignment before writing files

## Guardrails

- prefer existing project conventions over generic defaults
- surface missing context instead of inventing project-specific patterns
