import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import pc from "picocolors";
import { z } from "zod";

import {
  buildBoundaryTeachingProfile,
  classifyBoundaryKind,
  collectBoundaryLearning,
  getBoundaryGuardrailReason,
  summarizeBoundaryProfiles,
} from "#core/boundary-learning.ts";
import {
  analyzeTestFile,
  deriveConventions,
  extractRenderTargetCandidatesFromFile,
  readTestFiles,
} from "#core/convention-intelligence.ts";
import {
  ensureProjectStateDir,
  findReadableProjectStatePath,
  getProjectStatePath,
} from "#project-state.ts";
import type {
  ConventionFile,
  ConventionsSchema,
  ImportStyle,
  InteractionContractKind,
  InteractionContractPattern,
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
  ResolvedTaroPackageProfile,
  TaroBoundaryExemplarProfile,
  TaroBoundaryGuardrailReason,
  TaroBoundaryKind,
  TaroExemplarProfile,
  TaroFileExtension,
  TaroFixtureRootKind,
  TaroFixtureRootProfile,
  TaroFolderPattern,
  TaroGeneratedTestRecord,
  TaroInteractionContractProfile,
  TaroJestDomSetup,
  TaroMockStoreResource,
  TaroOverrides,
  TaroPackageOverrides,
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
  TaroTestRunner,
} from "#types/state.ts";
import { TARO_VERSION } from "#version.ts";

