import type {
  ConventionsSchema,
  ImportStyle,
  MockInstabilityWarning,
  MockPattern,
  MockRecommendation,
  MockTargetUsage,
  MutationLifecyclePattern,
} from './conventions.js'
import type {
  ScoreDimensions,
  ScoreReason,
  ScoreSignals,
} from './score.js'

export type TaroStateConfidence = 'low' | 'medium' | 'high'
export type TaroTestRunner = 'vitest' | 'jest' | 'unknown'
export type TaroFolderPattern = 'colocated' | '__tests__' | 'mixed' | 'unknown'
export type TaroFileExtension = 'ts' | 'tsx' | 'js' | 'jsx' | 'mixed'
export type TaroFixtureRootKind = 'mock-store' | 'mocks' | 'fixtures' | 'factories'

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

export interface TaroFixtureRootProfile {
  path: string
  kind: TaroFixtureRootKind
  source: 'directory' | 'import'
}

export interface TaroExemplarProfile {
  file: string
  tags: string[]
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
  inlineSafeMockTargets: string[]
  mutationLifecycles: MutationLifecyclePattern[]
  instabilityWarnings: MockInstabilityWarning[]
  mockRecommendations: MockRecommendation[]
  fixtureRoots: TaroFixtureRootProfile[]
  exemplars: TaroExemplarProfile[]
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
}

export interface TaroStateSummaryPackage {
  packagePath: string
  runner: TaroTestRunner
  scannedAt: string
  renderHelperCount: number
  repeatedMockTargetCount: number
  fixtureRootCount: number
  warnings: string[]
}

export interface TaroStateSummary {
  packageCount: number
  renderHelperCount: number
  repeatedMockTargetCount: number
  fixtureRootCount: number
  migratedLegacyState: boolean
  overridePackageCount: number
  packages: TaroStateSummaryPackage[]
  warnings: string[]
}
