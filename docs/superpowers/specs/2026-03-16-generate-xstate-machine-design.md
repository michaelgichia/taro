# Design: Convert `generate.ts` Pipeline to XState Flat Sequential Machine

**Date:** 2026-03-16
**Status:** Approved
**Goal:** Replace the imperative `action` handler in `src/cli/commands/generate.ts` with an XState v5 flat sequential state machine to improve state predictability and eliminate unnecessary conditional logic.

---

## Motivation

The current `action` handler in `createGenerateCommand` is a ~500-line sequential async function with:

- **6 mutable `let` variables** (`visualAuth`, `packageProfile`, `bootstrappedState`, `contextProfileReason`, `shouldOverwriteExistingOutput`, `visualState`) that are silently reassigned mid-flow
- **Nested `if/else` blocks** and a try/catch with early `process.exit` calls that act as implicit state transitions
- **No explicit state model** — the current phase of execution is invisible at any point in time

XState makes every phase and every branch a first-class named entity, eliminating the need to track implicit state through mutable variables.

---

## Approach: Flat Sequential Machine (XState v5)

A single `generateMachine` with 18 top-level states. Each async phase is a `fromPromise` actor. Synchronous side-effects (logging) become `entry` actions. Guards replace `if/else` branching.

XState version: **v5** (`xstate@^5`) — added as a production dependency.

---

## Machine Context

Defined once in `generate.utils.ts` and imported by all other files. All `let` variable reassignments become typed, immutable context fields updated only via `assign`. The `shouldOverwriteExistingOutput` variable maps to `shouldOverwrite`.

```typescript
// generate.utils.ts — single source of truth for this type
export interface GenerateMachineContext {
  // Inputs
  filePath: string
  projectRoot: string
  commandOptions: CommandOptions
  debugReporter: SelectorDebugReporter
  findings: Finding[]

  // Parse
  normalizedRecording?: NormalizedRecording
  defaultOutputPath?: string

  // State loading
  hadState?: boolean
  bootstrappedState?: TaroBootstrapResult
  overrides?: TaroOverrides
  packageProfile?: ResolvedTaroPackageProfile | null

  // Auth resolution
  explicitAuthPath?: ResolvedFilePath | null
  explicitInstructionsPath?: ResolvedFilePath | null
  visualAuth?: TaroPlaywrightAuthProfile | null

  // Visual preflight
  // NOTE: capturingVisual reads normalizedRecording in its pre-enrichment form
  // (before searchingContext enriches it with canonical semantic markers).
  // This matches current behaviour: visual preflight runs before semantic enrichment.
  earlyAnalyzedRecording?: AnalyzedRecording
  recordingUrl?: string
  visualState?: VisualState | null

  // Repo context
  contextMatches?: RepoContextMatch[]
  contextProfileReason?: string | null

  // Profile refinement
  staleness?: { stale: boolean; reason?: string } | null

  // Analyzed recording
  analyzedRecording?: AnalyzedRecording
  markerAwareRecording?: NormalizedRecording
  recoveredVisualAuth?: TaroPlaywrightAuthProfile | null
  mockAnalysis?: MockAnalysis | null

  // Planning
  jsSuitePlan?: JsSuitePlan | null
  outputPath?: string
  resolvedRenderTargetFile?: string | null
  boundarySupportPlan?: BoundarySupportPlan
  generationRenderTarget?: RepoRenderTargetCandidate | null
  generationRenderHelper?: EffectiveRenderHelper

  // Selector resolution
  resolvedJsGeneration?: ResolvedJsGeneration

  // Code generation
  // candidateAssessment is always populated before assessingOutput is entered.
  // generateCodeActor throws on failure, transitioning to failed instead.
  // Test harnesses must satisfy this invariant when mocking generateCodeActor.
  generatedCode?: string
  hydratedSuitePlan?: JsSuitePlan | null
  scoreResult?: ScoreResult
  boundaryPolicyWarnings?: string[]
  candidateAssessment?: OutputAssessment

  // Output decision
  existingCode?: string | null
  existingAssessment?: OutputAssessment | null
  shouldOverwrite?: boolean

  // Write result
  // writeOutputActor is fire-and-forget: it writes the file and returns void.
  // finalizeActor reads outputPath from context (set in planning) and needs no
  // additional assign from writing.

  // Error
  error?: Error
}
```

