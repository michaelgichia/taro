import type {
  ConventionsSchema,
  InteractionContractKind,
  InteractionContractPattern,
  ImportStyle,
  MockInstabilityWarning,
  MockPattern,
  MockRecommendation,
  MockTargetUsage,
  MutationLifecyclePattern,
} from '#types/conventions.ts'
import type {
  ScoreDimensions,
  ScoreReason,
  ScoreSignals,
} from '#types/score.ts'

export type TaroStateConfidence = 'low' | 'medium' | 'high'
export type TaroTestRunner = 'vitest' | 'jest' | 'unknown'
export type TaroFolderPattern = 'colocated' | '__tests__' | 'mixed' | 'unknown'
export type TaroFileExtension = 'ts' | 'tsx' | 'js' | 'jsx' | 'mixed'
export type TaroFixtureRootKind = 'mock-store' | 'mocks' | 'fixtures' | 'factories'
export type TaroPlaywrightAuthStrategy = 'storageState' | 'instructions'
export type TaroPlaywrightAuthSource = 'detected' | 'manual'
export type TaroPlaywrightAuthDetectedAt = 'init' | 'refresh' | 'generate'
export type TaroBoundaryKind =
  | 'data-module'
  | 'server-action'
  | 'network-client'
  | 'auth'
  | 'router'
  | 'feature-flag'
  | 'env'
  | 'local-child'
  | 'unknown'
export type TaroBoundaryStrategy =
  | 'shared-module-factory'
  | 'scaffolded-module-factory'
  | 'provider-wrapper'
  | 'inline-safe'
  | 'forbid'
  | 'real-runtime'
export type TaroBoundaryPayloadSource =
  | 'mock-store'
  | 'fixtures'
  | 'typed-defaults'
  | 'exemplar-only'
  | 'manual'
  | 'unknown'
export type TaroBoundaryGuardrailReason = 'repo-owned-ui-wrapper' | 'ui-package'
export type TaroQueryHookPolicy = 'avoid' | 'allow-centralized' | 'allow-when-needed'
export type TaroCompanionPolicy = 'heuristic' | 'off'

export interface TaroSignal<T> {
  value: T
  confidence: TaroStateConfidence
  evidence: string[]
}

export interface RepoRenderTargetCandidate {
  symbol: string
  importPath: string
  sourceTestFile: string
  helperNames: string[]
  usesWithin: boolean
  evidenceTerms?: string[]
}

export interface TaroRenderHelperProfile {
  name: string
  importPath: string
  importKind: 'named' | 'default'
  sourceTestFile: string
  usageCount: number
  usesWithin: boolean
}

export interface TaroProviderWrapperProfile {
  name: string
  importPath: string
  sourceTestFile: string
}

export interface TaroSharedMockFactoryProfile {
  target: string
  importPath: string
  files: string[]
  count: number
}

export interface TaroBoundarySupportExports {
  factoryExport: string | null
  resetExport: string | null
  overrideExports: string[]
  spyExports: string[]
  fixtureExports: string[]
}

export interface TaroBoundaryProfile {
  target: string
  kind: TaroBoundaryKind
  strategy: TaroBoundaryStrategy
  guardrailReason: TaroBoundaryGuardrailReason | null
  supportImportPath: string | null
  supportPath: string | null
  supportExports: TaroBoundarySupportExports
  payloadSource: TaroBoundaryPayloadSource
  confidence: TaroStateConfidence
  files: string[]
  evidence: string[]
  conflictTargets: string[]
  lowConfidenceScaffold: boolean
}

export interface TaroFixtureRootProfile {
  path: string
  kind: TaroFixtureRootKind
  source: 'directory' | 'import'
}

export interface TaroExemplarProfile {
  file: string
  tags: string[]
}

export interface TaroBoundaryExemplarProfile {
  file: string
  renderBoundary: 'module' | 'component' | 'unknown'
  boundaryTargets: string[]
  boundaryKinds: TaroBoundaryKind[]
  usesProviderWrapper: boolean
  usesCentralBoundarySupport: boolean
  hasMutationLifecycle: boolean
  overrideStyle: 'stable-handles' | 'inline-reconfigure' | 'none'
  tags: string[]
}

export interface TaroInteractionContractProfile extends InteractionContractPattern {
  supportTargets: string[]
  overrideStyle: 'stable-handles' | 'inline-reconfigure' | 'none'
  confidence: TaroStateConfidence
}

