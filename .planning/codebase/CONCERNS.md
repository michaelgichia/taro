# Concerns

## High-Value Risk Areas

### 1. Dual pipeline surfaces may drift

- [`src/cli/commands/generate.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.ts) and [`src/cli/commands/generate.machine.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/generate.machine.ts) represent the modern flow.
- [`src/core/orchestrator.ts`](/Users/michaelgichia/workspace/taro/src/core/orchestrator.ts) still contains an older monolithic pipeline and even a placeholder generation step.
- If both surfaces remain live, behavior and docs can diverge.

### 2. Very large coordination files

- [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts), [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts), [`src/core/resolver.ts`](/Users/michaelgichia/workspace/taro/src/core/resolver.ts), and [`src/core/component-targeting.ts`](/Users/michaelgichia/workspace/taro/src/core/component-targeting.ts) are high-complexity files.
- These are likely hotspots for regressions because they mix orchestration, heuristics, and IO-heavy behavior.

### 3. Process-exit behavior limits embeddability

- Several command-layer modules call `process.exit(...)` directly.
- That is fine for a CLI, but it makes reuse from libraries, tests, or editor integrations more brittle unless carefully wrapped.

### 4. Intentional TODO output can leak into generated tests

- Template and utility code intentionally emits TODO markers when Taro cannot prove a safe query or boundary.
- Files such as [`src/templates/test-template.ts`](/Users/michaelgichia/workspace/taro/src/templates/test-template.ts), [`src/core/utils.ts`](/Users/michaelgichia/workspace/taro/src/core/utils.ts), and [`src/core/component-targeting.ts`](/Users/michaelgichia/workspace/taro/src/core/component-targeting.ts) encode this behavior.
- This is product-intentional, but it means downstream quality depends on strong reporting and follow-up review.

### 5. Native/local-state dependencies increase environment sensitivity

- `better-sqlite3` introduces native dependency concerns for install/build environments.
- `.taro/` state, Playwright auth artifacts, and installed runtime skill surfaces can change behavior across machines even when git state is clean.

### 6. CI does not currently enforce every quality gate

- The inspected workflows run tests and builds, but not explicit lint or type-check jobs.
- That leaves some static-quality regressions to local developer discipline.

## Fragile Areas to Watch

- Selector resolution and replay recovery in [`src/core/resolver.ts`](/Users/michaelgichia/workspace/taro/src/core/resolver.ts).
- State/profile refresh logic in [`src/core/state.ts`](/Users/michaelgichia/workspace/taro/src/core/state.ts).
- Directory-loop and output reconciliation flows in [`src/cli/commands/target.ts`](/Users/michaelgichia/workspace/taro/src/cli/commands/target.ts).
- Runtime install asset definitions in `src/install/runtimes/`, where path mistakes can silently break agent entrypoints.

## Suggested Follow-Up Focus

- Clarify whether [`src/core/orchestrator.ts`](/Users/michaelgichia/workspace/taro/src/core/orchestrator.ts) is legacy-only or still supported.
- Consider isolating more command exits behind return codes/results.
- Add CI jobs for lint and type-check if they are intended release requirements.
- Keep pressure on tests around large orchestration files whenever selector, boundary, or state heuristics change.
