import { assign, setup } from "xstate";

import {
  LOAD_OR_BOOTSTRAP_STATE_MACHINE_ID,
  SCAN_STATE_MACHINE_ID,
} from "#core/state.constants.ts";
import type {
  BuildPackagesActorInput,
  FinalizeScanActorInput,
  LoadLegacyStateActorInput,
  LoadOrBootstrapStateMachineContext,
  PrepareScanActorInput,
  ReadBootstrapDiagnosticsActorInput,
  ReadRepoInventoryActorInput,
  RunScanActorInput,
  ScanStateMachineContext,
  WriteStateActorInput,
} from "#core/state-runtime-types.ts";

type CtxArg<TContext> = { context: TContext };

const stateMachineGuards = {
  hasExistingStateAndNeedsRefresh: ({
    context,
    event,
  }: {
    context: LoadOrBootstrapStateMachineContext;
    event: any;
  }) =>
    Boolean(
      event.output?.existingStateDiagnostics?.state &&
      (event.output?.shouldRefreshExistingState ??
        context.shouldRefreshExistingState)
    ),

  hasExistingState: ({
    context,
    event,
  }: {
    context: LoadOrBootstrapStateMachineContext;
    event: any;
  }) =>
    Boolean(
      event.output?.existingStateDiagnostics?.state ??
      context.existingStateDiagnostics?.state
    ),

  hasLegacyState: ({
    context,
    event,
  }: {
    context: LoadOrBootstrapStateMachineContext;
    event: any;
  }) =>
    Boolean(event.output?.loadedLegacy?.state ?? context.loadedLegacy?.state),
};

export type ScanStateMachineActors = {
  prepareScanActor: any;
  readRepoInventoryActor: any;
  buildPackagesActor: any;
  finalizeScanActor: any;
};

export type LoadOrBootstrapStateMachineActors = {
  readBootstrapDiagnosticsActor: any;
  loadLegacyStateActor: any;
  runScanActor: any;
  writeStateActor: any;
};