---

## State Topology

18 states. Two terminal states: `done` and `failed` (both `type: 'final'`). The `idle` state uses an XState v5 `always` transition to immediately enter `validating` on machine start — it has no `onError` because the `always` transition is unconditional and synchronous. The `refiningProfile` state has a self-cycle through `refreshingProfile` for stale profile detection.

```
idle ──[always]──► validating → parsing → loadingState → capturingVisual
                 → searchingContext → refiningProfile ⟲ refreshingProfile
                 → analyzingRecording → analyzingMocks → planning
                 → resolvingSelectors → generating → assessingOutput
                 → writing → finalizing → done (final)

All states except idle and assessingOutput → [onError] → failed (final)
assessingOutput → [onError] → done  (intentional: preserve existing on assessment failure)
```

### State details

| State | Async actor | `onDone` target | `onError` target | Assigns to context |
|---|---|---|---|---|
| `idle` | none | `validating` (always) | — (unreachable: always fires synchronously) | — |
| `validating` | `validateFileActor` | `parsing` | `failed` | — |
| `parsing` | `parseRecordingActor` | `loadingState` | `failed` | `normalizedRecording`, `defaultOutputPath` |
| `loadingState` | `loadStateActor` | `capturingVisual` | `failed` | `hadState`, `bootstrappedState`, `overrides`, `packageProfile`, `explicitAuthPath`, `explicitInstructionsPath`, `visualAuth` |
| `capturingVisual` | `captureVisualActor` | `searchingContext` | `failed` | `earlyAnalyzedRecording`, `recordingUrl`, `visualState` |
| `searchingContext` | `searchContextActor` | `refiningProfile` | `failed` | `normalizedRecording` (enriched, overwrites pre-enrichment value), `contextMatches` |
| `refiningProfile` | `refineProfileActor` | `refreshingProfile` (if stale) or `analyzingRecording` | `failed` | `packageProfile`, `contextProfileReason`, `staleness` |
| `refreshingProfile` | `refreshProfileActor` | `refiningProfile` | `failed` | `bootstrappedState`, `overrides`, `packageProfile`, `contextProfileReason`, `staleness` |
| `analyzingRecording` | `analyzeRecordingActor` | `analyzingMocks` | `failed` | `analyzedRecording`, `markerAwareRecording`, `recoveredVisualAuth`, `visualAuth` |
| `analyzingMocks` | `analyzeMocksActor` | `planning` | `failed` | `mockAnalysis` |
| `planning` | `planGenerationActor` | `resolvingSelectors` | `failed` | `jsSuitePlan`, `outputPath`, `resolvedRenderTargetFile`, `boundarySupportPlan`, `generationRenderTarget`, `generationRenderHelper` |
| `resolvingSelectors` | `resolveSelectorsActor` | `generating` | `failed` | `resolvedJsGeneration` |
| `generating` | `generateCodeActor` | `assessingOutput` | `failed` | `generatedCode`, `hydratedSuitePlan`, `scoreResult`, `boundaryPolicyWarnings`, `candidateAssessment` |
| `assessingOutput` | `assessOutputActor` | `writing` (shouldWrite) or `done` (shouldKeepExisting) | `done` | `existingCode`, `existingAssessment`, `shouldOverwrite` |
| `writing` | `writeOutputActor` | `finalizing` | `failed` | — (fire-and-forget; `outputPath` already in context from `planning`) |
| `finalizing` | `finalizeActor` | `done` | `failed` | — (side-effects only: syntax verification + Taro state update) |
| `done` | none (final) | — | — | — |
| `failed` | none (final) | — | — | `error` |

