import { SETUP_FILE_CONFIG_REGEX, STATE_VERSION, MAX_EXEMPLARS } from "#core/state.constants.ts";
import { get, uniq } from "#core/lodash.ts";
import type {
  LoadOrBootstrapStateMachineContext,
  ScanStateMachineContext,
  ScanStateOptions,
} from "#core/state-runtime-types.ts";
import {
  normalizeGeneratedTestHistoryPath,
  resolveConfiguredPath,
  toProjectRelativePath,
} from "#core/state-paths.ts";
import {
  inferFileExtension,
  inferFolderPattern,
  inferImportStyle,
  inferMockPattern,
  trimGeneratedTestHistory,
} from "#core/state-weighting.ts";
import type { ConventionsSchema } from "#types/conventions.ts";
import type { ScoreResult } from "#types/score.ts";
import type {
  TaroGeneratedTestRecord,
  TaroPackageProfile,
  TaroState,
} from "#types/state.ts";

export function normalizeConventionPaths(
  projectRoot: string,
  conventions: ConventionsSchema
): ConventionsSchema {
  return {
    ...conventions,
    projectRoot:
      conventions.projectRoot === projectRoot ? "." : conventions.projectRoot,
    testFiles: conventions.testFiles.map((file) => ({
      ...file,
      path: toProjectRelativePath(projectRoot, file.path),
    })),
  };
}

export function extractQuotedStringValues(value: string): string[] {
  return uniq(
    [...value.matchAll(/['"`]([^'"`]+)['"`]/g)]
      .map((match) => match[1]?.trim())
      .filter((match): match is string => Boolean(match))
  );
}

export function extractSetupFileEntriesFromConfig(content: string): string[] {
  return uniq(
    [...content.matchAll(SETUP_FILE_CONFIG_REGEX)].flatMap((match) =>
      extractQuotedStringValues(match[1] ?? "")
    )
  );
}

function toStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function extractSetupFileEntriesFromPackageJson(raw: unknown): string[] {
  return uniq([
    ...toStringList(get(raw, ["vitest", "setupFiles"])),
    ...toStringList(get(raw, ["vitest", "test", "setupFiles"])),
    ...toStringList(get(raw, ["jest", "setupFiles"])),
    ...toStringList(get(raw, ["jest", "setupFilesAfterEnv"])),
  ]);
}

export { normalizeGeneratedTestHistoryPath, resolveConfiguredPath };

export function emptyState(now: string, taroVersion: string): TaroState {
  return {
    version: STATE_VERSION,
    meta: { createdAt: now, updatedAt: now, taroVersion },
    packages: {},
    mockStore: { rootDir: null, importHint: null, resources: [] },
    generatedTests: [],
  };
}

export function deriveLegacyPackageProfile(
  projectRoot: string,
  conventions: ConventionsSchema
): TaroPackageProfile {
  const normalized = normalizeConventionPaths(projectRoot, conventions);
  return {
    packagePath: ".",
    packageName: null,
    scannedAt: normalized.scannedAt || new Date().toISOString(),
    testFileCount: conventions.testFiles.length,
    conventions: normalized,
    importStyle: inferImportStyle(normalized),
    runner: {
      value: "unknown",
      confidence: "low",
      evidence: ["Migrated from legacy conventions.json"],
    },
    jestDomSetup: {
      value: "per-test-import",
      confidence: "low",
      evidence: ["Migrated from legacy conventions.json"],
    },
    mockPattern: inferMockPattern(normalized),
    folderPattern: inferFolderPattern(normalized),
    fileExtension: inferFileExtension(normalized),
    renderHelpers: [],
    providerWrappers: [],
    renderTargets: [],
    repeatedMockTargets: [],
    sharedMockFactories: [],
    boundaryProfiles: [],
    boundaryExemplars: [],
    teaching: { dominantPatterns: [], examples: [] },
    interactionContracts: [],
    inlineSafeMockTargets: [],
    mutationLifecycles: [],
    instabilityWarnings: [],
    mockRecommendations: [],
    fixtureRoots: [],
    exemplars: normalized.testFiles
      .slice(0, MAX_EXEMPLARS)
      .map((file) => ({ file: file.path, tags: [] })),
    playwrightAuth: null,
    warnings: ["Migrated from legacy conventions.json"],
  };
}

export function migrateLegacyHistory(
  projectRoot: string,
  history: Array<{
    timestamp?: string;
    recordingFile?: string;
    score?: number;
    grade?: string;
    dimensions?: ScoreResult["dimensions"];
  }>
): TaroState["generatedTests"] {
  return trimGeneratedTestHistory(
    projectRoot,
    history
      .filter((entry) => typeof entry.recordingFile === "string")
      .map((entry): TaroGeneratedTestRecord => {
        const grade: TaroGeneratedTestRecord["quality"]["grade"] =
          entry.grade === "A" ||
          entry.grade === "B" ||
          entry.grade === "C" ||
          entry.grade === "D"
            ? entry.grade
            : "F";

        return {
          createdAt: entry.timestamp ?? new Date().toISOString(),
          packagePath: ".",
          recordingFile: entry.recordingFile!,
          testFile: entry.recordingFile!.replace(/\.[cm]?[jt]sx?$/, ".test.tsx"),
          quality: {
            overall: entry.score ?? 0,
            grade,
            dimensions: entry.dimensions ?? {
              queryQuality: 0,
              assertionSpecificity: 0,
              testStructure: 0,
              boundaryIsolation: 0,
            },
            signals: {
              queryCheckpointCount: 0,
              roleQueryCount: 0,
              testIdQueryCount: 0,
              strongAssertionCount: 0,
              presenceAssertionCount: 0,
              visibilityAssertionCount: 0,
              visibilityOnlyTestCount: 0,
              presenceOnlyTestCount: 0,
              boundaryWarningCount: 0,
              boundaryIssueCount: 0,
              placeholderRenderTarget: false,
              multipleTestBlocks: false,
              minimumExpectedTestCount: 0,
              branchCoverageRatio: 1,
              missingMockCount: 0,
              fireEventCount: 0,
              hasBasePropsConstant: false,
              hasOverrideRenderHelper: false,
              duplicatedInlineRenderCount: 0,
              hasStandaloneUtilityDescribe: false,
            },
            reasons: [],
          },
          requiresReview: true,
        };
      })
  );
}

export function createInitialScanStateMachineContext(
  projectRoot: string,
  options: ScanStateOptions = {}
): ScanStateMachineContext {
  return {
    projectRoot,
    options,
    detectedAt: null,
    loadedLegacy: null,
    overridesDiagnostics: null,
    now: null,
    generatedHistoryForLearning: null,
    testFiles: null,
    packageDescriptors: null,
    packages: null,
    result: null,
    error: null,
  };
}

export function createInitialLoadOrBootstrapStateMachineContext(
  projectRoot: string
): LoadOrBootstrapStateMachineContext {
  return {
    projectRoot,
    existingStateDiagnostics: null,
    overridesDiagnostics: null,
    shouldRefreshExistingState: false,
    existingResult: null,
    loadedLegacy: null,
    scanResult: null,
    result: null,
    error: null,
  };
}

export async function waitForMachineCompletion<TContext>(
  actor: { start(): void; subscribe(listener: (state: any) => void): unknown }
): Promise<{ context: TContext; value: string }> {
  return await new Promise<{ context: TContext; value: string }>(
    (resolvePromise) => {
      actor.subscribe((state: any) => {
        if (state.value === "done" || state.value === "failed") {
          resolvePromise({
            value: state.value as string,
            context: state.context as TContext,
          });
        }
      });

      actor.start();
    }
  );
}
