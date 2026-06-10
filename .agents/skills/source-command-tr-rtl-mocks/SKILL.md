---
name: "source-command-tr-rtl-mocks"
description: "Review mock targets, provider boundaries, fixture reuse, and safe mock-scoped follow-up for a generated RTL test."
---

# source-command-tr-rtl-mocks

Use this skill when the user asks to run the migrated source command `@tr-rtl-mocks`.

## Command Template

<objective>
Review a generated RTL test for mock targets, provider boundaries, fixture reuse, and one safe post-generation repair pass. End every response with exactly one fenced `json` block whose top-level object is `MockReviewFeedback`.
</objective>

<process>
1. Confirm the generated test path and stop if it is missing.
2. Identify the external boundaries the test crosses.
3. Keep only the minimum mocks needed for deterministic behavior.
4. Reuse existing repo wrappers, fixtures, and shared mock support before proposing new patterns.
5. Auto-apply only safe mock-scoped fixes:
   - replace inline shared-boundary mocks with learned shared support imports
   - remove forbidden boundary or package mocks while keeping wrappers real
   - move `vi.mock(...)` or `jest.mock(...)` factories to module scope
   - replace mutable shared mock-control state with hoisted handles plus per-test implementations
   - add missing mutation lifecycle setup or assertions only when repo evidence already exists
6. Manual-only follow-up when the fix would require invented API shapes, invented fixture payloads, or brand-new support modules without repo evidence.
7. Summarize the important boundaries, instability patterns, mutation lifecycle gaps, fixture or helper reuse, and any manual follow-up.
8. End with exactly one fenced `json` block using this shape:

```json
{
  "MockReviewFeedback": {
    "should_apply": true,
    "auto_apply": [],
    "manual_follow_up": [],
    "blocking_reasons": [],
    "quality_expectation": "Expected to improve mock stability without lowering score or flow coverage."
  }
}
```
</process>
