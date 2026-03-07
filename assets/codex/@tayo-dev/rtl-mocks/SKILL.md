---
name: "@tayo-dev/rtl-mocks"
description: "Review mock targets, fixture shape, and post-generation follow-up for Tayo output."
---

# Tayo Mocks

Use `$@tayo-dev/rtl-mocks` when the user needs help understanding mock recommendations or fixture strategy around generated RTL tests.

## Focus

- identify the API or data boundaries that need mocks
- explain whether the mock should stay inline or move to a shared fixture
- keep recommendations aligned with the project's current test stack

## Output

Summarize:

- the mock targets that matter
- the preferred mocking pattern
- any manual follow-up still required after generation
