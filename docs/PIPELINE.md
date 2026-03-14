# Taro Runtime Pipeline

This document defines the strict-order runtime flow for Taro's `__generate` command.

Scope:

- authoritative for `src/cli/commands/generate.ts`
- describes the installed runtime path used by Claude, Gemini, OpenCode, and Codex entrypoints
- intended to stay stable even when helper internals change

## Pipeline Contract

Taro's generator is ordered on purpose. Each stage produces evidence consumed by the next stage, so later modules must not run ahead of earlier ones.

If the execution order changes in `src/cli/commands/generate.ts`, update this document in the same change.

## Runtime Order

Modules execute in this order:

1. Intake
2. State bootstrap
3. Visual preflight
4. Repo grounding
5. Package resolution
6. Planning
7. Boundary shaping
8. Emission
9. Materialization

## Module Map

### 1. Intake

Validate the recorder export, load it, and normalize it into Taro's JS baseline.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/input-loader.ts`
- `src/core/baseline-normalizer.ts`

Outputs:

- parsed recording input
- normalized recording

### 2. State bootstrap

Load or bootstrap `.taro/state.json`, apply `.taro/overrides.json`, and resolve explicit auth inputs for the current run.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/state.ts`

Outputs:

- bootstrapped state
- initial package profile candidate
- override policy
- runtime auth configuration

### 3. Visual preflight

If the recording has a URL, run Playwright before repo matching. This stage confirms the recorded page when possible, handles optional auth recovery, and captures visual artifacts only after the expected page state is reached.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/resolver.ts`

Outputs:

- `VisualState`
- confirmed page landmarks
- starting-point screenshot or auth-checkpoint screenshot

### 4. Repo grounding

Use recording evidence plus confirmed visual context to search for relevant repo files, then enrich semantic markers from those matches.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/semantic-marker-enrichment.ts`

Outputs:

- ranked context matches
- enriched marker evidence

### 5. Package resolution

Resolve the effective package profile from grounded repo matches, then refresh stale learned state if necessary before continuing.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/state.ts`

Outputs:

- effective package profile
- refreshed state when needed
- resolved conventions surface

### 6. Planning

Analyze mock boundaries, build the suite plan, and assemble render-target candidates from both learned state and grounded repo context.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/mock-intelligence.ts`
- `src/core/suite-planner.ts`

Outputs:

- mock analysis
- raw suite plan
- render-target candidate set

### 7. Boundary shaping

Resolve the repo render target, plan shared boundary support, recover selector evidence, and hydrate the suite with the strongest trustworthy queries available.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/boundary-support.ts`
- `src/core/resolver.ts`

Outputs:

- resolved render target
- boundary support plan
- resolved query results
- hydrated suite plan

### 8. Emission

Generate the RTL test, apply boundary policy, compute quality signals, and emit review warnings before any successful write is reported.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/generator.ts`
- `src/core/scorer.ts`
- `src/core/boundary-intelligence.ts`

Outputs:

- generated test code
- score result
- marker and boundary diagnostics

### 9. Materialization

Write support files, write the generated test when the target path is allowed, verify syntax, and refresh `.taro/state.json` with the generation result.

Primary modules:

- `src/cli/commands/generate.ts`
- `src/core/writer.ts`
- `src/core/state.ts`

Outputs:

- generated test file
- support files
- updated package state

## Ordering Invariants

The runtime depends on these invariants:

- Visual preflight runs before repo grounding.
- Repo grounding runs before final package resolution.
- Planning completes before render-target selection is finalized.
- Boundary shaping completes before code emission.
- Scoring and warning emission happen before successful write completion is reported.
- State refresh happens after materialization as part of post-write bookkeeping.

## Practical Reading Guide

When you need the live runtime behavior, read these in order:

1. `src/cli/commands/generate.ts`
2. `src/core/resolver.ts`
3. `src/core/suite-planner.ts`
4. `src/core/generator.ts`
5. `src/core/state.ts`

That path mirrors the runtime contract more closely than the older high-level sketch in `src/core/orchestrator.ts`.