const STATE_VERSION = 1;
const GENERATED_TEST_HISTORY_LIMIT_PER_TEST = 5;
const MAX_EVIDENCE = 50;
const MAX_EXEMPLARS = 5;
const MAX_FIXTURE_ROOTS = 25;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".taro",
  "coverage",
  ".next",
  ".nuxt",
]);
const FIXTURE_DIR_NAMES = [
  "mock-store",
  "mocks",
  "fixtures",
  "factories",
] as const;
const MOCK_TARGET_REGEX = /(?:vi|jest)\.mock\(\s*['"`]([^'"`]+)['"`]/g;
const MUTATION_TRIGGER_REGEX =
  /\b(mutate|mutation|submit|save|create|update|delete)\b|mock(?:Resolved|Rejected)Value(?:Once)?\(/i;
const TEST_BLOCK_REGEX = /\b(?:it|test)\s*\(/g;
const TEST_SCOPED_MOCK_REGEX = /(?:vi|jest)\.mock\(/i;
const MOCK_RESET_REGEX =
  /(?:vi|jest)\.(?:clearAllMocks|resetAllMocks|restoreAllMocks)\(/g;
const MOCK_CONFIGURATION_REGEX =
  /\.mock(?:ResolvedValue|RejectedValue|Implementation|ReturnValue)(?:Once)?\(/g;
const PLAYWRIGHT_CONFIG_FILES = [
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.cts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
] as const;
const PLAYWRIGHT_STORAGE_STATE_REGEX =
  /storageState\s*:\s*['"`]([^'"`]+)['"`]/g;
const PLAYWRIGHT_AUTH_DIRS = [
  "playwright/.auth",
  ".auth",
  "e2e/.auth",
  "tests/e2e/.auth",
] as const;
const TEST_CONFIG_FILE_REGEX = /^(?:vitest|vite|jest)\.config\.[cm]?[jt]sx?$/u;
const JEST_DOM_IMPORT_REGEX =
  /(?:import\s+['"]@testing-library\/jest-dom(?:\/vitest)?['"]|require\(\s*['"]@testing-library\/jest-dom(?:\/vitest)?['"]\s*\))/u;
const SETUP_FILE_CONFIG_REGEX =
  /\bsetupFiles(?:AfterEnv)?\s*:\s*(\[[\s\S]*?\]|['"`][^'"`]+['"`])/g;
const STAGE_PATTERNS: Record<MutationLifecycleStage, RegExp[]> = {
  loading: [
    /\bisLoading\b/i,
    /\bloading\b/i,
    /\bpending\b/i,
    /\bsubmitting\b/i,
    /toBeDisabled\(/,
  ],
  success: [
    /mockResolvedValue(?:Once)?\(/,
    /\b(success|saved|created|updated|submitted)\b/i,
    /toHaveBeenCalled(?:Times|With)?\(/,
  ],
  error: [
    /mockRejectedValue(?:Once)?\(/,
    /throw new Error\(/,
    /\b(error|failed|failure)\b/i,
    /role:\s*['"`]alert['"`]/,
  ],
};
const SCORE_WEIGHT_MIN = 0.6;
const SCORE_WEIGHT_MAX = 1.3;
const SCORE_WEIGHT_BASE = 0.3;
const SCORE_REVIEW_CAP = 0.85;
const MIXED_CONVENTION_THRESHOLD = 0.8;

type AtomicFolderPattern = Exclude<TaroFolderPattern, "mixed" | "unknown">;
type AtomicFileExtension = "ts" | "js";

interface GeneratedTestQualityEntry {
  createdAtMs: number;
  overall: number;
  weight: number;
  requiresReview: boolean;
}

type GeneratedTestQualityIndex = Map<string, GeneratedTestQualityEntry>;

interface WeightedValueBucket<T extends string> {
  value: T;
  weight: number;
  count: number;
  files: string[];
}

interface PackageScoreLearningSummary {
  scoredTestFileCount: number;
  unscoredTestFileCount: number;
}

const confidenceSchema = z.enum(["low", "medium", "high"]);
const importStyleSchema = z.enum(["esm", "cjs"]);
const testRunnerSchema = z.enum(["vitest", "jest", "unknown"]);
const jestDomSetupSchema = z.enum(["per-test-import", "global-setup"]);
const mockPatternSchema = z.enum(["vi.mock", "jest.mock", "none"]);
const folderPatternSchema = z.enum([
  "colocated",
  "__tests__",
  "tests",
  "mixed",
  "unknown",
]);
const fileExtensionSchema = z.enum(["ts", "tsx", "js", "jsx", "mixed"]);
const fixtureRootKindSchema = z.enum([
  "mock-store",
  "mocks",
  "fixtures",
  "factories",
]);
const boundaryKindSchema = z.enum([
  "data-module",
  "server-action",
  "network-client",
  "auth",
  "router",
  "feature-flag",
  "env",
  "local-child",
  "unknown",
]);
const boundaryStrategySchema = z.enum([
  "shared-module-factory",
  "scaffolded-module-factory",
  "provider-wrapper",
  "inline-safe",
  "forbid",
  "real-runtime",
]);
const boundaryPatternSchema = z.enum([
  "keep-real",
  "partial-support-import",
  "factory-support",
  "provider-wrapper",
  "inline-safe",
]);
const boundaryPayloadSourceSchema = z.enum([
  "mock-store",
  "fixtures",
  "typed-defaults",
  "exemplar-only",
  "manual",
  "unknown",
]);
const boundaryGuardrailReasonSchema = z.enum([
  "repo-owned-ui-wrapper",
  "ui-package",
]);
const queryHookPolicySchema = z.enum([
  "avoid",
  "allow-centralized",
  "allow-when-needed",
]);
const conventionFileSchema = z.object({
  path: z.string(),
  importStyle: importStyleSchema,
  hasDescribeBlock: z.boolean(),
  mockPattern: mockPatternSchema,
  hasHelperWithExpect: z.boolean(),
});
const conventionsSchema = z.object({
  scannedAt: z.string(),
  projectRoot: z.string(),
  importStyle: importStyleSchema,
  mockPattern: mockPatternSchema,
  testFiles: z.array(conventionFileSchema),
  folderPattern: folderPatternSchema,
  fileExtension: fileExtensionSchema,
});
const taroSignalSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: confidenceSchema,
    evidence: z.array(z.string()),
  });
const renderTargetCandidateSchema = z.object({
  symbol: z.string(),
  importPath: z.string(),
  sourceTestFile: z.string(),
  helperNames: z.array(z.string()),
  usesWithin: z.boolean(),
  evidenceTerms: z.array(z.string()).optional(),
});
const renderHelperProfileSchema = z.object({
  name: z.string(),
  importPath: z.string(),
  importKind: z.enum(["named", "default"]),
  sourceTestFile: z.string(),
  usageCount: z.number(),
  usesWithin: z.boolean(),
});
const providerWrapperProfileSchema = z.object({
  name: z.string(),
  importPath: z.string(),
  sourceTestFile: z.string(),
});
const sharedMockFactoryProfileSchema = z.object({
  target: z.string(),
  importPath: z.string(),
  files: z.array(z.string()),
  count: z.number(),
});
const boundarySupportExportsSchema = z.object({
  factoryExport: z.string().nullable(),
  resetExport: z.string().nullable(),
  overrideExports: z.array(z.string()),
  spyExports: z.array(z.string()),
  fixtureExports: z.array(z.string()),
});
const boundaryProfileSchema = z.object({
  target: z.string(),
  kind: boundaryKindSchema,
  strategy: boundaryStrategySchema,
  pattern: boundaryPatternSchema.optional(),
  guardrailReason: boundaryGuardrailReasonSchema.nullable().default(null),
  supportImportPath: z.string().nullable(),
  supportPath: z.string().nullable(),
  supportExports: boundarySupportExportsSchema,
  payloadSource: boundaryPayloadSourceSchema,
  confidence: confidenceSchema,
  files: z.array(z.string()),
  evidence: z.array(z.string()),
  conflictTargets: z.array(z.string()),
  lowConfidenceScaffold: z.boolean(),
});
const fixtureRootProfileSchema = z.object({
  path: z.string(),
  kind: fixtureRootKindSchema,
  source: z.enum(["directory", "import"]),
});
const exemplarProfileSchema = z.object({
  file: z.string(),
  tags: z.array(z.string()),
});
const boundaryExemplarProfileSchema = z.object({
  file: z.string(),
  renderBoundary: z.enum(["module", "component", "unknown"]),
  boundaryTargets: z.array(z.string()),
  boundaryKinds: z.array(boundaryKindSchema),
  usesProviderWrapper: z.boolean(),
  usesCentralBoundarySupport: z.boolean(),
  hasMutationLifecycle: z.boolean(),
  overrideStyle: z.enum(["stable-handles", "inline-reconfigure", "none"]),
  tags: z.array(z.string()),
});
const boundaryTeachingExampleSchema = z.object({
  target: z.string(),
  pattern: boundaryPatternSchema,
  summary: z.string(),
  reason: z.string(),
  confidence: confidenceSchema,
  evidence: z.array(z.string()),
  counterExamples: z.array(z.string()),
});
const boundaryTeachingProfileSchema = z.object({
  dominantPatterns: z.array(boundaryPatternSchema),
  examples: z.array(boundaryTeachingExampleSchema),
});
const mockTargetUsageSchema = z.object({
  target: z.string(),
  files: z.array(z.string()),
  count: z.number(),
});
const mutationLifecyclePatternSchema = z.object({
  file: z.string(),
  stages: z.array(z.enum(["loading", "success", "error"])),
  evidence: z.array(z.string()),
});
const interactionContractProfileSchema = z.object({
  file: z.string(),
  kind: z.enum(["mutation-form"]),
  states: z.array(z.enum(["in-flight", "failed-completion"])),
  supportTargets: z.array(z.string()),
  overrideStyle: z.enum(["stable-handles", "inline-reconfigure", "none"]),
  confidence: confidenceSchema,
  evidence: z.array(z.string()),
});
const mockInstabilityWarningSchema = z.object({
  file: z.string(),
  kind: z.enum(["recreated-factory", "per-test-churn"]),
  reason: z.string(),
  evidence: z.array(z.string()),
});
const mockRecommendationSchema = z.object({
  target: z.string(),
  kind: z.enum(["inline", "extract"]),
  reason: z.string(),
  files: z.array(z.string()),
  count: z.number(),
});
const playwrightAuthProfileSchema = z.object({
  strategy: z.enum(["storageState", "instructions"]),
  path: z.string(),
  detectedAt: z.enum(["init", "refresh", "generate"]),
  source: z.enum(["detected", "manual"]),
});
const scoreDimensionsSchema = z.object({
  queryQuality: z.number(),
  assertionSpecificity: z.number(),
  testStructure: z.number(),
  boundaryIsolation: z.number(),
});
const scoreSignalsSchema = z
  .object({
    queryCheckpointCount: z.number().optional().default(0),
    roleQueryCount: z.number().optional().default(0),
    testIdQueryCount: z.number().optional().default(0),
    strongAssertionCount: z.number().optional().default(0),
    presenceAssertionCount: z.number().optional(),
    visibilityAssertionCount: z.number().optional().default(0),
    visibilityOnlyTestCount: z.number().optional().default(0),
    presenceOnlyTestCount: z.number().optional().default(0),
    boundaryWarningCount: z.number().optional().default(0),
    boundaryIssueCount: z.number().optional().default(0),
    placeholderRenderTarget: z.boolean().optional().default(false),
    multipleTestBlocks: z.boolean().optional().default(false),
    minimumExpectedTestCount: z.number().optional().default(0),
    branchCoverageRatio: z.number().optional().default(1),
    missingMockCount: z.number().optional().default(0),
    fireEventCount: z.number().optional().default(0),
    hasBasePropsConstant: z.boolean().optional().default(false),
    hasOverrideRenderHelper: z.boolean().optional().default(false),
    duplicatedInlineRenderCount: z.number().optional().default(0),
    hasStandaloneUtilityDescribe: z.boolean().optional().default(false),
    weakAssertionCount: z.number().optional(),
  })
  .transform((signals) => ({
    ...signals,
    presenceAssertionCount:
      signals.presenceAssertionCount ?? signals.weakAssertionCount ?? 0,
  }));
const scoreReasonSchema = z.object({
  code: z.string(),
  dimension: z.enum([
    "queryQuality",
    "assertionSpecificity",
    "testStructure",
    "boundaryIsolation",
  ]),
  impact: z.enum(["positive", "negative"]),
  weight: z.number(),
  message: z.string(),
  severity: z.enum(["advisory", "blocker"]).optional(),
});
const packageProfileSchema = z.object({
  packagePath: z.string(),
  packageName: z.string().nullable(),
  scannedAt: z.string().optional().default(""),
  testFileCount: z.number(),
  conventions: conventionsSchema,
  importStyle: taroSignalSchema(importStyleSchema),
  runner: taroSignalSchema(testRunnerSchema),
  jestDomSetup: taroSignalSchema(jestDomSetupSchema).default({
    value: "per-test-import",
    confidence: "low",
    evidence: [],
  }),
  mockPattern: taroSignalSchema(mockPatternSchema),
  folderPattern: taroSignalSchema(folderPatternSchema),
  fileExtension: taroSignalSchema(fileExtensionSchema),
  renderHelpers: z.array(renderHelperProfileSchema),
  providerWrappers: z.array(providerWrapperProfileSchema),
  renderTargets: z.array(renderTargetCandidateSchema),
  repeatedMockTargets: z.array(mockTargetUsageSchema),
  sharedMockFactories: z.array(sharedMockFactoryProfileSchema),
  boundaryProfiles: z.array(boundaryProfileSchema).default([]),
  boundaryExemplars: z.array(boundaryExemplarProfileSchema).default([]),
  teaching: boundaryTeachingProfileSchema.default({
    dominantPatterns: [],
    examples: [],
  }),
  interactionContracts: z.array(interactionContractProfileSchema).default([]),
  inlineSafeMockTargets: z.array(z.string()),
  mutationLifecycles: z.array(mutationLifecyclePatternSchema),
  instabilityWarnings: z.array(mockInstabilityWarningSchema),
  mockRecommendations: z.array(mockRecommendationSchema),
  fixtureRoots: z.array(fixtureRootProfileSchema),
  exemplars: z.array(exemplarProfileSchema),
  playwrightAuth: playwrightAuthProfileSchema.nullable().default(null),
  warnings: z.array(z.string()),
});
const generatedTestRecordSchema = z.object({
  createdAt: z.string(),
  packagePath: z.string(),
  recordingFile: z.string().nullable().optional().default(null),
  testFile: z.string(),
  quality: z.object({
    overall: z.number(),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    dimensions: scoreDimensionsSchema,
    signals: scoreSignalsSchema,
    reasons: z.array(scoreReasonSchema),
  }),
  requiresReview: z.boolean(),
});
const taroStateSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    taroVersion: z.string(),
  }),
  packages: z.record(z.string(), packageProfileSchema),
  mockStore: z.object({
    rootDir: z.string().nullable(),
    importHint: z.string().nullable(),
    resources: z.array(
      z.object({
        name: z.string(),
        file: z.string(),
        exports: z.array(z.string()),
        updatedAt: z.string(),
      })
    ),
  }),
  generatedTests: z.array(generatedTestRecordSchema),
});
const taroOverridesSchema = z.object({
  packages: z
    .record(
      z.string(),
      z.object({
        runner: z.enum(["vitest", "jest"]).optional(),
        renderHelper: z
          .object({ name: z.string(), importPath: z.string() })
          .optional(),
        forbidMocks: z.array(z.string()).optional(),
        preferredSharedMocks: z.record(z.string(), z.string()).optional(),
        boundaryPolicies: z
          .record(z.string(), boundaryStrategySchema)
          .optional(),
        preferredBoundaryImplementations: z
          .record(z.string(), z.string())
          .optional(),
        forbidBoundaryTargets: z.array(z.string()).optional(),
        queryHookPolicy: queryHookPolicySchema.optional(),
        companionPolicy: z.enum(["heuristic", "off"]).optional(),
        enabledContractFamilies: z.array(z.enum(["mutation-form"])).optional(),
      })
    )
    .optional(),
  healthCommands: z.array(z.string()).optional(),
});

