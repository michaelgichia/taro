# Entry Path Fidelity (Taro)

Purpose: Ensure generated tests preserve the real user entry path captured by recording preconditions (especially trigger actions before form interaction).

---

## Why This Exists

Recordings often start with a parent trigger action (button/tab/link) that opens the target UI. If generation skips that and renders child UI directly, tests lose behavioral fidelity and miss integration regressions.

---

## Detection Rules

Classify early-step preconditions from the recording:

1. Locate the first meaningful interaction steps (ignore viewport/title checks).
2. If these steps open a panel/modal/tab and later steps interact with a child form/content area, mark the trigger steps as required preconditions.

Examples:

- click "Add API KEY" then interact with `#addAPIKeyForm`
- click "Create Sale" then interact with sale modal form

---

## Generation Rules

When required preconditions exist:

1. Prefer rendering the parent component that contains the trigger.
2. Reproduce trigger action in test setup before child interaction.
3. Avoid direct harness shortcuts (for example `<Dialog open>`) unless parent composition is unavailable in source.

Fallback when parent cannot be rendered:

- Document limitation explicitly in output and state evidence.
- Use the closest harness, but keep a warning that fidelity is reduced.

---

## Verification Rules

Fail generation if all are true:

- recording has required precondition trigger(s),
- parent source composition is resolvable,
- generated test bypasses trigger path.

Expected repair behavior:

- regenerate once with parent-level render and trigger action.

---

## Evidence to Store

For each generated test, record:

- detected precondition trigger summary
- whether fidelity was preserved
- fallback reason (if any)