export function createScanStateMachine(actors: ScanStateMachineActors) {
  return setup({
    types: {
      context: {} as ScanStateMachineContext,
      input: {} as ScanStateMachineContext,
    },
    actors,
  }).createMachine({
    id: SCAN_STATE_MACHINE_ID,
    initial: "preparingScan",
    context: ({ input }) => input,
    states: {
      preparingScan: {
        invoke: {
          src: "prepareScanActor",
          input: ({ context }: CtxArg<ScanStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              options: context.options,
            }) satisfies PrepareScanActorInput,
          onDone: {
            target: "readingRepoInventory",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return {
                detectedAt: out?.detectedAt,
                loadedLegacy: out?.loadedLegacy,
                overridesDiagnostics: out?.overridesDiagnostics,
                now: out?.now,
                generatedHistoryForLearning: out?.generatedHistoryForLearning,
              };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      readingRepoInventory: {
        invoke: {
          src: "readRepoInventoryActor",
          input: ({ context }: CtxArg<ScanStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
            }) satisfies ReadRepoInventoryActorInput,
          onDone: {
            target: "buildingPackages",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return {
                testFiles: out?.testFiles,
                packageDescriptors: out?.packageDescriptors,
              };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      buildingPackages: {
        invoke: {
          src: "buildPackagesActor",
          input: ({ context }: CtxArg<ScanStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              detectedAt: context.detectedAt,
              loadedLegacy: context.loadedLegacy,
              generatedHistoryForLearning: context.generatedHistoryForLearning,
              testFiles: context.testFiles,
              packageDescriptors: context.packageDescriptors,
            }) satisfies BuildPackagesActorInput,
          onDone: {
            target: "finalizingScan",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return { packages: out?.packages };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      finalizingScan: {
        invoke: {
          src: "finalizeScanActor",
          input: ({ context }: CtxArg<ScanStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              options: context.options,
              loadedLegacy: context.loadedLegacy,
              overridesDiagnostics: context.overridesDiagnostics,
              now: context.now,
              generatedHistoryForLearning: context.generatedHistoryForLearning,
              packages: context.packages,
            }) satisfies FinalizeScanActorInput,
          onDone: {
            target: "done",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return { result: out?.result };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      done: { type: "final" },
      failed: { type: "final" },
    },
  });
}

export function createLoadOrBootstrapStateMachine(
  actors: LoadOrBootstrapStateMachineActors
) {
  return setup({
    types: {
      context: {} as LoadOrBootstrapStateMachineContext,
      input: {} as LoadOrBootstrapStateMachineContext,
    },
    actors,
    guards: stateMachineGuards,
  }).createMachine({
    id: LOAD_OR_BOOTSTRAP_STATE_MACHINE_ID,
    initial: "readingExistingDiagnostics",
    context: ({ input }) => input,
    states: {
      readingExistingDiagnostics: {
        invoke: {
          src: "readBootstrapDiagnosticsActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
            }) satisfies ReadBootstrapDiagnosticsActorInput,
          onDone: [
            {
              guard: "hasExistingStateAndNeedsRefresh",
              target: "rescanningExistingState",
              actions: assign(({ event }) => {
                const out = (event as any).output;
                return {
                  existingStateDiagnostics: out?.existingStateDiagnostics,
                  overridesDiagnostics: out?.overridesDiagnostics,
                  shouldRefreshExistingState: out?.shouldRefreshExistingState,
                  existingResult: out?.existingResult,
                };
              }),
            },
            {
              guard: "hasExistingState",
              target: "summarizingExistingState",
              actions: assign(({ event }) => {
                const out = (event as any).output;
                return {
                  existingStateDiagnostics: out?.existingStateDiagnostics,
                  overridesDiagnostics: out?.overridesDiagnostics,
                  shouldRefreshExistingState: out?.shouldRefreshExistingState,
                  existingResult: out?.existingResult,
                  result: out?.existingResult,
                };
              }),
            },
            {
              target: "loadingLegacyState",
              actions: assign(({ event }) => {
                const out = (event as any).output;
                return {
                  existingStateDiagnostics: out?.existingStateDiagnostics,
                  overridesDiagnostics: out?.overridesDiagnostics,
                  shouldRefreshExistingState: out?.shouldRefreshExistingState,
                  existingResult: out?.existingResult,
                };
              }),
            },
          ],
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      summarizingExistingState: { always: { target: "done" } },
      loadingLegacyState: {
        invoke: {
          src: "loadLegacyStateActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
            }) satisfies LoadLegacyStateActorInput,
          onDone: [
            {
              guard: "hasLegacyState",
              target: "rescanningLegacyState",
              actions: assign(({ event }) => {
                const out = (event as any).output;
                return { loadedLegacy: out?.loadedLegacy };
              }),
            },
            {
              target: "initializingFreshState",
              actions: assign(({ event }) => {
                const out = (event as any).output;
                return { loadedLegacy: out?.loadedLegacy };
              }),
            },
          ],
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      rescanningExistingState: {
        invoke: {
          src: "runScanActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              options: {
                existingState: context.existingStateDiagnostics?.state,
                detectedAt: "refresh",
              },
            }) satisfies RunScanActorInput,
          onDone: {
            target: "persistingScannedState",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return { scanResult: out?.result };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      rescanningLegacyState: {
        invoke: {
          src: "runScanActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              options: {
                existingState: context.loadedLegacy?.state,
                detectedAt: "refresh",
              },
            }) satisfies RunScanActorInput,
          onDone: {
            target: "persistingScannedState",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return { scanResult: out?.result };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      initializingFreshState: {
        invoke: {
          src: "runScanActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              options: { detectedAt: "init" },
            }) satisfies RunScanActorInput,
          onDone: {
            target: "persistingScannedState",
            actions: assign(({ event }) => {
              const out = (event as any).output;
              return { scanResult: out?.result };
            }),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      persistingScannedState: {
        invoke: {
          src: "writeStateActor",
          input: ({ context }: CtxArg<LoadOrBootstrapStateMachineContext>) =>
            ({
              projectRoot: context.projectRoot,
              state: context.scanResult!.state,
            }) satisfies WriteStateActorInput,
          onDone: {
            target: "done",
            actions: assign(({ context }) => ({ result: context.scanResult })),
          },
          onError: {
            target: "failed",
            actions: assign({ error: ({ event }) => event.error as Error }),
          },
        },
      },
      done: { type: "final" },
      failed: { type: "final" },
    },
  });
}