interface PackageDescriptor {
  key: string;
  root: string;
  name: string | null;
}

interface TestFileContent {
  path: string;
  content: string;
}

interface ScanStateOptions {
  detectedAt?: TaroPlaywrightAuthDetectedAt;
  preserveGeneratedTests?: boolean;
  existingState?: TaroState | null;
}

export interface ScanStateResult {
  state: TaroState;
  summary: TaroStateSummary;
}

interface ReadStateDiagnostics {
  state: TaroState | null;
  warnings: string[];
}

interface ReadOverridesDiagnostics {
  overrides: TaroOverrides;
  warnings: string[];
}

export interface TaroPackageProfileStaleness {
  stale: boolean;
  reason: string | null;
  latestEvidencePath: string | null;
}

function toConfidence(value: number): TaroStateConfidence {
  if (value >= 0.8) {
    return "high";
  }
  if (value >= 0.45) {
    return "medium";
  }
  return "low";
}

function normalizePackageKey(projectRoot: string, packageRoot: string): string {
  const relativePath = relative(projectRoot, packageRoot).replace(/\\/g, "/");
  return relativePath.length === 0 ? "." : relativePath;
}

function toStateRelativePath(projectRoot: string, filePath: string): string {
  const normalized = relative(projectRoot, filePath).replace(/\\/g, "/");
  return normalized.length === 0 ? "." : normalized;
}

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function createPlaywrightAuthProfile(
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

async function findStorageStateFromConfig(
  projectRoot: string,
  configPath: string,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return null;
  }

  const matches = [...content.matchAll(PLAYWRIGHT_STORAGE_STATE_REGEX)];
  for (const match of matches) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }

    const resolvedPath = resolve(dirname(configPath), candidate);
    if (await isReadableFile(resolvedPath)) {
      return createPlaywrightAuthProfile(projectRoot, resolvedPath, {
        detectedAt,
        source: "detected",
      });
    }
  }

  return null;
}

async function findStorageStateInDirectory(
  projectRoot: string,
  dirPath: string,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    return null;
  }

  return createPlaywrightAuthProfile(projectRoot, files[0]!, {
    detectedAt,
    source: "detected",
  });
}

async function detectPlaywrightAuthForPackage(
  projectRoot: string,
  descriptor: PackageDescriptor,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  const roots =
    descriptor.key === "." ? [descriptor.root] : [descriptor.root, projectRoot];
  const seenConfigs = new Set<string>();
  const seenDirs = new Set<string>();

  for (const root of roots) {
    for (const fileName of PLAYWRIGHT_CONFIG_FILES) {
      const configPath = join(root, fileName);
      if (seenConfigs.has(configPath)) {
        continue;
      }
      seenConfigs.add(configPath);

      const configProfile = await findStorageStateFromConfig(
        projectRoot,
        configPath,
        detectedAt
      );
      if (configProfile) {
        return configProfile;
      }
    }
  }

  for (const root of roots) {
    for (const dirName of PLAYWRIGHT_AUTH_DIRS) {
      const authDir = join(root, dirName);
      if (seenDirs.has(authDir)) {
        continue;
      }
      seenDirs.add(authDir);

      const dirProfile = await findStorageStateInDirectory(
        projectRoot,
        authDir,
        detectedAt
      );
      if (dirProfile) {
        return dirProfile;
      }
    }
  }

  return null;
}

async function canUsePersistedPlaywrightAuth(
  projectRoot: string,
  auth: TaroPlaywrightAuthProfile | null | undefined
): Promise<boolean> {
  if (!auth) {
    return false;
  }

  return isReadableFile(resolve(projectRoot, auth.path));
}