---

## Guards

Named guards replace every `if/else` branch in the action handler. All guards are defined in `generate.utils.ts` and injected into the machine via `setup({ guards })`.

```typescript
// generate.utils.ts
export const generateMachineGuards = {
  // refiningProfile → refreshingProfile when profile is stale
  isProfileStale: ({ context }: { context: GenerateMachineContext }) =>
    Boolean(context.staleness?.stale),

  // assessingOutput → writing: no existing file, or candidate is strictly better
  // candidateAssessment is guaranteed non-null by generateCodeActor invariant.
  shouldWrite: ({ context }: { context: GenerateMachineContext }) =>
    !context.existingCode ||
    compareOutputAssessments(context.candidateAssessment!, context.existingAssessment!) > 0,

  // assessingOutput → done: existing file exists and candidate is not better
  shouldKeepExisting: ({ context }: { context: GenerateMachineContext }) =>
    Boolean(context.existingCode) &&
    compareOutputAssessments(context.candidateAssessment!, context.existingAssessment!) <= 0,
}
```

**Exhaustiveness proof for `shouldWrite` / `shouldKeepExisting`:**

| `existingCode` | `compareOutputAssessments` | `shouldWrite` | `shouldKeepExisting` |
|---|---|---|---|
| falsy | any | true | false |
| truthy | > 0 | true | false |
| truthy | ≤ 0 | false | true |

The two guards are mutually exclusive and collectively exhaustive across all possible inputs. Exactly one is always true when `assessingOutput.onDone` fires.

`hasBothAuthSources` and `screenshotsEnabled` are **not** state-transition guards. They are used as conditions inside actor implementations:

- `hasBothAuthSources`: checked inside `loadStateActor` to emit the "preferring --auth" warning before computing `visualAuth`
- `screenshotsEnabled`: checked inside `captureVisualActor` to decide whether to pass `authRecovery` options to `maybeCaptureVisualState`

`hasRecoveredAuth` is not a transition guard. `analyzeRecordingActor` always returns `recoveredVisualAuth` (null or a value). The `assign` on `analyzingRecording.onDone` unconditionally sets `visualAuth` to `recoveredVisualAuth ?? context.visualAuth`.

### assessingOutput branching (intentional onError → done)

`assessingOutput.onError` transitions to `done` — the single intentional exception to the general `onError → failed` rule. This preserves the current behaviour: when existing output cannot be assessed, Taro keeps it rather than failing.

```
assessingOutput
  ├─ onDone [shouldWrite]        ──► writing
  ├─ onDone [shouldKeepExisting] ──► done
  └─ onError                     ──► done   // intentional: preserve existing on assessment error
```

### refiningProfile self-cycle

```
refiningProfile
  ├─ onDone [isProfileStale]  ──► refreshingProfile ──onDone──► refiningProfile
  │                                                  ──onError─► failed
  └─ onDone [!isProfileStale] ──► analyzingRecording
```

---

## Actors

14 `fromPromise` actors defined in `generate.actors.ts`. Each receives typed `input` projected from context; returns only new context fields. `writeOutputActor` and `finalizeActor` return `void`.

### Actor injection pattern

`createGenerateMachine()` accepts actors as a parameter to allow injection in tests:

```typescript
// generate.machine.ts
export function createGenerateMachine(actors: GenerateMachineActors) {
  return setup({
    actors,
    guards: generateMachineGuards,
  }).createMachine({ ... })
}
```

`generate.ts` imports both the machine factory and the real actors, then passes them in:

```typescript
// generate.ts
import { createGenerateMachine } from './generate.machine.ts'
import * as actors from './generate.actors.ts'

createActor(createGenerateMachine(actors), { input: initialContext }).start()
```

Tests inject mock actors instead of the real ones — no real Playwright or filesystem calls needed.

### Actor input types (all 14)

