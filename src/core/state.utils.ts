import { relative, resolve } from "node:path";

import { summarizeBoundaryProfiles } from "#core/boundary-learning.ts";
import {
  GENERATED_TEST_HISTORY_LIMIT_PER_TEST,
  MAX_EVIDENCE,
  MAX_EXEMPLARS,
  MIXED_CONVENTION_THRESHOLD,
  MOCK_CONFIGURATION_REGEX,
  MOCK_RESET_REGEX,
  MOCK_TARGET_REGEX,
  MUTATION_TRIGGER_REGEX,
  SCORE_REVIEW_CAP,
  SCORE_WEIGHT_BASE,
  SCORE_WEIGHT_MAX,
  SCORE_WEIGHT_MIN,
  SETUP_FILE_CONFIG_REGEX,
  STAGE_PATTERNS,
  STATE_VERSION,
  TEST_BLOCK_REGEX,
  TEST_SCOPED_MOCK_REGEX,
} from "#core/state.constants.ts";
import type {
  AtomicFileExtension,
  AtomicFolderPattern,
  GeneratedTestQualityEntry,
  GeneratedTestQualityIndex,
  PackageScoreLearningSummary,
  WeightedValueBucket,
} from "#core/state.types.ts";
import type {
  LoadOrBootstrapStateMachineContext,
  PackageDescriptor,
  ReadOverridesDiagnostics,
  ScanStateMachineContext,
  ScanStateOptions,
  ScanStateResult,
} from "#core/state-runtime-types.ts";
import type {
  ConventionFile,
  ConventionsSchema,
  ImportStyle,
  MockInstabilityWarning,
  MockPattern,
  MockRecommendation,
  MockRecommendationKind,
  MockTargetUsage,
  MutationLifecyclePattern,
  MutationLifecycleStage,
} from "#types/conventions.ts";
import type { ScoreResult } from "#types/score.ts";
import type {
  TaroBoundaryExemplarProfile,
  TaroBoundaryKind,
  TaroExemplarProfile,
  TaroFileExtension,
  TaroFixtureRootKind,
  TaroFixtureRootProfile,
  TaroFolderPattern,
  TaroGeneratedTestRecord,
  TaroInteractionContractProfile,
  TaroPackageProfile,
  TaroPlaywrightAuthDetectedAt,
  TaroPlaywrightAuthProfile,
  TaroProviderWrapperProfile,
  TaroRenderHelperProfile,
  TaroSharedMockFactoryProfile,
  TaroSignal,
  TaroState,
  TaroStateConfidence,
  TaroStateSummary,
  TaroStateSummaryPackage,
} from "#types/state.ts";

export function toConfidence(value: number): TaroStateConfidence {
  if (value >= 0.8) {
    return "high";
  }
  if (value >= 0.45) {
    return "medium";
  }
  return "low";
}

export function normalizePackageKey(
  projectRoot: string,
  packageRoot: string
): string {
  const relativePath = relative(projectRoot, packageRoot).replace(/\\/g, "/");
  return relativePath.length === 0 ? "." : relativePath;
}

export function toStateRelativePath(
  projectRoot: string,
  filePath: string
): string {
  const normalized = relative(projectRoot, filePath).replace(/\\/g, "/");
  return normalized.length === 0 ? "." : normalized;
}

export function createPlaywrightAuthProfile(
  projectRoot: string,
  filePath: string,
  options: {
    detectedAt: TaroPlaywrightAuthDetectedAt;
    source: TaroPlaywrightAuthProfile["source"];
    strategy?: TaroPlaywrightAuthProfile["strategy"];
  }
): TaroPlaywrightAuthProfile {
  return {
    strategy: options.strategy ?? "storageState",
    path: toStateRelativePath(projectRoot, filePath),
    detectedAt: options.detectedAt,
    source: options.source,
  };
}

export function clampNumber(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRepoRelativePath(
  projectRoot: string,
  filePath: string
): string | null {
  const relativePath = relative(
    resolve(projectRoot),
    resolve(filePath)
  ).replace(/\\/g, "/");

  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    return null;
  }

  return relativePath;
}

export function calculateGeneratedTestQualityWeight(
  record: Pick<TaroGeneratedTestRecord, "quality" | "requiresReview">
): number {
  const baseWeight = clampNumber(
    SCORE_WEIGHT_MIN,
    SCORE_WEIGHT_MAX,
    SCORE_WEIGHT_BASE + record.quality.overall / 100
  );

  return record.requiresReview
    ? Math.min(baseWeight, SCORE_REVIEW_CAP)
    : baseWeight;
}

export function buildGeneratedTestQualityIndex(
  projectRoot: string,
  generatedTests: TaroGeneratedTestRecord[]
): GeneratedTestQualityIndex {
  const qualityIndex: GeneratedTestQualityIndex = new Map();

  for (const record of generatedTests) {
    const normalizedPath = normalizeRepoRelativePath(
      projectRoot,
      record.testFile
    );
    if (!normalizedPath) {
      continue;
    }

    const createdAtMs = Date.parse(record.createdAt);
    const nextEntry: GeneratedTestQualityEntry = {
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      overall: record.quality.overall,
      weight: calculateGeneratedTestQualityWeight(record),
      requiresReview: record.requiresReview,
    };
    const existing = qualityIndex.get(normalizedPath);

    if (
      !existing ||
      nextEntry.createdAtMs >= existing.createdAtMs ||
      (nextEntry.createdAtMs === existing.createdAtMs &&
        nextEntry.overall >= existing.overall)
    ) {
      qualityIndex.set(normalizedPath, nextEntry);
    }
  }

  return qualityIndex;
}

