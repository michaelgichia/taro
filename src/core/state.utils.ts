export {
  createPlaywrightAuthProfile,
  findBestPackageProfile,
  findNearestPackageDescriptor,
  findRepoFallbackPackageProfile,
  getTestConfigRoots,
  normalizeGeneratedTestHistoryPath,
  normalizePackageKey,
  normalizeRepoRelativePath,
  resolveConfiguredPath,
  resolveExistingPackageProfile,
  toPosixPath,
  toStateRelativePath,
} from "#core/state-paths.ts";

export {
  analyzeMutationLifecycleInFiles,
  countMatches,
  deriveInteractionContracts,
  deriveMockRecommendations,
  detectMockInstabilityInFiles,
  extractMockTargets,
  findStages,
  scanMockTargetsInFiles,
} from "#core/state-mock-analysis.ts";

export {
  collectExemplars,
  collectFixtureRootsFromImports,
  collectProviderWrappers,
  collectRenderHelpers,
  collectSharedMockFactories,
  collectStateSourceInsights,
  createExemplarTags,
  extractFixtureRootFromImport,
} from "#core/state-source-analysis.ts";

export {
  buildExistingStateResult,
  buildStateSummaryMarkdown,
  summarizeBoundaryTeaching,
  summarizeCanonicalBoundarySupport,
  summarizeCollaboratorKinds,
  summarizeRenderBoundaryPreference,
} from "#core/state-summary.ts";

export {
  createInitialLoadOrBootstrapStateMachineContext,
  createInitialScanStateMachineContext,
  deriveLegacyPackageProfile,
  emptyState,
  extractQuotedStringValues,
  extractSetupFileEntriesFromConfig,
  extractSetupFileEntriesFromPackageJson,
  migrateLegacyHistory,
  normalizeConventionPaths,
  waitForMachineCompletion,
} from "#core/state-runtime-utils.ts";

export {
  buildGeneratedTestQualityIndex,
  buildSummaryFromPackages,
  buildSummaryPackages,
  calculateGeneratedTestQualityWeight,
  classifyFileExtensionBucket,
  classifyFolderPatternBucket,
  getFileQualityWeight,
  getRelativeFileQualityWeight,
  inferFileExtension,
  inferFolderPattern,
  inferImportStyle,
  inferMockPattern,
  inferWeightedFileExtension,
  inferWeightedFolderPattern,
  inferWeightedImportStyle,
  inferWeightedMockPattern,
  shouldRefreshStateFromGeneratedHistory,
  sortPathsByQualityWeight,
  summarizePackageScoreLearning,
  toConfidence,
  trimGeneratedTestHistory,
} from "#core/state-weighting.ts";
