# Worked Example: Use `generate.ts` as the Repo-Local Template for a `state.ts`-Style Refactor

**Date:** 2026-03-24 **Status:** Reference Example **Purpose:** Show future AI workers exactly what "good" looks like in this repo when converting a monolithic async Commander pipeline into an XState v5 machine.

**Reference files:**

- `src/cli/commands/generate.ts`
- `src/cli/commands/generate.machine.ts`
- `src/cli/commands/generate.actors.ts`
- `src/cli/commands/generate-runtime-types.ts`

---

## 1. Split the File by Responsibility

The successful `gen` refactor uses four explicit layers.

| File | Responsibility |
| --- | --- |
| `generate.ts` | Commander wiring only |
| `generate.machine.ts` | state topology, transitions, entry logging, `assign` |
| `generate.actors.ts` | async work in `fromPromise` actors |
| `generate-runtime-types.ts` | context, actor input, and actor output types |

If a future `state.ts` refactor keeps orchestration, actors, and runtime types in one file, the result will be harder to reason about than the current `gen` split.

---

## 2. Bootstrap Pattern: Commander Owns Only Startup and Shutdown

The `generate.ts` command is the model to copy:

```ts
.action(async (file: string) => {
  const initialContext: GenerateMachineContext = {
    filePath,
    projectRoot,
    stdioContext: context,
    commandOptions,
    debugReporter,
    findings: [],
  };

  const finalState = await new Promise<{ value: string; context: GenerateMachineContext }>(
    (resolvePromise) => {
      const actor = createActor(createGenerateMachine(generateMachineActors), {
        input: initialContext,
      });

      actor.subscribe((state) => {
        if (state.value === "done" || state.value === "failed") {
          resolvePromise({
            value: state.value as string,
            context: state.context,
          });
        }
      });

      actor.start();
    }
  );
});
```

Why this shape is correct:

- the command gathers options and input only once
- the machine owns all sequencing
- completion is observable through `done` and `failed`
- the command keeps final CLI behavior in one place

If a refactor still leaves 200 lines of pipeline logic inside `.action(...)`, it is incomplete.

---

## 3. Context Pattern: Reassigned Pipeline Locals Become Runtime Types

`generate-runtime-types.ts` is the concrete example to mirror.

The context contains:

- machine creation inputs such as `filePath`, `projectRoot`, `commandOptions`, `findings`
- stage outputs such as `normalizedRecording`, `packageProfile`, `visualState`
- terminal data such as `error`

Representative shape:

```ts
export interface GenerateMachineContext {
  filePath: string;
  projectRoot: string;
  commandOptions: { screenshots?: boolean; auth?: string };
  findings: Finding[];

  normalizedRecording?: NormalizedRecording;
  bootstrappedState?: Awaited<ReturnType<typeof runLoadOrBootstrapStateWorkflow>>;
  packageProfile?: ResolvedTaroPackageProfile | null;
  visualAuth?: TaroPlaywrightAuthProfile | null;
  visualState?: VisualState | null;
  outputPath?: string;
  generatedCode?: string;
  scoreResult?: ScoreResult;
  error?: Error;
}
```

What to copy for a `state.ts`-style refactor:

- define one runtime context type up front
- promote every cross-stage variable into that type
- keep unknown values nullable or optional until assigned

What not to copy from the old imperative style:

- `let currentProfile`
- `let outputPath`
- `let refreshedState`
- silent reassignment across dozens of lines

---

## 4. Actor Pattern: One Async Stage, One Narrow Input Slice

The actors file shows the right granularity.

### Example: fold sync normalization into the async load stage

```ts
export const parseRecordingActor = fromPromise(
  async ({ input }: { input: ParseRecordingActorInput }) => {
    const parsedInput = await loadInput(input.filePath);
    const normalizedRecording = normalizeJsBaseline(parsedInput);
    const defaultOutputPath = deriveOutputPath(input.filePath);
    return { normalizedRecording, defaultOutputPath };
  }
);
```

This is the pattern to reuse:

- the meaningful boundary is the async file load
- the synchronous normalizer stays inside that actor
- the actor returns only the new context fields

### Example: typed, minimal actor input

```ts
export type ParseRecordingActorInput = Pick<GenerateMachineContext, "filePath">;
```

This is better than passing all of context because the dependency is explicit and testable.