function clampNumber(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRepoRelativePath(
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

function calculateGeneratedTestQualityWeight(
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

function buildGeneratedTestQualityIndex(
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

function normalizeGeneratedTestHistoryPath(
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

function trimGeneratedTestHistory(
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

function getRelativeFileQualityWeight(
  qualityIndex: GeneratedTestQualityIndex,
  relativePath: string
): number {
  return qualityIndex.get(relativePath)?.weight ?? 1;
}

function getFileQualityWeight(
  projectRoot: string,
  qualityIndex: GeneratedTestQualityIndex,
  filePath: string
): number {
  const normalizedPath = normalizeRepoRelativePath(projectRoot, filePath);
  return normalizedPath
    ? getRelativeFileQualityWeight(qualityIndex, normalizedPath)
    : 1;
}

function sortPathsByQualityWeight(
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

function buildWeightedValueBuckets<T extends string>(
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

function compareWeightedBuckets<T extends string>(
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

function summarizePackageScoreLearning(
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

function shouldRefreshStateFromGeneratedHistory(state: TaroState): boolean {
  return (
    getLatestGeneratedTestRecordTimestamp(state) >
    getLatestPackageScanTimestamp(state)
  );
}

function normalizeConventionPaths(
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

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))]
    .length;
}

function extractMockTargets(content: string): string[] {
  return [...content.matchAll(MOCK_TARGET_REGEX)].map((match) => match[1]!);
}

function findStages(content: string): MutationLifecycleStage[] {
  return (
    Object.entries(STAGE_PATTERNS) as [MutationLifecycleStage, RegExp[]][]
  )
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
    .map(([stage]) => stage);
}

function deriveMockRecommendations(
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

function scanMockTargetsInFiles(
  projectRoot: string,
  testFiles: TestFileContent[],
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

function analyzeMutationLifecycleInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
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

function deriveInteractionContracts(params: {
  mutationLifecycles: MutationLifecyclePattern[];
  boundaryExemplars: TaroBoundaryExemplarProfile[];
}): TaroInteractionContractProfile[] {
  const { mutationLifecycles, boundaryExemplars } = params;
  const exemplarsByFile = new Map(
    boundaryExemplars.map((exemplar) => [
      exemplar.file.replace(/\\/g, "/"),
      exemplar,
    ])
  );

  return mutationLifecycles
    .map((lifecycle) => {
      const states = [
        lifecycle.stages.includes("loading") ? "in-flight" : null,
        lifecycle.stages.includes("error") ? "failed-completion" : null,
      ].filter(
        (
          state
        ): state is NonNullable<InteractionContractPattern["states"][number]> =>
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
    .filter((entry): entry is TaroInteractionContractProfile => entry !== null)
    .sort((left, right) => left.file.localeCompare(right.file));
}

function detectMockInstabilityInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
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
    return (
      left.file.localeCompare(right.file) || left.kind.localeCompare(right.kind)
    );
  });
}

function classifyFolderPatternBucket(
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

function classifyFileExtensionBucket(filePath: string): AtomicFileExtension {
  return /\.(?:ts|tsx)$/u.test(filePath) ? "ts" : "js";
}

function inferWeightedImportStyle(
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

function inferWeightedMockPattern(
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

function inferWeightedFolderPattern(
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

function inferWeightedFileExtension(
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
    confidence:
      value === "mixed"
        ? toConfidence(winnerShare)
        : winner
          ? toConfidence(winnerShare)
          : "low",
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

function inferFileExtension(
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

function inferFolderPattern(
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

function inferImportStyle(
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

function inferMockPattern(
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

function parseImportBindings(
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

function isRenderHelperBinding(binding: {
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

function collectRenderHelpers(
  projectRoot: string,
  testFiles: TestFileContent[],
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

function collectProviderWrappers(
  projectRoot: string,
  testFiles: TestFileContent[],
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

function extractFixtureRootFromImport(
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

async function collectFixtureDirs(
  projectRoot: string
): Promise<TaroFixtureRootProfile[]> {
  const found = new Map<string, TaroFixtureRootProfile>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (found.size >= MAX_FIXTURE_ROOTS || depth > 6) {
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      const relativePath = relative(projectRoot, fullPath).replace(/\\/g, "/");

      if ((FIXTURE_DIR_NAMES as readonly string[]).includes(entry.name)) {
        found.set(relativePath, {
          path: relativePath,
          kind: entry.name as TaroFixtureRootKind,
          source: "directory",
        });
      }

      await walk(fullPath, depth + 1);
    }
  }

  await walk(projectRoot, 0);
  return [...found.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

function collectFixtureRootsFromImports(
  testFiles: TestFileContent[]
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

function collectSharedMockFactories(
  projectRoot: string,
  testFiles: TestFileContent[],
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

function createExemplarTags(
  file: TestFileContent,
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

function collectExemplars(
  projectRoot: string,
  testFiles: TestFileContent[],
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

async function readPackageName(packageRoot: string): Promise<string | null> {
  const packageJsonPath = join(packageRoot, "package.json");
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    const parsed = JSON.parse(content) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

async function hasConfigFile(
  packageRoot: string,
  prefix: string
): Promise<boolean> {
  try {
    const entries = await readdir(packageRoot);
    return entries.some((entry) => entry.startsWith(prefix));
  } catch {
    return false;
  }
}

function getTestConfigRoots(
  projectRoot: string,
  packageRoot: string
): string[] {
  return [...new Set([resolve(packageRoot), resolve(projectRoot)])];
}

async function listTestConfigFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root);
    return entries
      .filter((entry) => TEST_CONFIG_FILE_REGEX.test(entry))
      .sort()
      .map((entry) => join(root, entry));
  } catch {
    return [];
  }
}

function extractQuotedStringValues(value: string): string[] {
  return [
    ...new Set(
      [...value.matchAll(/['"`]([^'"`]+)['"`]/g)]
        .map((match) => match[1]?.trim())
        .filter((match): match is string => Boolean(match))
    ),
  ];
}

function extractSetupFileEntriesFromConfig(content: string): string[] {
  const entries: string[] = [];
  for (const match of content.matchAll(SETUP_FILE_CONFIG_REGEX)) {
    entries.push(...extractQuotedStringValues(match[1] ?? ""));
  }

  return [...new Set(entries)];
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

function getNestedValue(source: unknown, path: string[]): unknown {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractSetupFileEntriesFromPackageJson(raw: unknown): string[] {
  return [
    ...new Set([
      ...toStringList(getNestedValue(raw, ["vitest", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["vitest", "test", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["jest", "setupFiles"])),
      ...toStringList(getNestedValue(raw, ["jest", "setupFilesAfterEnv"])),
    ]),
  ];
}

function resolveConfiguredPath(baseDir: string, rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith("<rootDir>/")) {
    return resolve(baseDir, trimmed.slice("<rootDir>/".length));
  }

  return resolve(baseDir, trimmed);
}

async function collectConfiguredSetupFiles(
  projectRoot: string,
  packageRoot: string
): Promise<Map<string, string[]>> {
  const setupFiles = new Map<string, Set<string>>();

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    for (const configPath of await listTestConfigFiles(root)) {
      let content = "";
      try {
        content = await readFile(configPath, "utf-8");
      } catch {
        continue;
      }

      const sourcePath = relative(projectRoot, configPath).replace(/\\/g, "/");
      for (const entry of extractSetupFileEntriesFromConfig(content)) {
        const resolvedPath = resolveConfiguredPath(dirname(configPath), entry);
        const sources = setupFiles.get(resolvedPath) ?? new Set<string>();
        sources.add(sourcePath);
        setupFiles.set(resolvedPath, sources);
      }
    }

    const packageJsonPath = join(root, "package.json");
    try {
      const parsed = JSON.parse(
        await readFile(packageJsonPath, "utf-8")
      ) as unknown;
      const sourcePath = relative(projectRoot, packageJsonPath).replace(
        /\\/g,
        "/"
      );
      for (const entry of extractSetupFileEntriesFromPackageJson(parsed)) {
        const resolvedPath = resolveConfiguredPath(root, entry);
        const sources = setupFiles.get(resolvedPath) ?? new Set<string>();
        sources.add(sourcePath);
        setupFiles.set(resolvedPath, sources);
      }
    } catch {
      // Package metadata is optional for test setup detection.
    }
  }

  return new Map(
    [...setupFiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, sources]) => [path, [...sources].sort()])
  );
}

async function collectJestDomEvidenceFiles(
  projectRoot: string,
  packageRoot: string
): Promise<string[]> {
  const candidates = new Set<string>();

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    candidates.add(join(root, "package.json"));
    for (const configPath of await listTestConfigFiles(root)) {
      candidates.add(configPath);
    }
  }

  for (const setupFile of (
    await collectConfiguredSetupFiles(projectRoot, packageRoot)
  ).keys()) {
    candidates.add(setupFile);
  }

  return [...candidates];
}

async function detectJestDomSetup(
  projectRoot: string,
  descriptor: PackageDescriptor,
  testFiles: TestFileContent[],
  runner: TaroSignal<TaroTestRunner>
): Promise<TaroSignal<TaroJestDomSetup>> {
  const configuredSetupFiles = await collectConfiguredSetupFiles(
    projectRoot,
    descriptor.root
  );

  for (const [setupFile, sources] of configuredSetupFiles) {
    let content = "";
    try {
      content = await readFile(setupFile, "utf-8");
    } catch {
      continue;
    }

    if (!JEST_DOM_IMPORT_REGEX.test(content)) {
      continue;
    }

    const relativeSetupPath = relative(projectRoot, setupFile).replace(
      /\\/g,
      "/"
    );
    return {
      value: "global-setup",
      confidence: "high",
      evidence: [
        ...sources.map(
          (source) => `${source}: setupFiles -> ${relativeSetupPath}`
        ),
        `${relativeSetupPath}: imports @testing-library/jest-dom`,
      ].slice(0, MAX_EVIDENCE),
    };
  }

  const directImportFiles = testFiles.filter((file) =>
    JEST_DOM_IMPORT_REGEX.test(file.content)
  );
  if (directImportFiles.length > 0) {
    return {
      value: "per-test-import",
      confidence: "high",
      evidence: directImportFiles
        .map(
          (file) =>
            `${relative(projectRoot, file.path).replace(/\\/g, "/")}: imports @testing-library/jest-dom`
        )
        .slice(0, MAX_EVIDENCE),
    };
  }

  return {
    value: "per-test-import",
    confidence: runner.value === "unknown" ? "low" : "medium",
    evidence: [
      configuredSetupFiles.size > 0
        ? "Scanned configured test setup files without global jest-dom registration."
        : "No configured global jest-dom setup detected.",
    ],
  };
}

async function detectRunner(
  packageRoot: string,
  packageKey: string,
  testFiles: TestFileContent[]
): Promise<TaroSignal<TaroTestRunner>> {
  const evidence: string[] = [];
  let vitestWeight = 0;
  let jestWeight = 0;
  const packageJsonPath = join(packageRoot, "package.json");

  if (await hasConfigFile(packageRoot, "vitest.config.")) {
    vitestWeight += 4;
    evidence.push(`${packageKey}: vitest.config.* present`);
  }
  if (await hasConfigFile(packageRoot, "jest.config.")) {
    jestWeight += 4;
    evidence.push(`${packageKey}: jest.config.* present`);
  }

  try {
    const packageJson = JSON.parse(
      await readFile(packageJsonPath, "utf-8")
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyMap = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    if (
      dependencyMap.vitest ||
      Object.values(packageJson.scripts ?? {}).some((script) =>
        /vitest/.test(script)
      )
    ) {
      vitestWeight += 3;
      evidence.push(`${packageKey}: package.json references vitest`);
    }
    if (
      dependencyMap.jest ||
      Object.values(packageJson.scripts ?? {}).some((script) =>
        /\bjest\b/.test(script)
      )
    ) {
      jestWeight += 3;
      evidence.push(`${packageKey}: package.json references jest`);
    }
  } catch {
    // Package metadata is optional for runner detection.
  }

  const vitestFileHits = testFiles.filter(
    (file) =>
      /from\s+['"]vitest['"]/.test(file.content) || /\bvi\./.test(file.content)
  );
  const jestFileHits = testFiles.filter(
    (file) =>
      /from\s+['"]@jest\/globals['"]/.test(file.content) ||
      /from\s+['"]jest['"]/.test(file.content) ||
      /\bjest\./.test(file.content)
  );

  vitestWeight += vitestFileHits.length * 2;
  jestWeight += jestFileHits.length * 2;

  const winner: TaroTestRunner =
    vitestWeight === 0 && jestWeight === 0
      ? "unknown"
      : vitestWeight >= jestWeight
        ? "vitest"
        : "jest";
  const winningWeight =
    winner === "vitest" ? vitestWeight : winner === "jest" ? jestWeight : 0;
  const totalWeight = Math.max(vitestWeight + jestWeight, 1);
  const fileEvidence =
    winner === "vitest"
      ? vitestFileHits.map((file) =>
          relative(packageRoot, file.path).replace(/\\/g, "/")
        )
      : jestFileHits.map((file) =>
          relative(packageRoot, file.path).replace(/\\/g, "/")
        );

  return {
    value: winner,
    confidence:
      winner === "unknown" ? "low" : toConfidence(winningWeight / totalWeight),
    evidence: [...evidence, ...fileEvidence].slice(0, MAX_EVIDENCE),
  };
}

async function findPackageDescriptors(
  projectRoot: string
): Promise<PackageDescriptor[]> {
  const packages = new Map<string, PackageDescriptor>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== "package.json") {
        continue;
      }

      const packageRoot = dirname(fullPath);
      const key = normalizePackageKey(projectRoot, packageRoot);
      packages.set(key, {
        key,
        root: packageRoot,
        name: await readPackageName(packageRoot),
      });
    }
  }

  await walk(projectRoot);

  if (packages.size === 0) {
    packages.set(".", {
      key: ".",
      root: projectRoot,
      name: await readPackageName(projectRoot),
    });
  }

  return [...packages.values()].sort(
    (left, right) => right.root.length - left.root.length
  );
}

function findNearestPackageDescriptor(
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

function resolveExistingPackageProfile(
  state: TaroState | null,
  packageKey: string
): TaroPackageProfile | null {
  if (!state) {
    return null;
  }

  return state.packages[packageKey] ?? null;
}

async function buildPackageProfile(
  projectRoot: string,
  descriptor: PackageDescriptor,
  files: TestFileContent[],
  existingState: TaroState | null,
  qualityIndex: GeneratedTestQualityIndex,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPackageProfile> {
  const scannedAt = new Date().toISOString();
  const analyzedFiles = await Promise.all(
    files.map((file) => analyzeTestFile(file.path))
  );
  const importStyle = inferWeightedImportStyle(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const mockPattern = inferWeightedMockPattern(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const folderPattern = inferWeightedFolderPattern(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const fileExtension = inferWeightedFileExtension(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const conventions = normalizeConventionPaths(projectRoot, {
    ...deriveConventions(analyzedFiles, descriptor.root),
    importStyle: importStyle.value,
    mockPattern: mockPattern.value,
    folderPattern: folderPattern.value,
    fileExtension: fileExtension.value,
  });
  const repeatedMockTargets = scanMockTargetsInFiles(
    projectRoot,
    files,
    qualityIndex
  );
  const mockRecommendations = deriveMockRecommendations(repeatedMockTargets);
  const renderHelpers = collectRenderHelpers(projectRoot, files, qualityIndex);
  const providerWrappers = collectProviderWrappers(
    projectRoot,
    files,
    qualityIndex
  );
  const fixtureRoots = [
    ...collectFixtureRootsFromImports(files),
    ...(await collectFixtureDirs(descriptor.root)).map((root) => ({
      ...root,
      path:
        descriptor.key === "."
          ? root.path
          : `${descriptor.key}/${root.path}`.replace(/\/+/g, "/"),
    })),
  ]
    .filter(
      (root, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.path === root.path && candidate.kind === root.kind
        ) === index
    )
    .slice(0, MAX_FIXTURE_ROOTS);

  const warnings: string[] = [];
  const runner = await detectRunner(descriptor.root, descriptor.key, files);
  const jestDomSetup = await detectJestDomSetup(
    projectRoot,
    descriptor,
    files,
    runner
  );

  if (runner.value === "unknown") {
    warnings.push(
      "Runner could not be detected confidently from local tests/config."
    );
  }
  if (renderHelpers.length === 0) {
    warnings.push(
      "No shared render helper detected; generation may fall back to plain render()."
    );
  }

  const renderTargets = files
    .flatMap((file) => extractRenderTargetCandidatesFromFile(projectRoot, file))
    .sort((left, right) => {
      return (
        getRelativeFileQualityWeight(qualityIndex, right.sourceTestFile) -
          getRelativeFileQualityWeight(qualityIndex, left.sourceTestFile) ||
        left.sourceTestFile.localeCompare(right.sourceTestFile) ||
        left.symbol.localeCompare(right.symbol)
      );
    });
  const mutationLifecycles = analyzeMutationLifecycleInFiles(
    projectRoot,
    files
  );
  const instabilityWarnings = detectMockInstabilityInFiles(projectRoot, files);
  const boundaryLearning = await collectBoundaryLearning({
    projectRoot,
    testFiles: files,
    renderTargets,
    providerWrappers,
    mutationLifecycles,
    getFileWeight: (relativeFile) =>
      getRelativeFileQualityWeight(qualityIndex, relativeFile),
  });
  const interactionContracts = deriveInteractionContracts({
    mutationLifecycles,
    boundaryExemplars: boundaryLearning.exemplars,
  });
  const existingProfile = resolveExistingPackageProfile(
    existingState,
    descriptor.key
  );
  const detectedPlaywrightAuth = await detectPlaywrightAuthForPackage(
    projectRoot,
    descriptor,
    detectedAt
  );
  const preservedManualAuth =
    existingProfile?.playwrightAuth?.source === "manual" &&
    (await canUsePersistedPlaywrightAuth(
      projectRoot,
      existingProfile.playwrightAuth
    ))
      ? existingProfile.playwrightAuth
      : null;
  const playwrightAuth = preservedManualAuth ?? detectedPlaywrightAuth;

  return {
    packagePath: descriptor.key,
    packageName: descriptor.name,
    scannedAt,
    testFileCount: files.length,
    conventions,
    importStyle,
    runner,
    jestDomSetup,
    mockPattern,
    folderPattern,
    fileExtension,
    renderHelpers,
    providerWrappers,
    renderTargets,
    repeatedMockTargets: repeatedMockTargets.filter(
      (target) => target.count > 1
    ),
    sharedMockFactories: collectSharedMockFactories(
      projectRoot,
      files,
      qualityIndex
    ),
    boundaryProfiles: boundaryLearning.profiles,
    boundaryExemplars: boundaryLearning.exemplars,
    teaching: buildBoundaryTeachingProfile(boundaryLearning.profiles),
    interactionContracts,
    inlineSafeMockTargets: mockRecommendations
      .filter((recommendation) => recommendation.kind === "inline")
      .map((recommendation) => recommendation.target)
      .sort(),
    mutationLifecycles,
    instabilityWarnings,
    mockRecommendations,
    fixtureRoots,
    exemplars: collectExemplars(
      projectRoot,
      files,
      renderHelpers,
      qualityIndex
    ),
    playwrightAuth,
    warnings: [
      ...warnings,
      ...(existingProfile?.warnings ?? []).filter((warning) =>
        warning.startsWith("override:")
      ),
    ],
  };
}

async function collectMockStoreResources(
  projectRoot: string,
  statePackages: Record<string, TaroPackageProfile>
): Promise<TaroState["mockStore"]> {
  const fixtureRoots = Object.values(statePackages)
    .flatMap((profile) => profile.fixtureRoots)
    .filter((root) => root.kind === "mock-store");

  const rootDir =
    fixtureRoots.find((root) => root.source === "directory")?.path ??
    fixtureRoots[0]?.path ??
    null;
  const importHint =
    fixtureRoots.find((root) => root.source === "import")?.path ?? rootDir;

  if (!rootDir) {
    return { rootDir: null, importHint: null, resources: [] };
  }

  const diskRoot = join(projectRoot, rootDir);
  try {
    const info = await stat(diskRoot);
    if (!info.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    return { rootDir, importHint, resources: [] };
  }

  const files: string[] = [];

  function hasReachedMockStoreEvidenceLimit(): boolean {
    return files.length >= MAX_EVIDENCE;
  }

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (hasReachedMockStoreEvidenceLimit()) {
        return;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(diskRoot);
  const resources: TaroMockStoreResource[] = [];

  for (const filePath of files) {
    let content = "";
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const exports = new Set<string>();
    for (const match of content.matchAll(
      /export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g
    )) {
      exports.add(match[1]!);
    }
    for (const match of content.matchAll(/export\s*{([^}]+)}/g)) {
      for (const item of match[1]!.split(",")) {
        const [exported] = item.trim().split(/\s+as\s+/);
        if (exported) {
          exports.add(exported.trim());
        }
      }
    }

    resources.push({
      name: basename(filePath),
      file: relative(projectRoot, filePath).replace(/\\/g, "/"),
      exports: [...exports].sort(),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    rootDir,
    importHint,
    resources: resources.sort((left, right) =>
      left.file.localeCompare(right.file)
    ),
  };
}

function emptyState(now: string): TaroState {
  return {
    version: STATE_VERSION,
    meta: { createdAt: now, updatedAt: now, taroVersion: TARO_VERSION },
    packages: {},
    mockStore: { rootDir: null, importHint: null, resources: [] },
    generatedTests: [],
  };
}

function deriveLegacyPackageProfile(
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

function migrateLegacyHistory(
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTaroStateWithDiagnostics(
  projectRoot: string
): Promise<ReadStateDiagnostics> {
  const statePath = await findReadableProjectStatePath(
    projectRoot,
    "state.json"
  );
  if (!statePath) {
    return { state: null, warnings: [] };
  }

  const parsed = await readJsonFile<unknown>(statePath);
  if (parsed === null) {
    return {
      state: null,
      warnings: [
        "Failed to parse .taro/state.json. Taro will ignore it and rebuild state.",
      ],
    };
  }

  const result = taroStateSchema.safeParse(parsed);
  if (!result.success) {
    return {
      state: null,
      warnings: [
        "Invalid .taro/state.json shape detected. Taro will ignore it and rebuild state.",
      ],
    };
  }

  return { state: result.data, warnings: [] };
}

async function readTaroOverridesWithDiagnostics(
  projectRoot: string
): Promise<ReadOverridesDiagnostics> {
  const overridesPath = await findReadableProjectStatePath(
    projectRoot,
    "overrides.json"
  );
  if (!overridesPath) {
    return { overrides: {}, warnings: [] };
  }

  const parsed = await readJsonFile<unknown>(overridesPath);
  if (parsed === null) {
    return {
      overrides: {},
      warnings: [
        "Failed to parse .taro/overrides.json. Taro will ignore overrides for this run.",
      ],
    };
  }

  const result = taroOverridesSchema.safeParse(parsed);
  if (!result.success) {
    return {
      overrides: {},
      warnings: [
        "Invalid .taro/overrides.json shape detected. Taro will ignore overrides for this run.",
      ],
    };
  }

  return { overrides: result.data, warnings: [] };
}

export async function readTaroState(
  projectRoot: string
): Promise<TaroState | null> {
  return (await readTaroStateWithDiagnostics(projectRoot)).state;
}

export async function readTaroOverrides(
  projectRoot: string
): Promise<TaroOverrides> {
  return (await readTaroOverridesWithDiagnostics(projectRoot)).overrides;
}

async function loadLegacyState(
  projectRoot: string
): Promise<{
  state: TaroState | null;
  migratedLegacyState: boolean;
  warnings: string[];
}> {
  const currentState = await readTaroStateWithDiagnostics(projectRoot);
  if (currentState.state) {
    return {
      state: currentState.state,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    };
  }

  const [legacyConventionsPath, legacyHistoryPath] = await Promise.all([
    findReadableProjectStatePath(projectRoot, "conventions.json"),
    findReadableProjectStatePath(projectRoot, "history.json"),
  ]);
  const [legacyConventions, legacyHistory] = await Promise.all([
    legacyConventionsPath
      ? readJsonFile<ConventionsSchema>(legacyConventionsPath)
      : null,
    legacyHistoryPath
      ? readJsonFile<
          Array<{
            timestamp?: string;
            recordingFile?: string;
            score?: number;
            grade?: string;
            dimensions?: ScoreResult["dimensions"];
          }>
        >(legacyHistoryPath)
      : null,
  ]);

  if (!legacyConventions && !legacyHistory) {
    return {
      state: null,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    };
  }

  const now = new Date().toISOString();
  const state = emptyState(now);
  state.meta.createdAt = now;
  state.meta.updatedAt = now;

  if (legacyConventions) {
    state.packages["."] = deriveLegacyPackageProfile(
      projectRoot,
      legacyConventions
    );
  }
  if (legacyHistory) {
    state.generatedTests = migrateLegacyHistory(projectRoot, legacyHistory);
  }

  return { state, migratedLegacyState: true, warnings: currentState.warnings };
}

export async function writeTaroState(
  projectRoot: string,
  state: TaroState
): Promise<void> {
  await ensureProjectStateDir(projectRoot);
  const statePath = getProjectStatePath(projectRoot, "state.json");
  const result = taroStateSchema.safeParse(state);
  if (!result.success) {
    throw new Error("Refusing to write invalid .taro/state.json payload.");
  }

  const serialized = JSON.stringify(result.data, null, 2);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, serialized, "utf-8");
  await rename(tempPath, statePath);
  await writeTaroSummary(projectRoot, result.data);
}

function summarizeRenderBoundaryPreference(
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

function summarizeCollaboratorKinds(profile: TaroPackageProfile): string {
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

function summarizeCanonicalBoundarySupport(
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

function summarizeBoundaryTeaching(profile: TaroPackageProfile): string {
  const patterns = profile.teaching?.dominantPatterns ?? [];
  if (patterns.length === 0) {
    return "none";
  }
  return patterns.map((pattern) => `\`${pattern}\``).join(", ");
}

function buildStateSummaryMarkdown(
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

async function writeTaroSummary(
  projectRoot: string,
  state: TaroState
): Promise<void> {
  const summaryPath = getProjectStatePath(projectRoot, "summary.md");
  const content = buildStateSummaryMarkdown(projectRoot, state);
  const tempPath = `${summaryPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf-8");
  await rename(tempPath, summaryPath);
}

async function scanProjectState(
  projectRoot: string,
  options: ScanStateOptions = {}
): Promise<ScanStateResult> {
  const detectedAt = options.detectedAt ?? "refresh";
  const loadedLegacy = options.existingState
    ? { state: options.existingState, migratedLegacyState: false, warnings: [] }
    : await loadLegacyState(projectRoot);
  const overridesDiagnostics =
    await readTaroOverridesWithDiagnostics(projectRoot);
  const now = new Date().toISOString();
  const generatedHistoryForLearning =
    options.preserveGeneratedTests === false
      ? []
      : (loadedLegacy.state?.generatedTests ?? []);
  const qualityIndex = buildGeneratedTestQualityIndex(
    projectRoot,
    generatedHistoryForLearning
  );
  const testFiles = await readTestFiles(projectRoot);
  const packageDescriptors = await findPackageDescriptors(projectRoot);
  const packagesByKey = new Map<string, TestFileContent[]>();

  for (const file of testFiles) {
    const descriptor = findNearestPackageDescriptor(
      packageDescriptors,
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
        const descriptor = packageDescriptors.find(
          (candidate) => candidate.key === packageKey
        )!;
        return buildPackageProfile(
          projectRoot,
          descriptor,
          files,
          loadedLegacy.state,
          qualityIndex,
          detectedAt
        );
      })
  );

  const packages =
    packageProfiles.length > 0
      ? Object.fromEntries(
          packageProfiles.map((profile) => [profile.packagePath, profile])
        )
      : (loadedLegacy.state?.packages ?? {});
  const existingState = loadedLegacy.state;
  const generatedTests =
    options.preserveGeneratedTests === false
      ? []
      : trimGeneratedTestHistory(
          projectRoot,
          existingState?.generatedTests ?? []
        );
  const state: TaroState = {
    version: STATE_VERSION,
    meta: {
      createdAt: existingState?.meta.createdAt ?? now,
      updatedAt: now,
      taroVersion: TARO_VERSION,
    },
    packages,
    mockStore: await collectMockStoreResources(projectRoot, packages),
    generatedTests,
  };
  const summaryPackages: TaroStateSummaryPackage[] = Object.values(packages)
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

  return {
    state,
    summary: {
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
      migratedLegacyState: loadedLegacy.migratedLegacyState,
      overridePackageCount: Object.keys(
        overridesDiagnostics.overrides.packages ?? {}
      ).length,
      packages: summaryPackages,
      warnings: [
        ...(summaryPackages.length === 0
          ? ["No test files were detected; state contains defaults only."]
          : []),
        ...loadedLegacy.warnings,
        ...overridesDiagnostics.warnings,
      ],
    },
  };
}

export async function initTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  const result = await scanProjectState(projectRoot, { detectedAt: "init" });
  await writeTaroState(projectRoot, result.state);
  return result;
}

export async function refreshTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  const result = await scanProjectState(projectRoot, { detectedAt: "refresh" });
  await writeTaroState(projectRoot, result.state);
  return result;
}

export async function loadOrBootstrapTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  const existingStateDiagnostics =
    await readTaroStateWithDiagnostics(projectRoot);
  const overridesDiagnostics =
    await readTaroOverridesWithDiagnostics(projectRoot);
  const existingState = existingStateDiagnostics.state;
  if (existingState) {
    if (shouldRefreshStateFromGeneratedHistory(existingState)) {
      const rescanned = await scanProjectState(projectRoot, {
        existingState,
        detectedAt: "refresh",
      });
      await writeTaroState(projectRoot, rescanned.state);
      return rescanned;
    }

    const qualityIndex = buildGeneratedTestQualityIndex(
      projectRoot,
      existingState.generatedTests
    );
    const summaryPackages: TaroStateSummaryPackage[] = Object.values(
      existingState.packages
    ).map((profile) => ({
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
    }));
    return {
      state: existingState,
      summary: {
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
        migratedLegacyState: false,
        overridePackageCount: Object.keys(
          overridesDiagnostics.overrides.packages ?? {}
        ).length,
        packages: summaryPackages,
        warnings: [
          ...existingStateDiagnostics.warnings,
          ...overridesDiagnostics.warnings,
        ],
      },
    };
  }

  const loadedLegacy = await loadLegacyState(projectRoot);
  if (loadedLegacy.state) {
    const result = await scanProjectState(projectRoot, {
      existingState: loadedLegacy.state,
      detectedAt: "refresh",
    });
    await writeTaroState(projectRoot, result.state);
    return result;
  }

  const result = await scanProjectState(projectRoot, { detectedAt: "init" });
  await writeTaroState(projectRoot, result.state);
  return result;
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

function findBestPackageProfile(
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

async function getLatestPackageEvidence(
  projectRoot: string,
  profile: TaroPackageProfile
): Promise<{ latestMtimeMs: number; latestPath: string | null }> {
  const candidates = new Set<string>();
  const packageRoot =
    profile.packagePath === "."
      ? projectRoot
      : join(projectRoot, profile.packagePath);

  candidates.add(join(packageRoot, "package.json"));
  for (const file of profile.conventions.testFiles) {
    candidates.add(join(projectRoot, file.path));
  }

  for (const candidate of await collectJestDomEvidenceFiles(
    projectRoot,
    packageRoot
  )) {
    candidates.add(candidate);
  }

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        if (
          PLAYWRIGHT_CONFIG_FILES.includes(
            entry as (typeof PLAYWRIGHT_CONFIG_FILES)[number]
          )
        ) {
          candidates.add(join(root, entry));
        }
      }
    } catch {
      // Best-effort only.
    }
  }

  if (profile.playwrightAuth?.path) {
    candidates.add(resolve(projectRoot, profile.playwrightAuth.path));
  }

  let latestMtimeMs = 0;
  let latestPath: string | null = null;

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.mtimeMs > latestMtimeMs) {
        latestMtimeMs = info.mtimeMs;
        latestPath = relative(projectRoot, candidate).replace(/\\/g, "/");
      }
    } catch {
      // Ignore unreadable probe paths.
    }
  }

  return { latestMtimeMs, latestPath };
}

export const __stateTestUtils = {
  buildGeneratedTestQualityIndex,
  calculateGeneratedTestQualityWeight,
  collectMockStoreResources,
  collectFixtureDirs,
  collectProviderWrappers,
  collectRenderHelpers,
  collectSharedMockFactories,
  deriveInteractionContracts,
  detectMockInstabilityInFiles,
  findPackageDescriptors,
  getLatestPackageEvidence,
  hasReachedMockStoreEvidenceLimit: (fileCount: number) =>
    fileCount >= MAX_EVIDENCE,
  hasConfigFile,
  inferFileExtension,
  scanProjectState,
  shouldRefreshStateFromGeneratedHistory,
  summarizePackageScoreLearning,
  trimGeneratedTestHistory,
};

export async function detectPackageProfileStaleness(
  projectRoot: string,
  profile: TaroPackageProfile
): Promise<TaroPackageProfileStaleness> {
  if (profile.jestDomSetup.evidence.length === 0) {
    return {
      stale: true,
      reason:
        "Package profile predates jest-dom setup detection and should be refreshed.",
      latestEvidencePath: null,
    };
  }

  const scannedAtMs = Date.parse(profile.scannedAt);
  if (!Number.isFinite(scannedAtMs)) {
    return {
      stale: true,
      reason: "Package profile scan timestamp is invalid.",
      latestEvidencePath: null,
    };
  }

  const latestEvidence = await __stateTestUtils.getLatestPackageEvidence(
    projectRoot,
    profile
  );
  if (latestEvidence.latestMtimeMs === 0) {
    return { stale: false, reason: null, latestEvidencePath: null };
  }

  if (latestEvidence.latestMtimeMs > scannedAtMs + 1000) {
    return {
      stale: true,
      reason: latestEvidence.latestPath
        ? `${latestEvidence.latestPath} changed after the package profile was scanned.`
        : "Package evidence changed after the package profile was scanned.",
      latestEvidencePath: latestEvidence.latestPath,
    };
  }

  return {
    stale: false,
    reason: null,
    latestEvidencePath: latestEvidence.latestPath,
  };
}

export function resolveTaroPackageProfile(
  state: TaroState,
  projectRoot: string,
  targetPath: string,
  overrides: TaroOverrides = {}
): ResolvedTaroPackageProfile | null {
  const normalizedTarget = relative(projectRoot, resolve(targetPath)).replace(
    /\\/g,
    "/"
  );
  const profile = findBestPackageProfile(state, normalizedTarget);
  if (!profile) {
    return null;
  }

  const packageOverrides: TaroPackageOverrides | undefined =
    overrides.packages?.[profile.packagePath];
  const appliedOverrides: string[] = [];
  let effectiveRenderHelper = profile.renderHelpers[0] ?? null;
  const preferredBoundaryImplementations = {
    ...(packageOverrides?.preferredSharedMocks ?? {}),
    ...(packageOverrides?.preferredBoundaryImplementations ?? {}),
  };
  const forbidBoundaryTargets = [
    ...new Set([
      ...(packageOverrides?.forbidMocks ?? []),
      ...(packageOverrides?.forbidBoundaryTargets ?? []),
    ]),
  ];
  const boundaryPolicies = { ...(packageOverrides?.boundaryPolicies ?? {}) };
  const enabledContractFamilies = packageOverrides?.enabledContractFamilies
    ?.length
    ? [...packageOverrides.enabledContractFamilies]
    : (["mutation-form"] as InteractionContractKind[]);

  if (packageOverrides?.runner) {
    appliedOverrides.push(`runner:${packageOverrides.runner}`);
  }
  if (packageOverrides?.renderHelper) {
    appliedOverrides.push(`renderHelper:${packageOverrides.renderHelper.name}`);
    effectiveRenderHelper = {
      name: packageOverrides.renderHelper.name,
      importPath: packageOverrides.renderHelper.importPath,
      importKind: "named",
      sourceTestFile: ".taro/overrides.json",
      usageCount: 0,
      usesWithin: false,
    };
  }
  if (packageOverrides?.forbidMocks?.length) {
    appliedOverrides.push("forbidMocks");
  }
  if (
    packageOverrides?.preferredSharedMocks &&
    Object.keys(packageOverrides.preferredSharedMocks).length > 0
  ) {
    appliedOverrides.push("preferredSharedMocks");
  }
  if (
    packageOverrides?.preferredBoundaryImplementations &&
    Object.keys(packageOverrides.preferredBoundaryImplementations).length > 0
  ) {
    appliedOverrides.push("preferredBoundaryImplementations");
  }
  if (
    packageOverrides?.boundaryPolicies &&
    Object.keys(packageOverrides.boundaryPolicies).length > 0
  ) {
    appliedOverrides.push("boundaryPolicies");
  }
  if (packageOverrides?.forbidBoundaryTargets?.length) {
    appliedOverrides.push("forbidBoundaryTargets");
  }
  if (packageOverrides?.queryHookPolicy) {
    appliedOverrides.push(
      `queryHookPolicy:${packageOverrides.queryHookPolicy}`
    );
  }
  if (packageOverrides?.companionPolicy) {
    appliedOverrides.push(
      `companionPolicy:${packageOverrides.companionPolicy}`
    );
  }
  if (packageOverrides?.enabledContractFamilies?.length) {
    appliedOverrides.push("enabledContractFamilies");
  }

  const boundaryProfilesByTarget = new Map(
    profile.boundaryProfiles.map((boundaryProfile) => [
      boundaryProfile.target,
      boundaryProfile,
    ])
  );

  for (const [target, supportImportPath] of Object.entries(
    preferredBoundaryImplementations
  )) {
    if (!boundaryProfilesByTarget.has(target)) {
      boundaryProfilesByTarget.set(target, {
        target,
        kind: classifyBoundaryKind(target),
        strategy: "shared-module-factory",
        guardrailReason: getBoundaryGuardrailReason(target),
        supportImportPath,
        supportPath: null,
        supportExports: {
          factoryExport: null,
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: /mock-store/i.test(supportImportPath)
          ? "mock-store"
          : /fixture/i.test(supportImportPath)
            ? "fixtures"
            : /mock/i.test(supportImportPath)
              ? "typed-defaults"
              : "manual",
        confidence: "high",
        files: [],
        evidence: [`Override: ${target} -> ${supportImportPath}`],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      });
    }
  }

  const resolvedBoundaryProfiles = [...boundaryProfilesByTarget.values()]
    .map((boundaryProfile) => {
      const effectiveGuardrailReason: TaroBoundaryGuardrailReason | null =
        boundaryProfile.guardrailReason ??
        getBoundaryGuardrailReason(boundaryProfile.target);
      const forceKeepReal =
        effectiveGuardrailReason === "repo-owned-ui-wrapper";
      const forcedSupportImportPath = forceKeepReal
        ? null
        : (preferredBoundaryImplementations[boundaryProfile.target] ??
          boundaryProfile.supportImportPath);
      const forcedStrategy =
        forceKeepReal || forbidBoundaryTargets.includes(boundaryProfile.target)
          ? "forbid"
          : (boundaryPolicies[boundaryProfile.target] ??
            (preferredBoundaryImplementations[boundaryProfile.target]
              ? "shared-module-factory"
              : boundaryProfile.strategy));

      return {
        ...boundaryProfile,
        guardrailReason: effectiveGuardrailReason,
        strategy: forcedStrategy,
        pattern:
          forcedStrategy === "forbid" &&
          effectiveGuardrailReason === "repo-owned-ui-wrapper"
            ? "keep-real"
            : boundaryProfile.pattern,
        supportImportPath: forcedSupportImportPath,
        supportExports:
          forcedStrategy === "forbid"
            ? {
                factoryExport: null,
                resetExport: null,
                overrideExports: [],
                spyExports: [],
                fixtureExports: [],
              }
            : boundaryProfile.supportExports,
      };
    })
    .sort((left, right) => left.target.localeCompare(right.target));

  return {
    ...profile,
    boundaryProfiles: resolvedBoundaryProfiles,
    appliedOverrides,
    effectiveRunner: packageOverrides?.runner ?? profile.runner.value,
    effectiveRenderHelper,
    forbidMocks: packageOverrides?.forbidMocks ?? [],
    preferredSharedMocks: packageOverrides?.preferredSharedMocks ?? {},
    boundaryPolicies,
    preferredBoundaryImplementations,
    forbidBoundaryTargets,
    effectiveQueryHookPolicy: packageOverrides?.queryHookPolicy ?? "avoid",
    effectiveCompanionPolicy: packageOverrides?.companionPolicy ?? "heuristic",
    enabledContractFamilies,
  };
}

export async function persistPlaywrightAuthProfile(
  projectRoot: string,
  packagePath: string,
  playwrightAuth: TaroPlaywrightAuthProfile | null
): Promise<boolean> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot);
  const profile = bootstrap.state.packages[packagePath];

  if (!profile) {
    return false;
  }

  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: new Date().toISOString(),
      taroVersion: TARO_VERSION,
    },
    packages: {
      ...bootstrap.state.packages,
      [packagePath]: { ...profile, playwrightAuth },
    },
  };

  await writeTaroState(projectRoot, nextState);
  return true;
}

export async function appendGeneratedTestRecord(
  projectRoot: string,
  record: {
    packagePath: string;
    recordingFile?: string | null;
    testFile: string;
    scoreResult: ScoreResult;
  }
): Promise<void> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot);
  const createdAt = new Date().toISOString();
  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: createdAt,
      taroVersion: TARO_VERSION,
    },
    generatedTests: trimGeneratedTestHistory(projectRoot, [
      ...bootstrap.state.generatedTests,
      {
        createdAt,
        packagePath: record.packagePath,
        recordingFile: record.recordingFile ?? null,
        testFile: record.testFile,
        quality: {
          overall: record.scoreResult.total,
          grade: record.scoreResult.grade,
          dimensions: record.scoreResult.dimensions,
          signals: record.scoreResult.signals,
          reasons: record.scoreResult.reasons,
        },
        requiresReview: record.scoreResult.requiresReview,
      },
    ]),
  };

  await writeTaroState(projectRoot, nextState);
  await refreshTaroState(projectRoot);
}

export function formatStateSummary(
  summary: TaroStateSummary,
  action: "init" | "refresh"
): string[] {
  const lines = [
    `${pc.dim("[taro]")} ${action === "init" ? "Initialized" : "Refreshed"} project state`,
    `${pc.dim("[taro]")} packages=${summary.packageCount}, renderHelpers=${summary.renderHelperCount}, repeatedMockTargets=${summary.repeatedMockTargetCount}, boundaryProfiles=${summary.boundaryProfileCount}, lowConfidenceBoundaries=${summary.lowConfidenceBoundaryCount}, fixtureRoots=${summary.fixtureRootCount}`,
  ];

  if (summary.migratedLegacyState) {
    lines.push(
      `${pc.dim("[taro]")} consolidated compatibility .taro convention history into state.json`
    );
  }
  if (summary.overridePackageCount > 0) {
    lines.push(
      `${pc.dim("[taro]")} overrides applied from .taro/overrides.json for ${summary.overridePackageCount} package(s)`
    );
  }

  for (const pkg of summary.packages) {
    lines.push(
      `${pc.dim("[taro]")} ${pkg.packagePath}: runner=${pkg.runner}, scannedAt=${pkg.scannedAt}, renderHelpers=${pkg.renderHelperCount}, repeatedMocks=${pkg.repeatedMockTargetCount}, boundaryProfiles=${pkg.boundaryProfileCount}, lowConfidenceBoundaries=${pkg.lowConfidenceBoundaryCount}, fixtureRoots=${pkg.fixtureRootCount}, scoredTests=${pkg.scoredTestFileCount}, unscoredTests=${pkg.unscoredTestFileCount}`
    );
  }
  for (const warning of summary.warnings) {
    lines.push(`${pc.yellow("[taro]")} ${warning}`);
  }

  return lines;
}
