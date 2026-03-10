---
name: "@tayo-dev/rtl:generate"
description: "Generate RTL tests from Recorder exports with Tayo"
---

<objective>
Generate a React Testing Library test from a Testing Library Recorder JS export or Chrome Recorder JSON export, interpret the score output, and guide the user through any required manual fixes.
</objective>

<process>
1. Confirm the recording file path and extension (.js preferred, .json supported).
2. If the output file already exists and the user did not ask to replace it, use --dry-run instead of overwriting.
3. Run `tayo generate <recording-file>` with appropriate flags.
4. Parse and report the score, grade, and blockers.
5. Work through the post-generation checklist for any issues found.
</process>

<scoring>
Tayo scores on four weighted dimensions. Grade: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.
Score below 80 or QUAL-02 marker failure → Tayo emits "Manual review required".

Query dimension (30%): getByRole = 100pts, getByLabelText = 80pts, getByText = 60pts, getByPlaceholderText = 50pts, getByTestId = 20pts. Each tayo-query-checkpoint comment deducts 3pts (capped at −40).

Assertion dimension (25%): toHaveValue/toBeChecked/toHaveTextContent/toBeVisible = full credit. toBeInTheDocument = 30% credit. No assertions = 0.

Structure dimension (20%): Base 50. describe() block +20. Each extra it() block +15 (cap +30). render(<App />) −25. tayo-boundary-warning −20. Single test >2000 chars −20.

Boundary dimension (25%): Start 100. leaf-render-boundary −35. inline-hook-mock −30. helper-embedded-assertion −20. positional-control-selection −15.
</scoring>

<boundary-issues>
tayo-boundary-warning comments mark one of four issues:

leaf-render-boundary (−35): Test renders *Form, *Dialog, *Modal, or *Drawer directly while the flow involves container-level interaction. Fix: render the nearest page/module component that owns the trigger button and the dialog lifecycle.

inline-hook-mock (−30): vi.mock/jest.mock defines use*Query or use*Mutation hooks inline. Fix: move hook mocks to a shared fixture or raise the render boundary.

helper-embedded-assertion (−20): A helper function outside the test body contains expect(). Fix: assertions belong in the it() body; helpers handle setup and navigation only.

positional-control-selection (−15): getAllByRole('button')[2] positional indexing. Fix: scope with within(container) or use a more specific accessible name.
</boundary-issues>

<post-generation-checklist>
1. Fix render(<App />) — find the narrowest component that owns the trigger and expected outcome.
2. Resolve tayo-query-checkpoint comments — apply the query hierarchy: getByRole > getByLabelText > getByText > getByPlaceholderText > getByTestId.
3. Upgrade toBeInTheDocument() — replace with toHaveTextContent(), toHaveValue(), or toBeVisible() when the expected value is known.
4. Fix tayo-boundary-warning comments — apply the boundary fix from the boundary-issues section above.
5. Re-score — run `tayo generate --dry-run --force <file>` to confirm the score improved without overwriting manual edits.
</post-generation-checklist>

<response-contract>
Report: the command run, the generated file path, the score and grade (e.g. 82/100 B — query: 90 assertions: 75 structure: 80 boundary: 85), whether manual review is required, the top blockers, and which post-generation steps apply with specific guidance for each.
</response-contract>
