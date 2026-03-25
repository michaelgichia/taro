import { fromPromise } from "xstate";

import type { TestFileContent } from "#core/convention-intelligence.ts";
import type {
  BuildPackagesActorInput,
  BuildPackagesActorOutput,
  FinalizeScanActorInput,
  FinalizeScanActorOutput,
  LoadedLegacyStateResult,
  LoadLegacyStateActorInput,
  PackageDescriptor,
  PrepareScanActorInput,
  PrepareScanActorOutput,
  ReadBootstrapDiagnosticsActorInput,
  ReadBootstrapDiagnosticsActorOutput,
  ReadOverridesDiagnostics,
  ReadRepoInventoryActorInput,
  ReadRepoInventoryActorOutput,
  ReadStateDiagnostics,
  RunScanActorInput,
  RunScanActorOutput,
  ScanStateOptions,
  ScanStateResult,
  WriteStateActorInput,
} from "#core/state-runtime-types.ts";
import type { TaroPackageProfile, TaroState } from "#types/state.ts";

export interface StateActorDependencies {
  buildExistingStateResult(
    projectRoot: string,
    existingState: TaroState,
    existingStateWarnings: string[],
    overridesDiagnostics: ReadOverridesDiagnostics
  ): ScanStateResult;
  buildGeneratedTestQualityIndex(
    projectRoot: string,
    generatedTests: TaroState["generatedTests"]
  ): Map<
    string,
    {
      createdAtMs: number;
      overall: number;
      requiresReview: boolean;
      weight: number;
    }
  >;
  buildPackageProfile(
    projectRoot: string,
    descriptor: PackageDescriptor,
    files: TestFileContent[],
    existingState: TaroState | null | undefined,
    qualityIndex: Map<
      string,
      {
        createdAtMs: number;
        overall: number;
        requiresReview: boolean;
        weight: number;
      }
    >,
    detectedAt: PrepareScanActorOutput["detectedAt"]
  ): Promise<TaroPackageProfile>;
  finalizeScanResult(
    projectRoot: string,
    params: {
      generatedHistoryForLearning: TaroState["generatedTests"];
      loadedLegacy: LoadedLegacyStateResult;
      now: string;
      preserveGeneratedTests: boolean;
      overridesDiagnostics: ReadOverridesDiagnostics;
      packages: Record<string, TaroPackageProfile>;
    }
  ): Promise<ScanStateResult>;
  findNearestPackageDescriptor(
    descriptors: PackageDescriptor[],
    filePath: string
  ): PackageDescriptor;
  loadLegacyState(projectRoot: string): Promise<LoadedLegacyStateResult>;
  readRepoInventory(projectRoot: string): Promise<{
    packageDescriptors: PackageDescriptor[];
    testFiles: TestFileContent[];
  }>;
  readTaroOverridesWithDiagnostics(
    projectRoot: string
  ): Promise<ReadOverridesDiagnostics>;
  readTaroStateWithDiagnostics(
    projectRoot: string
  ): Promise<ReadStateDiagnostics>;
  runScanStateWorkflow(
    projectRoot: string,
    options: ScanStateOptions
  ): Promise<ScanStateResult>;
  shouldRefreshStateFromGeneratedHistory(state: TaroState): boolean;
  writeTaroState(projectRoot: string, state: TaroState): Promise<void>;
}

