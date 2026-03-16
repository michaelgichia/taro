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

A single `generateMachine` with 17 top-level states. Each async phase is a `fromPromise` actor. Synchronous side-effects (logging) become `entry` actions. Guards replace `if/else` branching.

XState version: **v5** (`xstate@^5`) — added as a production dependency.

---

## Machine Context

All `let` variable reassignments become typed, immutable context fields updated only via `assign`.

```typescript
interface GenerateMachineContext {
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
  earlyAnalyzedRecording?: AnalyzedRecording
  recordingUrl?: string
  visualState?: VisualState | null

  // Repo context
  contextMatches?: RepoContextMatch[]
  contextProfileReason?: string | null

  // Analyzed recording
  analyzedRecording?: AnalyzedRecording
  markerAwareRecording?: NormalizedRecording
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
  generatedCode?: string
  hydratedSuitePlan?: JsSuitePlan | null
  scoreResult?: ScoreResult
  boundaryPolicyWarnings?: string[]
  candidateAssessment?: OutputAssessment

  // Output decision
  existingCode?: string | null
  existingAssessment?: OutputAssessment | null
  shouldOverwrite?: boolean

  // Error
  error?: Error
}
```

---

## State Topology

17 states in sequential order. The `refiningProfile` state has a self-cycle for stale profile detection. The `assessingOutput` state has guard-based branching to skip writing when the candidate is not better.

```
idle → validating → parsing → loadingState → capturingVisual
     → searchingContext → refiningProfile ⟲ refreshingProfile
     → analyzingRecording → analyzingMocks → planning
     → resolvingSelectors → generating → assessingOutput
     → writing → finalizing → done

Any state → [onError] → failed
```

### State details

| State | Async actor | Assigns to context |
|---|---|---|
| `idle` | none (always-transition) | — |
| `validating` | `validateFileActor` | — |
| `parsing` | `parseRecordingActor` | `normalizedRecording`, `defaultOutputPath` |
| `loadingState` | `loadStateActor` | `hadState`, `bootstrappedState`, `overrides`, `packageProfile`, `explicitAuthPath`, `explicitInstructionsPath`, `visualAuth` |
| `capturingVisual` | `captureVisualActor` | `earlyAnalyzedRecording`, `recordingUrl`, `visualState` |
| `searchingContext` | `searchContextActor` | `normalizedRecording` (enriched), `contextMatches` |
| `refiningProfile` | `refineProfileActor` | `packageProfile`, `contextProfileReason`, `staleness` |
| `refreshingProfile` | `refreshProfileActor` | `bootstrappedState`, `overrides`, `packageProfile`, `contextProfileReason` |
| `analyzingRecording` | `analyzeRecordingActor` | `analyzedRecording`, `markerAwareRecording`, `visualAuth` (if recovered) |
| `analyzingMocks` | `analyzeMocksActor` | `mockAnalysis` |
| `planning` | `planGenerationActor` | `jsSuitePlan`, `outputPath`, `resolvedRenderTargetFile`, `boundarySupportPlan`, `generationRenderTarget`, `generationRenderHelper` |
| `resolvingSelectors` | `resolveSelectorsActor` | `resolvedJsGeneration` |
| `generating` | `generateCodeActor` | `generatedCode`, `hydratedSuitePlan`, `scoreResult`, `boundaryPolicyWarnings`, `candidateAssessment` |
| `assessingOutput` | `assessOutputActor` | `existingCode`, `existingAssessment`, `shouldOverwrite` |
| `writing` | `writeOutputActor` | — |
| `finalizing` | `finalizeActor` | — |
| `done` | none | — |
| `failed` | none | `error` |

---

## Guards

Named guards replace every `if/else` branch in the action handler.

```typescript
const guards = {
  // refiningProfile → refreshingProfile when stale
  isProfileStale: ({ context }) =>
    Boolean(context.staleness?.stale),

  // assessingOutput → writing (candidate is better or no existing file)
  shouldWrite: ({ context }) =>
    !context.existingCode ||
    compareOutputAssessments(context.candidateAssessment!, context.existingAssessment!) > 0,

  // assessingOutput → done (keep existing)
  shouldKeepExisting: ({ context }) =>
    Boolean(context.existingCode) &&
    compareOutputAssessments(context.candidateAssessment!, context.existingAssessment!) <= 0,

  // loadingState: warn when both auth sources provided
  hasBothAuthSources: ({ context }) =>
    Boolean(context.explicitAuthPath && context.explicitInstructionsPath),

  // analyzingRecording: update visualAuth when auth was recovered
  hasRecoveredAuth: ({ context }) =>
    Boolean(context.recoveredVisualAuth),

  // writing: skip screenshot artifacts
  screenshotsEnabled: ({ context }) =>
    context.commandOptions.screenshots !== false,
}
```