export interface TaroPlaywrightAuthProfile {
  strategy: TaroPlaywrightAuthStrategy
  path: string
  detectedAt: TaroPlaywrightAuthDetectedAt
  source: TaroPlaywrightAuthSource
}

export interface TaroPackageProfile {
  packagePath: string
  packageName: string | null
  scannedAt: string
  testFileCount: number
  conventions: ConventionsSchema
  importStyle: TaroSignal<ImportStyle>
  runner: TaroSignal<TaroTestRunner>
  mockPattern: TaroSignal<MockPattern>
  folderPattern: TaroSignal<TaroFolderPattern>
  fileExtension: TaroSignal<TaroFileExtension>
  renderHelpers: TaroRenderHelperProfile[]
  providerWrappers: TaroProviderWrapperProfile[]
  renderTargets: RepoRenderTargetCandidate[]
  repeatedMockTargets: MockTargetUsage[]
  sharedMockFactories: TaroSharedMockFactoryProfile[]
  boundaryProfiles: TaroBoundaryProfile[]
  boundaryExemplars: TaroBoundaryExemplarProfile[]
  interactionContracts: TaroInteractionContractProfile[]
  inlineSafeMockTargets: string[]
  mutationLifecycles: MutationLifecyclePattern[]
  instabilityWarnings: MockInstabilityWarning[]
  mockRecommendations: MockRecommendation[]
  fixtureRoots: TaroFixtureRootProfile[]
  exemplars: TaroExemplarProfile[]
  playwrightAuth: TaroPlaywrightAuthProfile | null
  warnings: string[]
}

export interface TaroMockStoreResource {
  name: string
  file: string
  exports: string[]
  updatedAt: string
}

export interface TaroGeneratedTestRecord {
  createdAt: string
  packagePath: string
  recordingFile: string
  testFile: string
  quality: {
    overall: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
    dimensions: ScoreDimensions
    signals: ScoreSignals
    reasons: ScoreReason[]
  }
  requiresReview: boolean
}

export interface TaroState {
  version: 1
  meta: {
    createdAt: string
    updatedAt: string
    taroVersion: string
  }
  packages: Record<string, TaroPackageProfile>
  mockStore: {
    rootDir: string | null
    importHint: string | null
    resources: TaroMockStoreResource[]
  }
  generatedTests: TaroGeneratedTestRecord[]
}

export interface TaroPackageOverrides {
  runner?: Exclude<TaroTestRunner, 'unknown'>
  renderHelper?: {
    name: string
    importPath: string
  }
  forbidMocks?: string[]
  preferredSharedMocks?: Record<string, string>
  boundaryPolicies?: Record<string, TaroBoundaryStrategy>
  preferredBoundaryImplementations?: Record<string, string>
  forbidBoundaryTargets?: string[]
  queryHookPolicy?: TaroQueryHookPolicy
  companionPolicy?: TaroCompanionPolicy
  enabledContractFamilies?: InteractionContractKind[]
}

export interface TaroOverrides {
  packages?: Record<string, TaroPackageOverrides>
}

export interface ResolvedTaroPackageProfile extends TaroPackageProfile {
  appliedOverrides: string[]
  effectiveRunner: TaroTestRunner
  effectiveRenderHelper: TaroRenderHelperProfile | null
  forbidMocks: string[]
  preferredSharedMocks: Record<string, string>
  boundaryPolicies: Record<string, TaroBoundaryStrategy>
  preferredBoundaryImplementations: Record<string, string>
  forbidBoundaryTargets: string[]
  effectiveQueryHookPolicy: TaroQueryHookPolicy
  effectiveCompanionPolicy: TaroCompanionPolicy
  enabledContractFamilies: InteractionContractKind[]
}

export interface TaroStateSummaryPackage {
  packagePath: string
  runner: TaroTestRunner
  scannedAt: string
  renderHelperCount: number
  repeatedMockTargetCount: number
  boundaryProfileCount: number
  lowConfidenceBoundaryCount: number
  fixtureRootCount: number
  warnings: string[]
}

export interface TaroStateSummary {
  packageCount: number
  renderHelperCount: number
  repeatedMockTargetCount: number
  boundaryProfileCount: number
  lowConfidenceBoundaryCount: number
  fixtureRootCount: number
  migratedLegacyState: boolean
  overridePackageCount: number
  packages: TaroStateSummaryPackage[]
  warnings: string[]
}