export function normalizeGeneratedTestHistoryPath(
  projectRoot: string,
  testFile: string
): string {
  return (
    normalizeRepoRelativePath(projectRoot, testFile) ??
    resolve(projectRoot, testFile)
      .replace(/\\/g, "/")
      .replace(/^\/private(?=\/var\/)/u, "")
  );
}

export function trimGeneratedTestHistory(
  projectRoot: string,
  generatedTests: TaroGeneratedTestRecord[]
): TaroGeneratedTestRecord[] {
  const ordered = generatedTests
    .map((record, index) => {
      const createdAtMs = Date.parse(record.createdAt);
      return {
        record,
        index,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      };
    })
    .sort(
      (left, right) =>
        left.createdAtMs - right.createdAtMs || left.index - right.index
    );
  const counts = new Map<string, number>();
  const kept: typeof ordered = [];

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const entry = ordered[index]!;
    const historyKey = normalizeGeneratedTestHistoryPath(
      projectRoot,
      entry.record.testFile
    );
    const nextCount = (counts.get(historyKey) ?? 0) + 1;

    if (nextCount > GENERATED_TEST_HISTORY_LIMIT_PER_TEST) {
      continue;
    }

    counts.set(historyKey, nextCount);
    kept.push(entry);
  }

  return kept
    .sort(
      (left, right) =>
        left.createdAtMs - right.createdAtMs || left.index - right.index
    )
    .map((entry) => entry.record);
}

export function getRelativeFileQualityWeight(
  qualityIndex: GeneratedTestQualityIndex,
  relativePath: string
): number {
  return qualityIndex.get(relativePath)?.weight ?? 1;
}

export function getFileQualityWeight(
  projectRoot: string,
  qualityIndex: GeneratedTestQualityIndex,
  filePath: string
): number {
  const normalizedPath = normalizeRepoRelativePath(projectRoot, filePath);
  return normalizedPath
    ? getRelativeFileQualityWeight(qualityIndex, normalizedPath)
    : 1;
}

export function sortPathsByQualityWeight(
  paths: Iterable<string>,
  qualityIndex: GeneratedTestQualityIndex
): string[] {
  return [...new Set(paths)].sort((left, right) => {
    return (
      getRelativeFileQualityWeight(qualityIndex, right) -
        getRelativeFileQualityWeight(qualityIndex, left) ||
      left.localeCompare(right)
    );
  });
}

export function buildWeightedValueBuckets<T extends string>(
  entries: Array<{ path: string; value: T }>,
  qualityIndex: GeneratedTestQualityIndex
): WeightedValueBucket<T>[] {
  const buckets = new Map<T, WeightedValueBucket<T>>();

  for (const entry of entries) {
    const bucket = buckets.get(entry.value) ?? {
      value: entry.value,
      weight: 0,
      count: 0,
      files: [],
    };
    bucket.weight += getRelativeFileQualityWeight(qualityIndex, entry.path);
    bucket.count += 1;
    bucket.files.push(entry.path);
    buckets.set(entry.value, bucket);
  }

  return [...buckets.values()];
}

export function compareWeightedBuckets<T extends string>(
  left: WeightedValueBucket<T>,
  right: WeightedValueBucket<T>,
  priorityOrder: readonly T[]
): number {
  const leftPriority = priorityOrder.indexOf(left.value);
  const rightPriority = priorityOrder.indexOf(right.value);

  return (
    right.weight - left.weight ||
    right.count - left.count ||
    (leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority) -
      (rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority) ||
    left.value.localeCompare(right.value)
  );
}

export function summarizePackageScoreLearning(
  profile: Pick<TaroPackageProfile, "conventions">,
  qualityIndex: GeneratedTestQualityIndex
): PackageScoreLearningSummary {
  const uniqueFiles = [
    ...new Set(profile.conventions.testFiles.map((file) => file.path)),
  ];
  const scoredTestFileCount = uniqueFiles.filter((file) =>
    qualityIndex.has(file)
  ).length;

  return {
    scoredTestFileCount,
    unscoredTestFileCount: Math.max(
      0,
      uniqueFiles.length - scoredTestFileCount
    ),
  };
}

function getLatestGeneratedTestRecordTimestamp(state: TaroState): number {
  return state.generatedTests.reduce((latest, record) => {
    const createdAtMs = Date.parse(record.createdAt);
    return Number.isFinite(createdAtMs)
      ? Math.max(latest, createdAtMs)
      : latest;
  }, 0);
}

function getLatestPackageScanTimestamp(state: TaroState): number {
  return Object.values(state.packages).reduce((latest, profile) => {
    const scannedAtMs = Date.parse(profile.scannedAt);
    return Number.isFinite(scannedAtMs)
      ? Math.max(latest, scannedAtMs)
      : latest;
  }, 0);
}

