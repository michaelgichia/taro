import type { TestFileContent } from "#core/scanner.ts";
import { readConventions, readTestFiles } from "#core/scanner.ts";
import {
  analyzeMutationLifecycleInFiles,
  deriveInteractionContracts,
  deriveMockRecommendations,
  detectMockInstabilityInFiles,
  scanMockTargetsInFiles,
} from "#core/state-mock-analysis.ts";
import type {
  ConventionsSchema,
  InteractionContractKind,
  MockInstabilityWarning,
  MockRecommendation,
  MockTargetUsage,
  MutationLifecyclePattern,
} from "#types/conventions.ts";
import type {
  TaroBoundaryProfile,
  ResolvedTaroPackageProfile,
  TaroInteractionContractProfile,
  TaroQueryHookPolicy,
  TaroSharedMockFactoryProfile,
} from "#types/state.ts";

export interface MockAnalysis {
  conventions: ConventionsSchema | null;
  packagePath: string | null;
  source: "repo-scan" | "package-profile";
  recommendations: MockRecommendation[];
  repeatedTargets: MockTargetUsage[];
  mutationLifecycles: MutationLifecyclePattern[];
  interactionContracts: TaroInteractionContractProfile[];
  instabilityWarnings: MockInstabilityWarning[];
  sharedMockFactories: TaroSharedMockFactoryProfile[];
  boundaryProfiles: TaroBoundaryProfile[];
  inlineSafeMockTargets: string[];
  preferredSharedMocks: Record<string, string>;
  forbidMocks: string[];
  preferredBoundaryImplementations: Record<string, string>;
  forbidBoundaryTargets: string[];
  queryHookPolicy: TaroQueryHookPolicy;
  companionPolicy: ResolvedTaroPackageProfile["effectiveCompanionPolicy"];
  enabledContractFamilies: InteractionContractKind[];
}
export { deriveMockRecommendations };

export async function scanMockTargets(
  projectRoot: string
): Promise<MockTargetUsage[]> {
  const testFiles = await readTestFiles(projectRoot);
  return scanMockTargetsInFiles(projectRoot, testFiles);
}

export async function analyzeMutationLifecycle(
  projectRoot: string
): Promise<MutationLifecyclePattern[]> {
  const testFiles = await readTestFiles(projectRoot);
  return analyzeMutationLifecycleInFiles(projectRoot, testFiles);
}

export async function detectMockInstability(
  projectRoot: string
): Promise<MockInstabilityWarning[]> {
  const testFiles = await readTestFiles(projectRoot);
  return detectMockInstabilityInFiles(projectRoot, testFiles);
}

export async function analyzeMocks(
  projectRoot: string,
  options: { packageProfile?: ResolvedTaroPackageProfile | null } = {}
): Promise<MockAnalysis> {
  const packageProfile = options.packageProfile ?? null;
  if (packageProfile) {
    const forbiddenTargets = new Set(packageProfile.forbidMocks);
    const repeatedTargets = packageProfile.repeatedMockTargets.filter(
      (target) => !forbiddenTargets.has(target.target)
    );
    const packageRecommendations = packageProfile.mockRecommendations.filter(
      (recommendation) => !forbiddenTargets.has(recommendation.target)
    );
    const preferredRecommendations = Object.entries(
      packageProfile.preferredSharedMocks
    ).map(([target, importPath]) => {
      const repeatedTarget = repeatedTargets.find(
        (entry) => entry.target === target
      );
      return {
        target,
        kind: "extract" as const,
        reason: `Shared mock preference pinned to ${importPath}`,
        files: repeatedTarget?.files ?? [],
        count: repeatedTarget?.count ?? 1,
      };
    });

    return {
      conventions: packageProfile.conventions,
      packagePath: packageProfile.packagePath,
      source: "package-profile",
      recommendations: [
        ...preferredRecommendations,
        ...packageRecommendations.filter(
          (recommendation) =>
            !preferredRecommendations.some(
              (preferred) => preferred.target === recommendation.target
            )
        ),
      ],
      repeatedTargets,
      mutationLifecycles: packageProfile.mutationLifecycles,
      interactionContracts: packageProfile.interactionContracts,
      instabilityWarnings: packageProfile.instabilityWarnings,
      sharedMockFactories: packageProfile.sharedMockFactories,
      boundaryProfiles: packageProfile.boundaryProfiles,
      inlineSafeMockTargets: packageProfile.inlineSafeMockTargets,
      preferredSharedMocks: packageProfile.preferredSharedMocks,
      forbidMocks: packageProfile.forbidMocks,
      preferredBoundaryImplementations:
        packageProfile.preferredBoundaryImplementations,
      forbidBoundaryTargets: packageProfile.forbidBoundaryTargets,
      queryHookPolicy: packageProfile.effectiveQueryHookPolicy,
      companionPolicy: packageProfile.effectiveCompanionPolicy,
      enabledContractFamilies: packageProfile.enabledContractFamilies,
    };
  }

  const testFiles = await readTestFiles(projectRoot);
  const [conventions] = await Promise.all([readConventions(projectRoot)]);
  const targets = scanMockTargetsInFiles(projectRoot, testFiles);
  const mutationLifecycles = analyzeMutationLifecycleInFiles(
    projectRoot,
    testFiles
  );
  const interactionContracts = deriveInteractionContracts({
    mutationLifecycles,
    boundaryExemplars: [],
  });
  const instabilityWarnings = detectMockInstabilityInFiles(
    projectRoot,
    testFiles
  );

  return {
    conventions,
    packagePath: null,
    source: "repo-scan",
    recommendations: deriveMockRecommendations(targets),
    repeatedTargets: targets.filter((target) => target.count > 1),
    mutationLifecycles,
    interactionContracts,
    instabilityWarnings,
    sharedMockFactories: [],
    boundaryProfiles: [],
    inlineSafeMockTargets: [],
    preferredSharedMocks: {},
    forbidMocks: [],
    preferredBoundaryImplementations: {},
    forbidBoundaryTargets: [],
    queryHookPolicy: "avoid",
    companionPolicy: "heuristic",
    enabledContractFamilies: ["mutation-form"],
  };
}
