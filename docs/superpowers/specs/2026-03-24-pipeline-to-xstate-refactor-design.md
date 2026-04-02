# Design: Refactor Monolithic Async Pipelines into XState v5 with Examples, Not Clever Abstractions

**Date:** 2026-03-24 **Status:** Approved **Goal:** Preserve the exact conversion contract used for a `state.ts`-style monolithic async pipeline so future AI workers can reproduce the refactor from repo-local Markdown examples instead of pushing orchestration heuristics into runtime code.

---

## Policy

When a long async pipeline needs to become an XState v5 machine in this repo:

- keep repo intelligence in Markdown examples and worked references
- keep runtime code explicit and boring
- keep pure helpers unchanged
- move orchestration only

The reference implementation is the current `generate` command split:

- `src/cli/commands/generate.ts`
- `src/cli/commands/generate.machine.ts`
- `src/cli/commands/generate.actors.ts`
- `src/cli/commands/generate-runtime-types.ts`

Do not add generic "pipeline framework" helpers just to avoid repeating a few `fromPromise` actors or `assign` blocks. The repetition is part of the clarity.

---

## Read the Whole Pipeline First

Before writing any machine state:

1. Find the entry point.
2. Read the full async flow in order.
3. Mark every meaningful `await`.
4. Mark every `try/catch`.
5. Mark every early terminal exit such as `flushFindings()` or `process.exit(...)`.
6. Mark every `let` that is reassigned and later read.

That inventory is the machine. Do not start from "what states feel nice." Start from the real control flow.

---

## Source-to-Machine Mapping

| Source shape | Machine shape |
| --- | --- |
| Commander `.action()` body | thin bootstrap around `createActor(...)` |
| meaningful `await` | named state with one `fromPromise` actor |
| synchronous helper beside async work | fold into the nearest actor |
| reassigned `let` | context field |
| `try/catch` around async stage | `onError -> failed` unless preserving existing output is intentional |
| `flushFindings()` / `process.exit()` | terminal `done` / `failed` state behavior |
| branch on stage result | `onDone` targets or a small branch inside the actor |

If a stage has no meaningful failure mode, no observable output, and no downstream data, it probably does not deserve a state.

---

## Stage Boundary Rules

A new state is warranted only when at least one of these is true:

- there is a meaningful `await` that can fail independently
- the operation produces data needed by later stages
- naming the stage improves observability or debugging

Do not create states for tiny synchronous transforms such as normalizers, mappers, or string formatting. Fold them into the neighboring async actor.

Good:

- `loadInput` + synchronous normalization in one parsing actor
- `refresh state` as its own actor because it performs I/O and changes later context

Bad:

- a `normalizeRecording` state that just wraps a pure function
- a `deriveOutputPath` state that only computes a string

---

## Context Rules

Every pipeline variable that is assigned in one stage and read later becomes a context field.

Rules:

- inputs supplied at machine creation are required fields
- values produced later are nullable or optional until populated
- initialize unset fields explicitly when that prevents non-null assertions in actor input types
- group fields by producer stage so the data flow stays legible

Pattern:

```ts
interface StateMachineContext {
  filePath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
  findings: Finding[];

  parsedInput: Awaited<ReturnType<typeof loadInput>> | null;
  normalizedRecording: NormalizedRecording | null;
  bootstrappedState: Awaited<
    ReturnType<typeof runLoadOrBootstrapStateWorkflow>
  > | null;
  packageProfile: ResolvedTaroPackageProfile | null;
  error: Error | null;
}
```

The machine owns mutation through `assign`. Actors do not mutate context.

---

## Actor Input Rules

Each actor receives only the fields it needs. Do not pass full machine context into every actor.

Pattern:

```ts
type LoadInputActorInput = Pick<StateMachineContext, "filePath">;

const loadInputActor = fromPromise(
  async ({ input }: { input: LoadInputActorInput }) => loadInput(input.filePath)
);
```

Why this matters:

- dependencies become explicit
- actors are independently testable
- future refactors cannot silently depend on unrelated context

If an actor needs five fields, pass those five fields. If it needs one, pass one.

---

## Error Mapping Rules

Every pipeline `try/catch` that currently ends the command should become `onError`.

Standard pattern:

```ts
onError: {
  target: "failed",
  actions: assign({ error: ({ event }) => event.error as Error }),
}
```

The `failed` state owns terminal behavior such as:

- stderr logging
- findings flushing if applicable
- `process.exit(2)` if the command truly must terminate

Do not spread terminal exit behavior across multiple actors unless the command already depends on process termination inside a library helper and that behavior is being preserved deliberately.

---

## Terminal State Rules

Collapse terminal behavior to a small number of final states.

Default:

- `done`
- `failed`

If the old pipeline calls `flushFindings()` in several places, those paths still conceptually map to `done`. If the current implementation must preserve an early in-actor exit for CLI compatibility, document that exception explicitly.

The machine should still make success and failure visible even when the CLI wrapper performs the final `flushFindings()` or `process.exit(...)`.

---

## Merge Rules

Merge work into one actor when:

- one step is synchronous and belongs to the async step beside it
- two async calls naturally form one stage and do not need separate observability
- a short conditional refresh path is easier to keep inside the actor than as a separate state

Split work into separate states when:

- the two awaits can fail for different reasons worth naming
- one result is reused later independent of the other
- logs, tests, or debugging benefit from a distinct stage name

---

## Keep Helpers Unchanged

The machine is a control-flow shell, not a helper rewrite.

Leave pure and quasi-pure helpers as they are when they already:

- take inputs directly
- return outputs directly
- do not depend on pipeline mutation

Examples of the right boundary:

- formatters stay as formatters
- reconciliations stay as reconciliations
- summarizers stay as summarizers
- only the sequencing around them moves into actors and state transitions

---

## Commander Wiring Rule

The command entrypoint should become thin:

```ts
.action(async (file: string) => {
  const actor = createActor(stateMachine, {
    input: initialContext,
  });

  const finalState = await new Promise<Snapshot>((resolvePromise) => {
    actor.subscribe((snapshot) => {
      if (snapshot.value === "done" || snapshot.value === "failed") {
        resolvePromise(snapshot);
      }
    });

    actor.start();
  });

  if (finalState.value === "done") {
    flushFindings(finalState.context.findings);
    return;
  }

  process.exit(2);
});
```

The bootstrap owns:

- gathering command options
- constructing initial context
- starting the actor
- waiting for `done` or `failed`
- performing final CLI exit behavior

It does not own pipeline logic anymore.

---

## What Not to Do

- Do not build a generic "stage runner" abstraction.
- Do not hide repo-specific reasoning in helper utilities.
- Do not pass the whole context object into every actor.
- Do not mutate context inside actors.
- Do not convert pure helpers into actors just because they are nearby.
- Do not add guards when a branch is simpler inside one actor.
- Do not leave `process.exit()` scattered through the pipeline unless preserving a hard CLI stop is intentional and documented.

---

## Quality Bar

A refactor is correct when all of these are true:

- every meaningful await in the old pipeline has an obvious home
- every mutable pipeline variable has an explicit context field
- every failure path ends in a visible machine transition
- helper behavior is unchanged
- the command file becomes bootstrap-only
- a new reader can identify the current phase from the machine state alone

Use the `generate` command split as the repo-local gold standard for shape and naming.
