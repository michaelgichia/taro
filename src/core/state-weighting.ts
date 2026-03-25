import {
  GENERATED_TEST_HISTORY_LIMIT_PER_TEST,
  MAX_EVIDENCE,
  MIXED_CONVENTION_THRESHOLD,
  SCORE_REVIEW_CAP,
  SCORE_WEIGHT_BASE,
  SCORE_WEIGHT_MAX,
  SCORE_WEIGHT_MIN,
} from "#core/state.constants.ts";
import { clamp, groupBy, orderBy, sumBy, uniq } from "#core/lodash.ts";
import { normalizeGeneratedTestHistoryPath, normalizeRepoRelativePath, toProjectRelativeFilePath } from "#core/state-paths.ts";
import type {
  AtomicFileExtension,
  AtomicFolderPattern,
  GeneratedTestQualityEntry,
  GeneratedTestQualityIndex,
  PackageScoreLearningSummary,
  WeightedValueBucket,
} from "#core/state.types.ts";
import type { ConventionFile, ConventionsSchema, ImportStyle, MockPattern } from "#types/conventions.ts";
import type {
  TaroFileExtension,
  TaroFolderPattern,
  TaroGeneratedTestRecord,
  TaroPackageProfile,
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

export function calculateGeneratedTestQualityWeight(
  record: Pick<TaroGeneratedTestRecord, "quality" | "requiresReview">
): number {
  const baseWeight = clamp(
    SCORE_WEIGHT_BASE + record.quality.overall / 100,
    SCORE_WEIGHT_MIN,
    SCORE_WEIGHT_MAX
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
  return orderBy(
    uniq([...paths]),
    [
      (path) => getRelativeFileQualityWeight(qualityIndex, path),
      (path) => path,
    ],
    ["desc", "asc"]
  );
}

function buildWeightedValueBuckets<T extends string>(
  entries: Array<{ path: string; value: T }>,
  qualityIndex: GeneratedTestQualityIndex
): WeightedValueBucket<T>[] {
  const grouped = groupBy(entries, (entry) => entry.value);

  return Object.entries(grouped).map(([value, bucketEntries]) => ({
    value: value as T,
    weight: sumBy(bucketEntries, (entry) =>
      getRelativeFileQualityWeight(qualityIndex, entry.path)
    ),
    count: bucketEntries.length,
    files: bucketEntries.map((entry) => entry.path),
  }));
}

function rankWeightedBuckets<T extends string>(
  buckets: WeightedValueBucket<T>[],
  priorityOrder: readonly T[]
): WeightedValueBucket<T>[] {
  return orderBy(
    buckets,
    [
      (bucket) => bucket.weight,
      (bucket) => bucket.count,
      (bucket) => {
        const priority = priorityOrder.indexOf(bucket.value);
        return priority === -1 ? Number.MAX_SAFE_INTEGER : -priority;
      },
      (bucket) => bucket.value,
    ],
    ["desc", "desc", "desc", "asc"]
  );
}

export function summarizePackageScoreLearning(
  profile: Pick<TaroPackageProfile, "conventions">,
  qualityIndex: GeneratedTestQualityIndex
): PackageScoreLearningSummary {
  const uniqueFiles = uniq(profile.conventions.testFiles.map((file) => file.path));
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

export function classifyFolderPatternBucket(
  projectRoot: string,
  filePath: string
): AtomicFolderPattern {
  const relativePath = toProjectRelativeFilePath(projectRoot, filePath);

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

function inferWeightedSignal<TBucket extends string, TValue extends string>(options: {
  projectRoot: string;
  files: ConventionFile[];
  qualityIndex: GeneratedTestQualityIndex;
  priorityOrder: readonly TBucket[];
  defaultValue: TValue;
  valueForFile: (file: ConventionFile, projectRoot: string) => TBucket;
  resolveValue?: (context: {
    buckets: WeightedValueBucket<TBucket>[];
    entries: Array<{ path: string; value: TBucket }>;
    winner: WeightedValueBucket<TBucket> | undefined;
    winnerShare: number;
  }) => TValue;
}): TaroSignal<TValue> {
  if (options.files.length === 0) {
    return { value: options.defaultValue, confidence: "low", evidence: [] };
  }

  const entries = options.files.map((file) => ({
    path: toProjectRelativeFilePath(options.projectRoot, file.path),
    value: options.valueForFile(file, options.projectRoot),
  }));
  const buckets = rankWeightedBuckets(
    buildWeightedValueBuckets(entries, options.qualityIndex),
    options.priorityOrder
  );
  const winner = buckets[0];
  const totalWeight = sumBy(buckets, (bucket) => bucket.weight) || 1;
  const winnerShare = winner ? winner.weight / totalWeight : 0;
  const value =
    options.resolveValue?.({
      buckets,
      entries,
      winner,
      winnerShare,
    }) ?? ((winner?.value ?? options.defaultValue) as unknown as TValue);

  return {
    value,
    confidence: winner ? toConfidence(winnerShare) : "low",
    evidence:
      value === "mixed"
        ? sortPathsByQualityWeight(
            entries.map((entry) => entry.path),
            options.qualityIndex
          ).slice(0, MAX_EVIDENCE)
        : winner
          ? sortPathsByQualityWeight(winner.files, options.qualityIndex).slice(
              0,
              MAX_EVIDENCE
            )
          : [],
  };
}

export function inferWeightedImportStyle(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<ImportStyle> {
  return inferWeightedSignal({
    projectRoot,
    files,
    qualityIndex,
    priorityOrder: ["esm", "cjs"],
    defaultValue: "esm",
    valueForFile: (file) => file.importStyle,
  });
}

export function inferWeightedMockPattern(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<MockPattern> {
  return inferWeightedSignal({
    projectRoot,
    files,
    qualityIndex,
    priorityOrder: ["vi.mock", "jest.mock", "none"],
    defaultValue: "none",
    valueForFile: (file) => file.mockPattern,
  });
}

export function inferWeightedFolderPattern(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<TaroFolderPattern> {
  return inferWeightedSignal({
    projectRoot,
    files,
    qualityIndex,
    priorityOrder: ["colocated", "__tests__", "tests"],
    defaultValue: "unknown",
    valueForFile: (file, root) => classifyFolderPatternBucket(root, file.path),
    resolveValue: ({ buckets, winner, winnerShare }) =>
      buckets.length > 1 && winnerShare < MIXED_CONVENTION_THRESHOLD
        ? "mixed"
        : (winner?.value ?? "unknown"),
  });
}

export function inferWeightedFileExtension(
  projectRoot: string,
  files: ConventionFile[],
  qualityIndex: GeneratedTestQualityIndex
): TaroSignal<TaroFileExtension> {
  return inferWeightedSignal({
    projectRoot,
    files,
    qualityIndex,
    priorityOrder: ["ts", "js"],
    defaultValue: "ts",
    valueForFile: (file) => classifyFileExtensionBucket(file.path),
    resolveValue: ({ buckets, winner, winnerShare }) =>
      buckets.length > 1 && winnerShare < MIXED_CONVENTION_THRESHOLD
        ? "mixed"
        : (winner?.value ?? "ts"),
  });
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

export function buildSummaryPackages(
  projectRoot: string,
  packages: Record<string, TaroPackageProfile>,
  generatedTests: TaroState["generatedTests"]
): TaroStateSummaryPackage[] {
  const qualityIndex = buildGeneratedTestQualityIndex(projectRoot, generatedTests);

  return orderBy(
    Object.values(packages).map((profile) => ({
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
    })),
    [(profile) => profile.packagePath],
    ["asc"]
  );
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
    renderHelperCount: sumBy(summaryPackages, (item) => item.renderHelperCount),
    repeatedMockTargetCount: sumBy(
      summaryPackages,
      (item) => item.repeatedMockTargetCount
    ),
    boundaryProfileCount: sumBy(summaryPackages, (item) => item.boundaryProfileCount),
    lowConfidenceBoundaryCount: sumBy(
      summaryPackages,
      (item) => item.lowConfidenceBoundaryCount
    ),
    fixtureRootCount: sumBy(summaryPackages, (item) => item.fixtureRootCount),
    migratedLegacyState: options.migratedLegacyState,
    overridePackageCount: options.overridePackageCount,
    packages: summaryPackages,
    warnings: options.warnings,
  };
}