export function createStateActors(deps: StateActorDependencies) {
  const prepareScanActor = fromPromise(
    async ({
      input,
    }: {
      input: PrepareScanActorInput;
    }): Promise<PrepareScanActorOutput> => {
      const detectedAt = input.options.detectedAt ?? "refresh";
      const loadedLegacy = input.options.existingState
        ? {
            state: input.options.existingState,
            migratedLegacyState: false,
            warnings: [],
          }
        : await deps.loadLegacyState(input.projectRoot);
      const overridesDiagnostics = await deps.readTaroOverridesWithDiagnostics(
        input.projectRoot
      );
      const now = new Date().toISOString();
      const generatedHistoryForLearning =
        input.options.preserveGeneratedTests === false
          ? []
          : (loadedLegacy.state?.generatedTests ?? []);

      return {
        detectedAt,
        loadedLegacy,
        overridesDiagnostics,
        now,
        generatedHistoryForLearning,
      };
    }
  );

  const readRepoInventoryActor = fromPromise(
    async ({
      input,
    }: {
      input: ReadRepoInventoryActorInput;
    }): Promise<ReadRepoInventoryActorOutput> => {
      return deps.readRepoInventory(input.projectRoot);
    }
  );

  const buildPackagesActor = fromPromise(
    async ({
      input,
    }: {
      input: BuildPackagesActorInput;
    }): Promise<BuildPackagesActorOutput> => {
      const qualityIndex = deps.buildGeneratedTestQualityIndex(
        input.projectRoot,
        input.generatedHistoryForLearning ?? []
      );
      const packagesByKey = new Map<string, TestFileContent[]>();

      for (const file of input.testFiles ?? []) {
        const descriptor = deps.findNearestPackageDescriptor(
          input.packageDescriptors ?? [],
          file.path
        );
        const files = packagesByKey.get(descriptor.key) ?? [];
        files.push(file);
        packagesByKey.set(descriptor.key, files);
      }

      const packageProfiles = await Promise.all(
        [...packagesByKey.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(async ([packageKey, files]) => {
            const descriptor = (input.packageDescriptors ?? []).find(
              (candidate) => candidate.key === packageKey
            )!;
            return deps.buildPackageProfile(
              input.projectRoot,
              descriptor,
              files,
              input.loadedLegacy?.state,
              qualityIndex,
              input.detectedAt ?? "refresh"
            );
          })
      );

      const packages =
        packageProfiles.length > 0
          ? Object.fromEntries(
              packageProfiles.map((profile) => [profile.packagePath, profile])
            )
          : (input.loadedLegacy?.state?.packages ?? {});

      return { packages };
    }
  );

  const finalizeScanActor = fromPromise(
    async ({
      input,
    }: {
      input: FinalizeScanActorInput;
    }): Promise<FinalizeScanActorOutput> => {
      const result = await deps.finalizeScanResult(input.projectRoot, {
        generatedHistoryForLearning: input.generatedHistoryForLearning ?? [],
        loadedLegacy: input.loadedLegacy!,
        now: input.now!,
        preserveGeneratedTests: input.options.preserveGeneratedTests !== false,
        overridesDiagnostics: input.overridesDiagnostics!,
        packages: input.packages ?? {},
      });
      return { result };
    }
  );

  const readBootstrapDiagnosticsActor = fromPromise(
    async ({
      input,
    }: {
      input: ReadBootstrapDiagnosticsActorInput;
    }): Promise<ReadBootstrapDiagnosticsActorOutput> => {
      const existingStateDiagnostics = await deps.readTaroStateWithDiagnostics(
        input.projectRoot
      );
      const overridesDiagnostics = await deps.readTaroOverridesWithDiagnostics(
        input.projectRoot
      );
      const existingState = existingStateDiagnostics.state;

      return {
        existingStateDiagnostics,
        overridesDiagnostics,
        shouldRefreshExistingState: existingState
          ? deps.shouldRefreshStateFromGeneratedHistory(existingState)
          : false,
        existingResult: existingState
          ? deps.buildExistingStateResult(
              input.projectRoot,
              existingState,
              existingStateDiagnostics.warnings,
              overridesDiagnostics
            )
          : null,
      };
    }
  );

  const loadLegacyStateActor = fromPromise(
    async ({
      input,
    }: {
      input: LoadLegacyStateActorInput;
    }) => {
      return { loadedLegacy: await deps.loadLegacyState(input.projectRoot) };
    }
  );

  const runScanActor = fromPromise(
    async ({
      input,
    }: {
      input: RunScanActorInput;
    }): Promise<RunScanActorOutput> => {
      const result = await deps.runScanStateWorkflow(
        input.projectRoot,
        input.options
      );
      return { result };
    }
  );

  const writeStateActor = fromPromise(
    async ({ input }: { input: WriteStateActorInput }) => {
      await deps.writeTaroState(input.projectRoot, input.state);
    }
  );

  return {
    buildPackagesActor,
    finalizeScanActor,
    loadLegacyStateActor,
    prepareScanActor,
    readBootstrapDiagnosticsActor,
    readRepoInventoryActor,
    runScanActor,
    writeStateActor,
  };
}