All input types are defined in `generate.utils.ts` to prevent circular imports. Actors import types from `generate.utils.ts`; the machine imports types from `generate.utils.ts`. Neither imports from the other.

| Actor | Input type name |
|---|---|
| `validateFileActor` | `ValidateFileActorInput` |
| `parseRecordingActor` | `ParseRecordingActorInput` |
| `loadStateActor` | `LoadStateActorInput` |
| `captureVisualActor` | `CaptureVisualActorInput` |
| `searchContextActor` | `SearchContextActorInput` |
| `refineProfileActor` | `RefineProfileActorInput` |
| `refreshProfileActor` | `RefreshProfileActorInput` |
| `analyzeRecordingActor` | `AnalyzeRecordingActorInput` |
| `analyzeMocksActor` | `AnalyzeMocksActorInput` |
| `planGenerationActor` | `PlanGenerationActorInput` |
| `resolveSelectorsActor` | `ResolveSelectorsActorInput` |
| `generateCodeActor` | `GenerateCodeActorInput` |
| `assessOutputActor` | `AssessOutputActorInput` |
| `writeOutputActor` | `WriteOutputActorInput` |
| `finalizeActor` | `FinalizeActorInput` |

> Note: `finalizeActor` is listed separately from the 14 `fromPromise` actors in the topology because `writing` also has a `writeOutputActor`. The total count of actors is 15 including `finalizeActor`. The earlier reference to "14 actors" was an off-by-one; the correct count is **15**.

### `finalizeActor` responsibilities

`finalizeActor` wraps two operations currently in `finalizeGeneratedOutput`:
1. **Syntax verification** — calls `verifySyntax(context.generatedCode, context.outputPath)`; throws if invalid (triggering `onError → failed`)
2. **State update** — calls `refreshTaroState` and `appendGeneratedTestRecord` (best-effort; swallows errors internally)

Returns `void`. `done.entry` in `generate.ts` handles the success log and `process.exit`.

### Example actor

`captureVisualActor` receives `normalizedRecording` (set by `parseRecordingActor`) as input. It calls `analyzeRecording` internally to produce `earlyAnalyzedRecording`, then runs `maybeCaptureVisualState`. Both `earlyAnalyzedRecording` and `visualState` are outputs — neither is an input to this actor.

```typescript
// generate.actors.ts
import type { CaptureVisualActorInput } from './generate.utils.ts'
// CaptureVisualActorInput = Pick<GenerateMachineContext,
//   'normalizedRecording' | 'visualAuth' | 'projectRoot' | 'commandOptions'>

export const captureVisualActor = fromPromise(async ({
  input,
}: { input: CaptureVisualActorInput }) => {
  const earlyAnalyzedRecording = analyzeRecording(input.normalizedRecording!)
  const recordingUrl = findRecordingUrl(earlyAnalyzedRecording)
  const visualState = await maybeCaptureVisualState({
    analyzedRecording: earlyAnalyzedRecording,
    auth: input.visualAuth,
    authRecovery: input.commandOptions.screenshots !== false ? { ... } : undefined,
    projectRoot: input.projectRoot,
    recording: input.normalizedRecording!,
    url: recordingUrl,
  })
  return { earlyAnalyzedRecording, recordingUrl, visualState }
})
```

Pure helper functions (≈ 60 functions) are not converted — they remain pure functions called from inside actors. `summarize*`, `emit*`, and `log*` functions move to `entry` actions on the state that follows the phase they describe.

---

## File Structure

```
src/cli/commands/
├── generate.ts              ~150 lines   CLI wiring: parse args → start machine → subscribe to terminal states
├── generate.machine.ts      ~300 lines   createGenerateMachine(actors), states, guards, assign actions
├── generate.actors.ts       ~400 lines   15 fromPromise actors (one export per actor)
└── generate.utils.ts        ~3200 lines  GenerateMachineContext type, actor input types,
                                          generateMachineGuards, pure helpers, generateCommandInternals
```

