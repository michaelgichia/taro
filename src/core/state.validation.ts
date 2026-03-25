import { z } from "zod";

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

export const taroStateSchema = z.object({
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

export const taroOverridesSchema = z.object({
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

export function safeParseTaroState(value: unknown) {
  return taroStateSchema.safeParse(value);
}

export function safeParseTaroOverrides(value: unknown) {
  return taroOverridesSchema.safeParse(value);
}
