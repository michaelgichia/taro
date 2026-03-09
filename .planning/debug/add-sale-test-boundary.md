---
status: awaiting_human_verify
trigger: "[$gsd-debug], this is the test that was generated with the current version of Taro [AddSaleForm.test.tsx](sample/AddSaleForm.test.tsx) . It is an okay test, but with some anti-patterns. One of them is mocking the useQuery hooks. Tests that mock entire internal modules are often a sign that the architecture made the UI hard to test."
created: 2026-03-09T18:18:00Z
updated: 2026-03-09T18:18:00Z
---

## Current Focus

hypothesis: The generated JS suite crosses the wrong boundary because Taro has no suite-planning layer that can distinguish module-level flows from leaf-component tests before string emission.
test: Add a small JS suite planner that assesses render-boundary risk from flow shape plus repo mock evidence, thread warnings into generation, and penalize placeholder output so Taro stops overstating confidence.
expecting: JS generation should surface unresolved module-boundary risk explicitly, collapse stateful wizard flows into one scenario draft, and lower scores for placeholder `<App />` output.
next_action: Have the user confirm whether the new boundary warnings and scoring behavior match the intended direction for Add Sale style flows.

## Symptoms

expected: Taro should understand the correct testing boundary so generated tests resemble sample/sample-add-sale-test.tsx: assert user-visible behavior, avoid mocking internal query hooks, and avoid overfitting to implementation details.
actual: sample/AddSaleForm.test.tsx mocks internal modules including @digitax/data-layer query hooks, embeds marker-derived checkpoints inside helpers, and targets AddSaleForm directly rather than the broader flow boundary shown in the gold standard.
errors: No runtime error reported; the issue is generated test architecture and fidelity.
reproduction: Compare sample/AddSaleForm.test.tsx with sample/sample-add-sale-test.tsx, then trace the current generator output path that would create the former style.
started: Present in the current version of Taro as of 2026-03-09.

## Eliminated

- hypothesis: The issue is caused by a single mock-generation heuristic in the old orchestrator path.
  evidence: The active CLI generation path is `src/cli/commands/generate.ts`, which does not use the placeholder orchestrator and had no render-boundary planning at all.
  timestamp: 2026-03-09T18:18:00Z

## Evidence

- timestamp: 2026-03-09T18:18:00Z
  checked: sample/AddSaleForm.test.tsx and sample/sample-add-sale-test.tsx
  found: The gold standard uses a broader `SalesModule` boundary, shared data-layer mocks, and separates synchronization from assertions, while the generated sample targets `AddSaleForm` directly and inlines internal hook mocks.
  implication: The failure is architectural boundary selection, not just query syntax.

- timestamp: 2026-03-09T18:18:00Z
  checked: src/cli/commands/generate.ts, src/core/generator.ts, src/templates/test-template.ts
  found: JS generation converted analyzed steps directly into code and always rendered `<App />`; no planner existed to choose a repo-local render target or call out uncertainty.
  implication: Taro had nowhere to represent "prefer module boundary, unresolved exact target".

- timestamp: 2026-03-09T18:18:00Z
  checked: .planning/research/PITFALLS.md and .planning/ROADMAP.md
  found: The missing behavior is already identified in v1.3 research as Phase 15 "Structured Suite Planning & Repo-aware Generation".
  implication: The bug matches a known product gap, so the fix should be a truthful planning layer rather than another transcript heuristic.

- timestamp: 2026-03-09T18:18:00Z
  checked: src/core/suite-planner.ts, src/cli/commands/generate.ts, src/core/scorer.ts
  found: Added render-boundary assessment for stateful wizard flows, generation-time boundary warnings, and score penalties for placeholder `<App />` output plus unresolved boundary comments.
  implication: Taro now admits when a flow should use a broader module/container boundary and stops scoring placeholder output as if it were production-ready.

- timestamp: 2026-03-09T18:18:00Z
  checked: npm run test -- --run src/core/suite-planner.test.ts src/core/scorer.test.ts src/core/generator.test.ts src/cli/commands/generate.test.ts; npm run build
  found: Focused tests passed and TypeScript build succeeded.
  implication: The change is mechanically sound and covered by regression tests, pending user confirmation on output direction.

## Resolution

root_cause: The JS generation path had no suite-planning boundary between parsed recorder steps and code emission, so it could not distinguish a stateful, module-level business flow from a leaf component test and therefore could not call out unsafe internal mock boundaries.
fix: Added `src/core/suite-planner.ts` to assess render-boundary risk from flow shape and repo mock signals, integrated it into JS generation warnings in `src/cli/commands/generate.ts`, and penalized placeholder `<App />` / unresolved-boundary output in `src/core/scorer.ts`.
verification: Focused Vitest coverage passed for boundary planning and scoring, existing generator/generate command tests still passed, and `npm run build` completed successfully.
files_changed:
  - src/core/suite-planner.ts
  - src/core/suite-planner.test.ts
  - src/cli/commands/generate.ts
  - src/core/scorer.ts
  - src/core/scorer.test.ts