### Example: a refresh stage that deserves its own actor

`refreshProfileActor` is separate because it performs distinct async work and materially changes later context:

- rescans state
- reloads overrides
- resolves a fresh package profile
- recomputes staleness

That is exactly the kind of boundary that should become its own named state in a future `state.ts` machine.

---

## 5. Machine Pattern: `assign` on `onDone`, Never Inside Actors

`generate.machine.ts` is the canonical shape.

Representative stage:

```ts
planning: {
  invoke: {
    src: "planGenerationActor",
    input: ({ context }) => ({
      markerAwareRecording: context.markerAwareRecording,
      analyzedRecording: context.analyzedRecording,
      mockAnalysis: context.mockAnalysis,
      normalizedRecording: context.normalizedRecording,
      packageProfile: context.packageProfile,
      projectRoot: context.projectRoot,
      defaultOutputPath: context.defaultOutputPath,
      contextMatches: context.contextMatches,
      visualState: context.visualState,
    }),
    onDone: {
      target: "resolvingSelectors",
      actions: assign(({ event }) => {
        const out = (event as any).output;
        return {
          jsSuitePlan: out?.jsSuitePlan,
          outputPath: out?.outputPath,
          resolvedRenderTargetFile: out?.resolvedRenderTargetFile,
        };
      }),
    },
    onError: {
      target: "failed",
      actions: assign({ error: ({ event }) => event.error as Error }),
    },
  },
}
```

That gives the right separation:

- actor does the work
- machine decides where to go next
- machine performs context mutation

Do not let actors reach back into machine context.

---

## 6. Error Pattern: Old `try/catch` Becomes `onError`

Most `gen` states follow the same error rule:

```ts
onError: {
  target: "failed",
  actions: assign({ error: ({ event }) => event.error as Error }),
}
```

This is the default mapping for a `state.ts` refactor.

One exception is allowed only when preserving current CLI behavior is intentional and documented. `gen` keeps one such exception in `assessingOutput`, where an assessment failure preserves the existing file instead of failing the whole command.

The lesson is not "special-case errors freely." The lesson is "document the exception when behavior compatibility requires it."

---

## 7. Branching Pattern: Keep Topology Flat Unless a Branch Is Meaningful

`gen` stays mostly linear:

```text
idle
→ validating
→ parsing
→ loadingState
→ capturingVisual
→ searchingContext
→ refiningProfile
→ refreshingProfile (only when stale)
→ analyzingRecording
→ analyzingMocks
→ planning
→ resolvingSelectors
→ generating
→ assessingOutput
→ writing
→ finalizing
→ runningHealthChecks
→ done
```

Why this is a good template:

- the machine tells you where the command is right now
- each named stage corresponds to real async work
- there is only one loop, and it exists for a concrete stale-profile refresh case

If a future `state.ts` machine starts adding nested statecharts without a real concurrency or reuse need, it is overdesigned.

---

## 8. Terminal Pattern: Final States Are Visible Even When the CLI Exits

`gen` resolves the machine to `done` or `failed`, then the command performs final CLI behavior:

- `done` -> `flushFindings(...)`
- `failed` -> stderr log and `process.exit(2)`

This is the pattern to keep:

- the machine models success and failure
- the command wrapper translates those states into CLI exit behavior

That keeps the machine testable even in environments that mock `process.exit`.

---

## 9. What a Future `state.ts` Refactor Should Copy Exactly

Copy these habits from `gen`:

- thin Commander action
- dedicated runtime types file
- one `fromPromise` actor per meaningful async stage
- `assign` only in `onDone` and `onError`
- flat, named states
- explicit final `done` and `failed`
- narrow actor input types built from `Pick<...>`

Do not copy these anti-patterns from imperative code:

- mutable cross-stage locals
- hidden stage transitions in `try/catch`
- `process.exit()` scattered throughout business logic
- helper rewrites that only exist to satisfy the machine

---

## 10. Quick Review Checklist for AI Workers

Before calling the refactor complete, confirm:

- every meaningful `await` from the original file maps to a named state or is intentionally folded into a neighboring actor
- every reassigned `let` became a context field
- every `try/catch` became an `onError` transition or a documented compatibility exception
- every actor takes a minimal typed input slice
- the command file is now bootstrap-only
- the runtime behavior still matches the old pipeline

If any answer is no, the refactor is not finished yet.
