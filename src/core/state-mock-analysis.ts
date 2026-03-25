import {
  MAX_EVIDENCE,
  MOCK_CONFIGURATION_REGEX,
  MOCK_RESET_REGEX,
  MOCK_TARGET_REGEX,
  MUTATION_TRIGGER_REGEX,
  STAGE_PATTERNS,
  TEST_BLOCK_REGEX,
  TEST_SCOPED_MOCK_REGEX,
} from "#core/state.constants.ts";
import { orderBy } from "#core/lodash.ts";
import { toPosixPath, toProjectRelativeFilePath } from "#core/state-paths.ts";
import { getRelativeFileQualityWeight } from "#core/state-weighting.ts";
import type { GeneratedTestQualityIndex } from "#core/state.types.ts";
import type {
  MockInstabilityWarning,
  MockRecommendation,
  MockRecommendationKind,
  MockTargetUsage,
  MutationLifecyclePattern,
  MutationLifecycleStage,
} from "#types/conventions.ts";
import type {
  TaroBoundaryExemplarProfile,
  TaroInteractionContractProfile,
  TaroStateConfidence,
} from "#types/state.ts";

export interface StateFileContentLike {
  content: string;
  path: string;
}

export function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

export function extractMockTargets(content: string): string[] {
  return [...content.matchAll(MOCK_TARGET_REGEX)].map((match) => match[1]!);
}

export function findStages(content: string): MutationLifecycleStage[] {
  return (Object.entries(STAGE_PATTERNS) as [MutationLifecycleStage, RegExp[]][])
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
    .map(([stage]) => stage);
}

export function deriveMockRecommendations(
  targets: MockTargetUsage[]
): MockRecommendation[] {
  return targets.map((target) => {
    const kind: MockRecommendationKind =
      target.count >= 2 ? "extract" : "inline";
    return {
      count: target.count,
      files: target.files,
      kind,
      reason:
        kind === "extract"
          ? "Mock target appears in multiple tests and should be shared"
          : "Mock target appears in one place and can stay local to the test",
      target: target.target,
    };
  });
}

export function scanMockTargetsInFiles(
  projectRoot: string,
  testFiles: StateFileContentLike[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): MockTargetUsage[] {
  const targets = new Map<
    string,
    { files: Set<string>; weightedSupport: number }
  >();

  for (const file of testFiles) {
    const sourceTestFile = toProjectRelativeFilePath(projectRoot, file.path);
    const fileWeight = getRelativeFileQualityWeight(
      qualityIndex,
      sourceTestFile
    );

    for (const target of new Set(extractMockTargets(file.content))) {
      const existing = targets.get(target) ?? {
        files: new Set<string>(),
        weightedSupport: 0,
      };
      existing.files.add(sourceTestFile);
      existing.weightedSupport += fileWeight;
      targets.set(target, existing);
    }
  }

  return orderBy(
    [...targets.entries()].map(([target, entry]) => ({
      target,
      files: [...entry.files].sort(),
      count: entry.files.size,
      weightedSupport: entry.weightedSupport,
    })),
    [
      (entry) => entry.weightedSupport,
      (entry) => entry.count,
      (entry) => entry.target,
    ],
    ["desc", "desc", "asc"]
  ).map(({ target, files, count }) => ({
    target,
    files,
    count,
  }));
}

export function analyzeMutationLifecycleInFiles(
  projectRoot: string,
  testFiles: StateFileContentLike[]
): MutationLifecyclePattern[] {
  return orderBy(
    testFiles
      .filter((file) => MUTATION_TRIGGER_REGEX.test(file.content))
      .map((file) => {
        const stages = findStages(file.content);
        if (stages.length < 2) {
          return null;
        }

        return {
          file: toProjectRelativeFilePath(projectRoot, file.path),
          stages,
          evidence: stages.map((stage) => `${stage} cues detected`),
        };
      })
      .filter((entry): entry is MutationLifecyclePattern => entry !== null),
    [(entry) => entry.file],
    ["asc"]
  );
}

export function deriveInteractionContracts(params: {
  mutationLifecycles: MutationLifecyclePattern[];
  boundaryExemplars: TaroBoundaryExemplarProfile[];
}): TaroInteractionContractProfile[] {
  const { mutationLifecycles, boundaryExemplars } = params;
  const exemplarsByFile = new Map(
    boundaryExemplars.map((exemplar) => [toPosixPath(exemplar.file), exemplar])
  );

  return orderBy(
    mutationLifecycles
      .map((lifecycle) => {
        const states = [
          lifecycle.stages.includes("loading") ? "in-flight" : null,
          lifecycle.stages.includes("error") ? "failed-completion" : null,
        ].filter(
          (
            state
          ): state is TaroInteractionContractProfile["states"][number] =>
            state !== null
        );

        if (states.length === 0) {
          return null;
        }

        const exemplar = exemplarsByFile.get(lifecycle.file);
        const supportTargets = exemplar?.boundaryTargets ?? [];
        const overrideStyle = exemplar?.overrideStyle ?? "none";
        const confidence: TaroStateConfidence =
          overrideStyle === "stable-handles" && supportTargets.length > 0
            ? "high"
            : overrideStyle === "inline-reconfigure" || supportTargets.length > 0
              ? "medium"
              : "low";

        return {
          file: lifecycle.file,
          kind: "mutation-form" as const,
          states,
          supportTargets,
          overrideStyle,
          confidence,
          evidence: [
            ...lifecycle.evidence,
            exemplar
              ? `boundary override style: ${overrideStyle}`
              : "no matching boundary exemplar",
          ],
        };
      })
      .filter((entry): entry is TaroInteractionContractProfile => entry !== null),
    [(entry) => entry.file],
    ["asc"]
  );
}

export function detectMockInstabilityInFiles(
  projectRoot: string,
  testFiles: StateFileContentLike[]
): MockInstabilityWarning[] {
  const warnings: MockInstabilityWarning[] = [];

  for (const file of testFiles) {
    const relativePath = toProjectRelativeFilePath(projectRoot, file.path);
    const testBodies = file.content.split(TEST_BLOCK_REGEX).slice(1);
    const scopedMockCount = testBodies.filter((body) =>
      TEST_SCOPED_MOCK_REGEX.test(body)
    ).length;

    if (scopedMockCount > 0) {
      warnings.push({
        file: relativePath,
        kind: "recreated-factory",
        reason:
          "Mocks are declared inside test bodies and may recreate factories per test run",
        evidence: [
          `${scopedMockCount} test block(s) declare vi.mock/jest.mock`,
        ],
      });
    }

    const resetCount = countMatches(file.content, MOCK_RESET_REGEX);
    const configCount = countMatches(file.content, MOCK_CONFIGURATION_REGEX);

    if (resetCount > 0 && configCount >= 2) {
      warnings.push({
        file: relativePath,
        kind: "per-test-churn",
        reason:
          "Mock configuration is reset and redefined repeatedly across tests",
        evidence: [
          `${resetCount} resetAll/clearAll/restoreAll call(s)`,
          `${configCount} mock configuration call(s)`,
        ],
      });
    }
  }

  return orderBy(
    warnings,
    [(warning) => warning.file, (warning) => warning.kind],
    ["asc", "asc"]
  );
}

export function limitEvidence<T>(entries: T[]): T[] {
  return entries.slice(0, MAX_EVIDENCE);
}