export function shouldRefreshStateFromGeneratedHistory(state: TaroState): boolean {
  return (
    getLatestGeneratedTestRecordTimestamp(state) >
    getLatestPackageScanTimestamp(state)
  );
}

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
      path: relative(projectRoot, file.path).replace(/\\/g, "/"),
    })),
  };
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
  testFiles: Array<{ content: string; path: string }>,
  qualityIndex: GeneratedTestQualityIndex = new Map()
): MockTargetUsage[] {
  const targets = new Map<
    string,
    { files: Set<string>; weightedSupport: number }
  >();

  for (const file of testFiles) {
    const sourceTestFile = relative(projectRoot, file.path).replace(/\\/g, "/");
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

  return [...targets.entries()]
    .sort(
      ([leftTarget, leftEntry], [rightTarget, rightEntry]) =>
        rightEntry.weightedSupport - leftEntry.weightedSupport ||
        rightEntry.files.size - leftEntry.files.size ||
        leftTarget.localeCompare(rightTarget)
    )
    .map(([target, entry]) => ({
      target,
      files: [...entry.files].sort(),
      count: entry.files.size,
    }));
}

export function analyzeMutationLifecycleInFiles(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>
): MutationLifecyclePattern[] {
  return testFiles
    .filter((file) => MUTATION_TRIGGER_REGEX.test(file.content))
    .map((file) => {
      const stages = findStages(file.content);
      if (stages.length < 2) {
        return null;
      }

      return {
        file: relative(projectRoot, file.path).replace(/\\/g, "/"),
        stages,
        evidence: stages.map((stage) => `${stage} cues detected`),
      };
    })
    .filter((entry): entry is MutationLifecyclePattern => entry !== null)
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function deriveInteractionContracts(params: {
  mutationLifecycles: MutationLifecyclePattern[];
  boundaryExemplars: TaroBoundaryExemplarProfile[];
}): TaroInteractionContractProfile[] {
  const { mutationLifecycles, boundaryExemplars } = params;
  const exemplarsByFile = new Map(
    boundaryExemplars.map((exemplar) => [exemplar.file.replace(/\\/g, "/"), exemplar])
  );

  return mutationLifecycles
    .map((lifecycle) => {
      const states = [
        lifecycle.stages.includes("loading") ? "in-flight" : null,
        lifecycle.stages.includes("error") ? "failed-completion" : null,
      ].filter((state): state is "in-flight" | "failed-completion" => state !== null);

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
    .filter((entry): entry is TaroInteractionContractProfile => entry !== null)
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function detectMockInstabilityInFiles(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>
): MockInstabilityWarning[] {
  const warnings: MockInstabilityWarning[] = [];

  for (const file of testFiles) {
    const relativePath = relative(projectRoot, file.path).replace(/\\/g, "/");
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

  return warnings.sort((left, right) => {
    return left.file.localeCompare(right.file) || left.kind.localeCompare(right.kind);
  });
}

export function classifyFolderPatternBucket(
  projectRoot: string,
  filePath: string
): AtomicFolderPattern {
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, "/");

  if (relativePath.includes("__tests__") || relativePath.includes("__test__")) {
    return "__tests__";
  }
  if (/(?:^|\/)tests\//.test(relativePath)) {
    return "tests";
  }

  return "colocated";
}

export function classifyFileExtensionBucket(
  filePath: string
): AtomicFileExtension {
  return /\.(?:ts|tsx)$/u.test(filePath) ? "ts" : "js";
}

export function inferWeightedImportStyle(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<ImportStyle> {
  const buckets = buildWeightedValueBuckets(
    files.map((file) => ({
      path: relative(projectRoot, file.path).replace(/\\/g, "/"),
      value: file.importStyle,
    })),
    qualityIndex
  ).sort((left, right) => compareWeightedBuckets(left, right, ["esm", "cjs"]));

  const winner = buckets[0];
  const totalWeight =
    buckets.reduce((sum, bucket) => sum + bucket.weight, 0) || 1;
  const value = winner?.value ?? "esm";

  return {
    value,
    confidence: winner ? toConfidence(winner.weight / totalWeight) : "low",
    evidence: winner
      ? sortPathsByQualityWeight(winner.files, qualityIndex).slice(
          0,
          MAX_EVIDENCE
        )
      : [],
  };
}

export function inferWeightedMockPattern(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<MockPattern> {
  const buckets = buildWeightedValueBuckets(
    files.map((file) => ({
      path: relative(projectRoot, file.path).replace(/\\/g, "/"),
      value: file.mockPattern,
    })),
    qualityIndex
  ).sort((left, right) =>
    compareWeightedBuckets(left, right, ["vi.mock", "jest.mock", "none"])
  );

  const winner = buckets[0];
  const totalWeight =
    buckets.reduce((sum, bucket) => sum + bucket.weight, 0) || 1;
  const value = winner?.value ?? "none";

  return {
    value,
    confidence: winner ? toConfidence(winner.weight / totalWeight) : "low",
    evidence: winner
      ? sortPathsByQualityWeight(winner.files, qualityIndex).slice(
          0,
          MAX_EVIDENCE
        )
      : [],
  };
}

export function inferWeightedFolderPattern(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<TaroFolderPattern> {
  if (files.length === 0) {
    return { value: "unknown", confidence: "low", evidence: [] };
  }

  const entries = files.map((file) => ({
    path: relative(projectRoot, file.path).replace(/\\/g, "/"),
    value: classifyFolderPatternBucket(projectRoot, file.path),
  }));
  const buckets = buildWeightedValueBuckets(entries, qualityIndex).sort(
    (left, right) =>
      compareWeightedBuckets(left, right, ["colocated", "__tests__", "tests"])
  );
  const winner = buckets[0];
  const totalWeight =
    buckets.reduce((sum, bucket) => sum + bucket.weight, 0) || 1;
  const winnerShare = winner ? winner.weight / totalWeight : 0;
  const value: TaroFolderPattern =
    buckets.length > 1 && winnerShare < MIXED_CONVENTION_THRESHOLD
      ? "mixed"
      : (winner?.value ?? "unknown");

  return {
    value,
    confidence: toConfidence(winnerShare),
    evidence:
      value === "mixed"
        ? sortPathsByQualityWeight(
            entries.map((entry) => entry.path),
            qualityIndex
          ).slice(0, MAX_EVIDENCE)
        : winner
          ? sortPathsByQualityWeight(winner.files, qualityIndex).slice(
              0,
              MAX_EVIDENCE
            )
          : [],
  };
}

export function inferWeightedFileExtension(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<TaroFileExtension> {
  if (files.length === 0) {
    return { value: "ts", confidence: "low", evidence: [] };
  }

  const entries = files.map((file) => ({
    path: relative(projectRoot, file.path).replace(/\\/g, "/"),
    value: classifyFileExtensionBucket(file.path),
  }));
  const buckets = buildWeightedValueBuckets(entries, qualityIndex).sort(
    (left, right) => compareWeightedBuckets(left, right, ["ts", "js"])
  );
  const winner = buckets[0];
  const totalWeight =
    buckets.reduce((sum, bucket) => sum + bucket.weight, 0) || 1;
  const winnerShare = winner ? winner.weight / totalWeight : 0;
  const value: TaroFileExtension =
    buckets.length > 1 && winnerShare < MIXED_CONVENTION_THRESHOLD
      ? "mixed"
      : (winner?.value ?? "ts");

  return {
    value,
    confidence: winner ? toConfidence(winnerShare) : "low",
    evidence:
      value === "mixed"
        ? sortPathsByQualityWeight(
            entries.map((entry) => entry.path),
            qualityIndex
          ).slice(0, MAX_EVIDENCE)
        : winner
          ? sortPathsByQualityWeight(winner.files, qualityIndex).slice(
              0,
              MAX_EVIDENCE
            )
          : [],
  };
}

export function inferFileExtension(
  conventions: ConventionsSchema
): TaroSignal<TaroFileExtension> {
  const value = conventions.fileExtension;
  const confidence =
    value === "mixed" || value === "tsx" || value === "jsx"
      ? "medium"
      : conventions.testFiles.length > 0
        ? "high"
        : "low";
  return {
    value,
    confidence,
    evidence: conventions.testFiles
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  };
}

export function inferFolderPattern(
  conventions: ConventionsSchema
): TaroSignal<TaroPackageProfile["folderPattern"]["value"]> {
  return {
    value: conventions.folderPattern,
    confidence: conventions.folderPattern === "unknown" ? "low" : "high",
    evidence: conventions.testFiles
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  };
}

export function inferImportStyle(
  conventions: ConventionsSchema
): TaroSignal<ImportStyle> {
  const cjsCount = conventions.testFiles.filter(
    (file) => file.importStyle === "cjs"
  ).length;
  const total = conventions.testFiles.length || 1;
  const winner =
    conventions.importStyle === "cjs" ? cjsCount : total - cjsCount;
  return {
    value: conventions.importStyle,
    confidence: toConfidence(winner / total),
    evidence: conventions.testFiles
      .filter((file) => file.importStyle === conventions.importStyle)
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  };
}

export function inferMockPattern(
  conventions: ConventionsSchema
): TaroSignal<MockPattern> {
  const winningFiles =
    conventions.mockPattern === "none"
      ? conventions.testFiles.filter((file) => file.mockPattern === "none")
          .length
      : conventions.testFiles.filter(
          (file) => file.mockPattern === conventions.mockPattern
        ).length;
  const total = conventions.testFiles.length || 1;
  return {
    value: conventions.mockPattern,
    confidence: toConfidence(winningFiles / total),
    evidence: conventions.testFiles
      .filter((file) => file.mockPattern === conventions.mockPattern)
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  };
}

export function parseImportBindings(
  content: string
): Array<{
  local: string;
  imported: string;
  importPath: string;
  kind: "default" | "named";
}> {
  const bindings: Array<{
    local: string;
    imported: string;
    importPath: string;
    kind: "default" | "named";
  }> = [];

  for (const match of content.matchAll(
    /import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g
  )) {
    const clause = match[1]!.trim();
    const importPath = match[2]!;
    const braceIndex = clause.indexOf("{");

    if (braceIndex === -1) {
      const local = clause.replace(/,\s*$/, "").trim();
      if (local.length > 0 && !local.startsWith("*")) {
        bindings.push({
          local,
          imported: "default",
          importPath,
          kind: "default",
        });
      }
      continue;
    }

    const defaultPart = clause.slice(0, braceIndex).replace(/,\s*$/, "").trim();
    if (defaultPart.length > 0 && !defaultPart.startsWith("*")) {
      bindings.push({
        local: defaultPart,
        imported: "default",
        importPath,
        kind: "default",
      });
    }

    const namedPart = clause.slice(braceIndex + 1, clause.lastIndexOf("}"));
    for (const rawEntry of namedPart.split(",")) {
      const entry = rawEntry.trim();
      if (!entry) {
        continue;
      }

      const [imported, alias] = entry.split(/\s+as\s+/);
      bindings.push({
        local: (alias ?? imported).trim(),
        imported: imported.trim(),
        importPath,
        kind: "named",
      });
    }
  }

  return bindings;
}

export function isRenderHelperBinding(binding: {
  local: string;
  importPath: string;
}): boolean {
  if (binding.importPath === "@testing-library/react") {
    return false;
  }

  return (
    binding.local === "render" ||
    /^render[A-Z]/.test(binding.local) ||
    binding.local === "renderWithProviders"
  );
}

export function collectRenderHelpers(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>,
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroRenderHelperProfile[] {
  const helpers = new Map<
    string,
    {
      profile: TaroRenderHelperProfile;
      files: Set<string>;
      weightedUsage: number;
      bestSourceWeight: number;
    }
  >();

  for (const file of testFiles) {
    const sourceTestFile = relative(projectRoot, file.path).replace(/\\/g, "/");
    const fileWeight = getRelativeFileQualityWeight(
      qualityIndex,
      sourceTestFile
    );
    const bindings = parseImportBindings(file.content);
    const usesWithin = file.content.includes("within(");

    for (const binding of bindings) {
      if (!isRenderHelperBinding(binding)) {
        continue;
      }

      if (!new RegExp(`\\b${binding.local}\\s*\\(`).test(file.content)) {
        continue;
      }

      const key = `${binding.local}|${binding.importPath}`;
      const existing = helpers.get(key);
      if (existing) {
        existing.profile.usageCount += 1;
        existing.profile.usesWithin = existing.profile.usesWithin || usesWithin;
        existing.weightedUsage += fileWeight;
        if (
          fileWeight > existing.bestSourceWeight ||
          (fileWeight === existing.bestSourceWeight &&
            sourceTestFile.localeCompare(existing.profile.sourceTestFile) < 0)
        ) {
          existing.profile.sourceTestFile = sourceTestFile;
          existing.bestSourceWeight = fileWeight;
        }
        existing.files.add(sourceTestFile);
        continue;
      }

      helpers.set(key, {
        profile: {
          name: binding.local,
          importPath: binding.importPath,
          importKind: binding.kind,
          sourceTestFile,
          usageCount: 1,
          usesWithin,
        },
        files: new Set([sourceTestFile]),
        weightedUsage: fileWeight,
        bestSourceWeight: fileWeight,
      });
    }
  }

  return [...helpers.values()]
    .sort((left, right) => {
      return (
        right.weightedUsage - left.weightedUsage ||
        right.profile.usageCount - left.profile.usageCount ||
        left.profile.name.localeCompare(right.profile.name) ||
        left.profile.importPath.localeCompare(right.profile.importPath)
      );
    })
    .map(({ profile }) => profile)
    .slice(0, MAX_EVIDENCE);
}

export function collectProviderWrappers(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>,
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroProviderWrapperProfile[] {
  const providers = new Map<
    string,
    {
      profile: TaroProviderWrapperProfile;
      weightedSupport: number;
      count: number;
      bestSourceWeight: number;
    }
  >();

  for (const file of testFiles) {
    const sourceTestFile = relative(projectRoot, file.path).replace(/\\/g, "/");
    const fileWeight = getRelativeFileQualityWeight(
      qualityIndex,
      sourceTestFile
    );
    const bindings = parseImportBindings(file.content);
    const importsByLocal = new Map(
      bindings.map((binding) => [binding.local, binding.importPath])
    );

    for (const match of file.content.matchAll(
      /wrapper\s*:\s*([A-Z][A-Za-z0-9_]*)/g
    )) {
      const name = match[1]!;
      const importPath = importsByLocal.get(name);
      if (!importPath) {
        continue;
      }

      const key = `${name}|${importPath}`;
      const existing = providers.get(key);
      if (existing) {
        existing.weightedSupport += fileWeight;
        existing.count += 1;
        if (
          fileWeight > existing.bestSourceWeight ||
          (fileWeight === existing.bestSourceWeight &&
            sourceTestFile.localeCompare(existing.profile.sourceTestFile) < 0)
        ) {
          existing.profile.sourceTestFile = sourceTestFile;
          existing.bestSourceWeight = fileWeight;
        }
        continue;
      }

      providers.set(key, {
        profile: { name, importPath, sourceTestFile },
        weightedSupport: fileWeight,
        count: 1,
        bestSourceWeight: fileWeight,
      });
    }
  }

  return [...providers.values()]
    .sort((left, right) => {
      return (
        right.weightedSupport - left.weightedSupport ||
        right.count - left.count ||
        left.profile.name.localeCompare(right.profile.name) ||
        left.profile.importPath.localeCompare(right.profile.importPath)
      );
    })
    .map(({ profile }) => profile);
}

export function extractFixtureRootFromImport(
  importPath: string
): { path: string; kind: TaroFixtureRootKind } | null {
  const normalized = importPath.replace(/\\/g, "/");
  const match = normalized.match(
    /^(.*?(mock-store|mocks|fixtures|factories))(?:\/.*)?$/
  );
  if (!match) {
    return null;
  }

  const rootPath = match[1]!;
  const kind = match[2] as TaroFixtureRootKind;
  return { path: rootPath, kind };
}

export function collectFixtureRootsFromImports(
  testFiles: Array<{ content: string; path: string }>
): TaroFixtureRootProfile[] {
  const roots = new Map<string, TaroFixtureRootProfile>();

  for (const file of testFiles) {
    for (const binding of parseImportBindings(file.content)) {
      const root = extractFixtureRootFromImport(binding.importPath);
      if (!root) {
        continue;
      }

      roots.set(root.path, {
        path: root.path,
        kind: root.kind,
        source: "import",
      });
    }
  }

  return [...roots.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

export function collectSharedMockFactories(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>,
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroSharedMockFactoryProfile[] {
  const factories = new Map<
    string,
    {
      files: Set<string>;
      count: number;
      importPath: string;
      target: string;
      weightedSupport: number;
    }
  >();

  for (const file of testFiles) {
    const relativePath = relative(projectRoot, file.path).replace(/\\/g, "/");
    const fileWeight = getRelativeFileQualityWeight(qualityIndex, relativePath);
    for (const binding of parseImportBindings(file.content)) {
      if (!/(mock|fixture|factor)/i.test(binding.importPath)) {
        continue;
      }

      const key = `${binding.importPath}|${binding.local}`;
      const existing = factories.get(key);
      if (existing) {
        existing.files.add(relativePath);
        existing.count += 1;
        existing.weightedSupport += fileWeight;
        continue;
      }

      factories.set(key, {
        files: new Set([relativePath]),
        count: 1,
        importPath: binding.importPath,
        target: binding.local,
        weightedSupport: fileWeight,
      });
    }
  }

  return [...factories.values()]
    .sort((left, right) => {
      return (
        right.weightedSupport - left.weightedSupport ||
        right.count - left.count ||
        left.target.localeCompare(right.target)
      );
    })
    .map((entry) => ({
      target: entry.target,
      importPath: entry.importPath,
      files: [...entry.files].sort(),
      count: entry.count,
    }))
    .slice(0, MAX_EVIDENCE);
}

export function createExemplarTags(
  file: { content: string },
  helperNames: string[]
): string[] {
  const tags = new Set<string>();

  if (file.content.includes("within(")) {
    tags.add("dialog-scope");
  }
  if (
    helperNames.some((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(file.content)
    )
  ) {
    tags.add("render-helper");
  }
  if (extractMockTargets(file.content).length > 0) {
    tags.add("mocking");
  }
  if (findStages(file.content).length >= 2) {
    tags.add("mutation");
  }
  if (file.content.includes("userEvent.setup")) {
    tags.add("user-event");
  }

  return [...tags].sort();
}

export function collectExemplars(
  projectRoot: string,
  testFiles: Array<{ content: string; path: string }>,
  renderHelpers: TaroRenderHelperProfile[],
  qualityIndex: GeneratedTestQualityIndex = new Map()
): TaroExemplarProfile[] {
  const helperNames = renderHelpers.map((helper) => helper.name);

  return testFiles
    .map((file) => ({
      file: relative(projectRoot, file.path).replace(/\\/g, "/"),
      tags: createExemplarTags(file, helperNames),
      weight: getFileQualityWeight(projectRoot, qualityIndex, file.path),
    }))
    .sort((left, right) => {
      return (
        right.weight - left.weight ||
        right.tags.length - left.tags.length ||
        left.file.localeCompare(right.file)
      );
    })
    .map(({ file, tags }) => ({ file, tags }))
    .slice(0, MAX_EXEMPLARS);
}

export function getTestConfigRoots(
  projectRoot: string,
  packageRoot: string
): string[] {
  return [...new Set([resolve(packageRoot), resolve(projectRoot)])];
}

export function extractQuotedStringValues(value: string): string[] {
  return [
    ...new Set(
      [...value.matchAll(/['"`]([^'"`]+)['"`]/g)]
        .map((match) => match[1]?.trim())
        .filter((match): match is string => Boolean(match))
    ),
  ];
}

export function extractSetupFileEntriesFromConfig(content: string): string[] {
  const entries: string[] = [];
  for (const match of content.matchAll(SETUP_FILE_CONFIG_REGEX)) {
    entries.push(...extractQuotedStringValues(match[1] ?? ""));
  }

  return [...new Set(entries)];
}

export function toStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function getNestedValue(source: unknown, path: string[]): unknown {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function extractSetupFileEntriesFromPackageJson(raw: unknown): string[] {
  return [
    ...new Set([
      ...toStringList(getNestedValue(raw, ["vitest", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["vitest", "test", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["jest", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["jest", "setupFilesAfterEnv"])),
    ]),
  ];
}

export function resolveConfiguredPath(baseDir: string, rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith("<rootDir>/")) {
    return resolve(baseDir, trimmed.slice("<rootDir>/".length));
  }

  return resolve(baseDir, trimmed);
}

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
          testFile: entry.recordingFile!.replace(
            /\.[cm]?[jt]sx?$/,
            ".test.tsx"
          ),
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

export function findNearestPackageDescriptor(
  descriptors: PackageDescriptor[],
  filePath: string
): PackageDescriptor {
  const sorted = [...descriptors].sort(
    (left, right) => right.root.length - left.root.length
  );
  const normalizedFilePath = resolve(filePath);
  for (const descriptor of sorted) {
    if (
      normalizedFilePath === descriptor.root ||
      normalizedFilePath.startsWith(`${descriptor.root}/`) ||
      normalizedFilePath.startsWith(`${descriptor.root}\\`)
    ) {
      return descriptor;
    }
  }

  return (
    descriptors.find((descriptor) => descriptor.key === ".") ?? descriptors[0]!
  );
}

export function resolveExistingPackageProfile(
  state: TaroState | null,
  packageKey: string
): TaroPackageProfile | null {
  if (!state) {
    return null;
  }

  return state.packages[packageKey] ?? null;
}

export function summarizeRenderBoundaryPreference(
  profile: TaroPackageProfile
): "module" | "component" | "mixed" | "unknown" {
  const counts = new Map<"module" | "component", number>();

  for (const exemplar of profile.boundaryExemplars) {
    if (
      exemplar.renderBoundary === "module" ||
      exemplar.renderBoundary === "component"
    ) {
      counts.set(
        exemplar.renderBoundary,
        (counts.get(exemplar.renderBoundary) ?? 0) + 1
      );
    }
  }

  if (counts.size === 0) {
    return "unknown";
  }

  const moduleCount = counts.get("module") ?? 0;
  const componentCount = counts.get("component") ?? 0;

  if (moduleCount > 0 && componentCount > 0) {
    return "mixed";
  }

  return moduleCount > componentCount ? "module" : "component";
}

export function summarizeCollaboratorKinds(profile: TaroPackageProfile): string {
  if (profile.boundaryProfiles.length === 0) {
    return "none";
  }

  const counts = new Map<TaroBoundaryKind, number>();
  for (const boundaryProfile of profile.boundaryProfiles) {
    counts.set(
      boundaryProfile.kind,
      (counts.get(boundaryProfile.kind) ?? 0) + 1
    );
  }

  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
}

export function summarizeCanonicalBoundarySupport(
  profile: TaroPackageProfile
): string {
  const supportImports = [
    ...new Set(
      profile.boundaryProfiles
        .map((boundaryProfile) => boundaryProfile.supportImportPath)
        .filter((entry): entry is string => Boolean(entry))
    ),
  ].sort((left, right) => left.localeCompare(right));

  if (supportImports.length === 0) {
    return "none";
  }

  return supportImports.map((entry) => `\`${entry}\``).join(", ");
}

export function summarizeBoundaryTeaching(profile: TaroPackageProfile): string {
  const patterns = profile.teaching?.dominantPatterns ?? [];
  if (patterns.length === 0) {
    return "none";
  }
  return patterns.map((pattern) => `\`${pattern}\``).join(", ");
}

export function buildStateSummaryMarkdown(
  projectRoot: string,
  state: TaroState
): string {
  const qualityIndex = buildGeneratedTestQualityIndex(
    projectRoot,
    state.generatedTests
  );
  const lines = [
    "# Taro Boundary Summary",
    "",
    `Updated: ${state.meta.updatedAt}`,
    "",
  ];

  const profiles = Object.values(state.packages).sort((left, right) =>
    left.packagePath.localeCompare(right.packagePath)
  );

  if (profiles.length === 0) {
    lines.push("No package-scoped test knowledge has been learned yet.");
    return lines.join("\n");
  }

  for (const profile of profiles) {
    const learningSummary = summarizePackageScoreLearning(
      profile,
      qualityIndex
    );
    lines.push(`## ${profile.packagePath}`);
    lines.push("");
    lines.push(`- Runner: \`${profile.runner.value}\``);
    lines.push(
      `- Score-aware learning: ${learningSummary.scoredTestFileCount > 0 ? "active" : "inactive"} (${learningSummary.scoredTestFileCount} scored, ${learningSummary.unscoredTestFileCount} unscored, source=generatedTests, mode=weighted-bias)`
    );
    lines.push(
      `- Preferred render boundary: \`${summarizeRenderBoundaryPreference(profile)}\``
    );
    lines.push(`- Render boundary candidates: ${profile.renderTargets.length}`);
    lines.push(
      `- Collaborator categories: ${summarizeCollaboratorKinds(profile)}`
    );
    lines.push(
      `- Canonical boundary support: ${summarizeCanonicalBoundarySupport(profile)}`
    );
    lines.push(
      `- Dominant boundary patterns: ${summarizeBoundaryTeaching(profile)}`
    );
    lines.push(
      `- Learned boundary profiles: ${profile.boundaryProfiles.length}`
    );
    lines.push(
      `- Learned interaction contracts: ${profile.interactionContracts.length}`
    );
    lines.push(
      `- Low-confidence scaffolds awaiting corroboration: ${profile.boundaryProfiles.filter((entry) => entry.lowConfidenceScaffold).length}`
    );
    lines.push(
      `- Query hook policy: \`avoid\` by default (overrides can refine this at generation time)`
    );
    lines.push("");
    lines.push("### Boundaries");
    lines.push(
      ...summarizeBoundaryProfiles(profile.boundaryProfiles, {
        renderHelpers: profile.renderHelpers,
        playwrightAuth: profile.playwrightAuth,
      })
    );
    lines.push("");
    lines.push("### Boundary Teaching");
    if ((profile.teaching?.examples.length ?? 0) === 0) {
      lines.push("- No abstract boundary teaching examples recorded yet.");
    } else {
      for (const example of profile.teaching?.examples ?? []) {
        lines.push(
          `- \`${example.target}\`: pattern=${example.pattern}, confidence=${example.confidence}, summary=${example.summary}`
        );
      }
    }
    lines.push("");
    lines.push("### Exemplars");
    if (profile.boundaryExemplars.length === 0) {
      lines.push("- No boundary exemplars recorded yet.");
    } else {
      for (const exemplar of profile.boundaryExemplars) {
        lines.push(
          `- \`${exemplar.file}\`: render=${exemplar.renderBoundary}, overrides=${exemplar.overrideStyle}, boundaries=${exemplar.boundaryTargets.join(", ") || "none"}`
        );
      }
    }
    if (profile.warnings.length > 0) {
      lines.push("");
      lines.push("### Warnings");
      for (const warning of profile.warnings) {
        lines.push(`- ${warning}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildSummaryPackages(
  projectRoot: string,
  packages: Record<string, TaroPackageProfile>,
  generatedTests: TaroState["generatedTests"]
): TaroStateSummaryPackage[] {
  const qualityIndex = buildGeneratedTestQualityIndex(projectRoot, generatedTests);

  return Object.values(packages)
    .map((profile) => ({
      packagePath: profile.packagePath,
      runner: profile.runner.value,
      scannedAt: profile.scannedAt,
      renderHelperCount: profile.renderHelpers.length,
      repeatedMockTargetCount: profile.repeatedMockTargets.length,
      boundaryProfileCount: profile.boundaryProfiles.length,
      lowConfidenceBoundaryCount: profile.boundaryProfiles.filter(
        (entry) => entry.lowConfidenceScaffold
      ).length,
      fixtureRootCount: profile.fixtureRoots.length,
      ...summarizePackageScoreLearning(profile, qualityIndex),
      warnings: profile.warnings,
    }))
    .sort((left, right) => left.packagePath.localeCompare(right.packagePath));
}

export function buildSummaryFromPackages(
  summaryPackages: TaroStateSummaryPackage[],
  options: {
    migratedLegacyState: boolean;
    overridePackageCount: number;
    warnings: string[];
  }
): TaroStateSummary {
  return {
    packageCount: summaryPackages.length,
    renderHelperCount: summaryPackages.reduce(
      (sum, item) => sum + item.renderHelperCount,
      0
    ),
    repeatedMockTargetCount: summaryPackages.reduce(
      (sum, item) => sum + item.repeatedMockTargetCount,
      0
    ),
    boundaryProfileCount: summaryPackages.reduce(
      (sum, item) => sum + item.boundaryProfileCount,
      0
    ),
    lowConfidenceBoundaryCount: summaryPackages.reduce(
      (sum, item) => sum + item.lowConfidenceBoundaryCount,
      0
    ),
    fixtureRootCount: summaryPackages.reduce(
      (sum, item) => sum + item.fixtureRootCount,
      0
    ),
    migratedLegacyState: options.migratedLegacyState,
    overridePackageCount: options.overridePackageCount,
    packages: summaryPackages,
    warnings: options.warnings,
  };
}

export function buildExistingStateResult(
  projectRoot: string,
  existingState: TaroState,
  existingStateWarnings: string[],
  overridesDiagnostics: ReadOverridesDiagnostics
): ScanStateResult {
  const summaryPackages = buildSummaryPackages(
    projectRoot,
    existingState.packages,
    existingState.generatedTests
  );

  return {
    state: existingState,
    summary: buildSummaryFromPackages(summaryPackages, {
      migratedLegacyState: false,
      overridePackageCount: Object.keys(
        overridesDiagnostics.overrides.packages ?? {}
      ).length,
      warnings: [...existingStateWarnings, ...overridesDiagnostics.warnings],
    }),
  };
}

export function findRepoFallbackPackageProfile(
  state: TaroState
): TaroPackageProfile | null {
  if (state.packages["."]) {
    return state.packages["."]!;
  }

  const profiles = Object.values(state.packages);
  if (profiles.length === 0) {
    return null;
  }

  return [...profiles].sort((left, right) => {
    return (
      right.testFileCount - left.testFileCount ||
      left.packagePath.localeCompare(right.packagePath)
    );
  })[0]!;
}

export function findBestPackageProfile(
  state: TaroState,
  targetPath: string
): TaroPackageProfile | null {
  const normalizedTarget = targetPath.replace(/\\/g, "/");
  const profiles = Object.values(state.packages).sort(
    (left, right) => right.packagePath.length - left.packagePath.length
  );

  for (const profile of profiles) {
    if (
      profile.packagePath === "." ||
      normalizedTarget === profile.packagePath ||
      normalizedTarget.startsWith(`${profile.packagePath}/`)
    ) {
      return profile;
    }
  }

  return findRepoFallbackPackageProfile(state);
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
