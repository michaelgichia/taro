# Assertion Markers (Taro)

Purpose:
Allow non-technical users to mark "this should be asserted" during recording
without opening advanced Recorder assertion settings.

---

## Primary Marker: `dblClick`

User action pattern:

1. Trigger UI change (open modal, submit form, continue, save, etc.).
2. Double-click the visible target that proves the expected result.

Interpretation:

- Taro treats semantic `dblClick` events as `assertExists` markers.
- Marker assertions are generated as explicit RTL expectations in the closest
  relevant test block.

---

## Mapping Rules (Deterministic)

1. Identify `userEvent.dblClick(...)` events in parsed steps.
2. Use the dblClick target itself as the marker target (no copy chord required).
3. Build query hints in this order:
   - role + name (if `aria/` evidence exists)
   - text (if `text/` evidence exists)
   - label/placeholder (if input context is explicit)
4. If only CSS evidence exists, skip marker-to-assertion conversion and log
   limitation.

Important reliability note:

- DblClick markers on generic targets like modal containers, table rows, icons
  (`svg/path`), or dynamic radix/css selectors are often ambiguous.
- These ambiguous markers should be reported as unresolved rather than silently
  converted into weak assertions.

---

## Example Outcomes

- Marker dblClick on modal title after "Add Sale" click
  - Generate: assert dialog heading/title exists.
- Marker dblClick on validation text after empty submit
  - Generate: assert required-field error exists.
- Marker dblClick on success toast after save
  - Generate: assert success message exists.

---

## Guardrails

- Marker assertions are additive; they do not replace required happy/validation/failure tests.
- `highlight + copy` is not used for marker conversion.
- Never generate assertions from screenshots.
- Never infer hidden/internal implementation details from marker actions.
- If marker conversion fails due to ambiguous selectors, emit a clear warning
  with unresolved marker line references.