### assessingOutput branching

The most complex conditional block becomes three clean transitions:

```
assessingOutput
  ├─ onDone  [shouldWrite]        ──► writing
  ├─ onDone  [shouldKeepExisting] ──► done
  └─ onError                      ──► done   (preserve existing on assessment failure)
```

### refiningProfile self-cycle

```
refiningProfile
  ├─ onDone [isProfileStale]  ──► refreshingProfile ──► refiningProfile
  └─ onDone [!isProfileStale] ──► analyzingRecording
```

---

## Actors

14 `fromPromise` actors. Each receives typed `input` projected from context; returns only new context fields.

```typescript
// Pattern for all actors:
const exampleActor = fromPromise(async ({ input }: { input: ActorInput }) => {
  // ... async work using only input fields
  return { /* partial context update */ }
})
```

Pure helper functions (≈ 60 functions: `normalizeContextTerm`, `scoreContextTerm`, `buildFlowCoverageSummary`, `compareOutputAssessments`, etc.) are **not** converted — they remain pure functions called from inside actors.

`summarize*`, `emit*`, and `log*` functions move to `entry` actions on the state that follows the phase they describe.

---

## File Structure

```
src/cli/commands/
├── generate.ts              ~150 lines  CLI wiring only: parse args → start machine → subscribe to terminal states
├── generate.machine.ts      ~300 lines  createGenerateMachine(), GenerateMachineContext, states, guards, assign actions
├── generate.actors.ts       ~400 lines  14 fromPromise actors (one export per actor)
└── generate.utils.ts        ~3200 lines All pure helper functions moved from generate.ts
                                         generateCommandInternals re-exported for test compatibility
```

### `generate.ts` (after)

Responsibilities:
- Parse CLI options into `GenerateMachineContext` initial values
- Call `createActor(createGenerateMachine(), { input }).start()`
- Subscribe to `done` state → call `flushFindings` + `process.exit(0)`
- Subscribe to `failed` state → call `process.exit(2)`

### `generate.machine.ts`

Responsibilities:
- Export `GenerateMachineContext` type
- Export `createGenerateMachine()` factory using XState v5 `setup()`
- Define all 17 states, transitions, guards, and `assign` actions
- Import actors from `generate.actors.ts`
- Import pure helpers from `generate.utils.ts` for use in guards and `entry` actions

### `generate.actors.ts`

Responsibilities:
- Export one `fromPromise` actor per async phase
- Import all async core functions (`loadOrBootstrapTaroState`, `maybeCaptureVisualState`, etc.) from their original `#core/*` modules
- Import pure helpers from `generate.utils.ts` as needed

### `generate.utils.ts`

Responsibilities:
- Export all pure helper functions currently in `generate.ts`
- Export `generateCommandInternals` (unchanged, preserves test compatibility)
- No XState imports

---

## Error Handling

All `onError` transitions lead to `failed`. The `failed` state's `entry` action:
1. Calls `debugReporter.persist()`
2. Writes `error.message` to stderr
3. Calls `process.exit(2)`

The two `done`-path exits (keep existing output, normal completion) both call `flushFindings` in the `done` state's `entry` action.

---

## Testing

- `generate.utils.ts` pure functions: unit-tested as before (no change to existing tests)
- `generate.actors.ts` actors: unit-tested by providing mock `input` and asserting returned context updates
- `generate.machine.ts` machine: tested by running the machine with mock actors and asserting state transitions using XState's `@xstate/test` or `createActor` directly

---

## Migration Notes

- Install `xstate@^5` as a production dependency
- The `generateCommandInternals` export moves to `generate.utils.ts` — re-export from there
- No changes to any `#core/*` modules
- No changes to any other CLI commands
- Existing tests for pure helpers continue to work without modification