**Note on `generate.utils.ts` size:** The ~3200 line estimate exceeds the project's 800-line guideline. This is an intentional carry-over — the utility functions are not changed in this migration. A follow-up task will split `generate.utils.ts` by domain (e.g., `generate.utils.coverage.ts`, `generate.utils.context.ts`, `generate.utils.scoring.ts`).

**Dependency graph (no circular imports):**

```
generate.ts
  └── generate.machine.ts    (factory + context type)
  └── generate.actors.ts     (real actor implementations)

generate.machine.ts
  └── generate.utils.ts      (GenerateMachineContext, guards, entry action helpers)

generate.actors.ts
  └── generate.utils.ts      (actor input types, pure helpers)
  └── #core/*                (async operations)

generate.utils.ts
  └── #core/* types only     (no runtime imports from generate.* files)
```

`generate.machine.ts` never imports from `generate.actors.ts`. Actors are passed into `createGenerateMachine(actors)` at call time.

### `generate.ts` (after)

Responsibilities:
- Parse CLI options into `GenerateMachineContext` initial values
- Import real actors from `generate.actors.ts`
- Call `createActor(createGenerateMachine(actors), { input }).start()`
- Subscribe: `done` state → call `flushFindings(context.findings)` then `process.exit(0)`
- Subscribe: `failed` state → call `debugReporter.persist()` then `process.exit(2)`
- `flushFindings` is called **only here** (not in `done.entry` inside the machine)

### `generate.machine.ts`

Responsibilities:
- Export `createGenerateMachine(actors: GenerateMachineActors)` factory
- Export `GenerateMachineActors` type
- Import `GenerateMachineContext` and `generateMachineGuards` from `generate.utils.ts`
- Define all 18 states, transitions, guards (by name), and `assign` actions
- Define `entry` actions that call `summarize*`/`emit*` helpers imported from `generate.utils.ts`

### `generate.actors.ts`

Responsibilities:
- Export 15 `fromPromise` actors (one per async phase)
- Import actor input types from `generate.utils.ts`
- Import async core functions from `#core/*` modules
- Import pure helpers from `generate.utils.ts` as needed

### `generate.utils.ts`

Responsibilities:
- Define and export `GenerateMachineContext` interface
- Define and export all 15 actor input types
- Define and export `generateMachineGuards` object
- Export all pure helper functions (≈ 60 functions)
- Export `generateCommandInternals` (unchanged, preserves test compatibility)
- No XState imports

---

## Error Handling

All `onError` transitions lead to `failed` except `assessingOutput` (intentional, documented above).

`debugReporter.persist()` and `process.exit(2)` are called **only** in `generate.ts`'s `failed` subscription — not in any `entry` action inside the machine. The `failed` state has no `entry` action.

`flushFindings` is called **only** in `generate.ts`'s `done` subscription — not inside the machine. The `findings` array is always empty on the `assessingOutput.onError → done` path (no findings are appended before `assessingOutput`), so calling `flushFindings` there is harmless and produces no output.

---

## Testing

- **`generate.utils.ts`** pure functions: unit-tested as before (no changes to existing tests)
- **`generate.actors.ts`** actors: unit-tested by providing mock `input` and asserting returned context updates; no real Playwright or filesystem calls
- **`generate.machine.ts`** machine: tested by passing mock actors into `createGenerateMachine(mockActors)` and running with `createActor`; assert state transitions and context assignments. Test harnesses must populate `candidateAssessment` in the mock `generateCodeActor` output to satisfy the `assessingOutput` guard invariant.

---

## Migration Notes

- Install `xstate@^5` as a production dependency
- `GenerateMachineContext`, actor input types, and `generateMachineGuards` are defined in `generate.utils.ts`
- `generate.machine.ts` imports context type and guards from `generate.utils.ts`; it does not re-export them
- `generateCommandInternals` moves to `generate.utils.ts` — existing test import paths are updated accordingly
- No changes to any `#core/*` modules
- No changes to any other CLI commands
- Existing tests for pure helpers continue to work without modification
