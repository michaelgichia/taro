import { access, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import pc from 'picocolors'
import { z } from 'zod'
import {
  analyzeTestFile,
  deriveConventions,
  extractRenderTargetCandidatesFromFile,
  findTestFiles,
  readTestFiles,
} from './convention-intelligence.js'
import {
  findReadableProjectStatePath,
  getProjectStatePath,
  ensureProjectStateDir,
} from '../project-state.js'
import { DEFAULT_CONVENTIONS } from '../types/conventions.js'
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
} from '../types/conventions.js'
import type { ScoreResult } from '../types/score.js'
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroExemplarProfile,
  TaroFileExtension,
  TaroFixtureRootKind,
  TaroFixtureRootProfile,
  TaroGeneratedTestRecord,
  TaroMockStoreResource,
  TaroOverrides,
  TaroPackageOverrides,
  TaroPackageProfile,
  TaroProviderWrapperProfile,
  TaroRenderHelperProfile,
  TaroSharedMockFactoryProfile,
  TaroSignal,
  TaroState,
  TaroStateConfidence,
  TaroStateSummary,
  TaroStateSummaryPackage,
  TaroTestRunner,
} from '../types/state.js'
import { TARO_VERSION } from '../version.js'

const STATE_VERSION = 1
const GENERATED_TEST_HISTORY_LIMIT = 200
const MAX_EVIDENCE = 50
const MAX_EXEMPLARS = 5
const MAX_FIXTURE_ROOTS = 25
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.taro',
  '.tayo',
  'coverage',
  '.next',
  '.nuxt',
])
const FIXTURE_DIR_NAMES = ['mock-store', 'mocks', 'fixtures', 'factories'] as const
const MOCK_TARGET_REGEX = /(?:vi|jest)\.mock\(\s*['"`]([^'"`]+)['"`]/g
const MUTATION_TRIGGER_REGEX =
  /\b(mutate|mutation|submit|save|create|update|delete)\b|mock(?:Resolved|Rejected)Value(?:Once)?\(/i
const TEST_BLOCK_REGEX = /\b(?:it|test)\s*\(/g
const TEST_SCOPED_MOCK_REGEX = /(?:vi|jest)\.mock\(/i
const MOCK_RESET_REGEX = /(?:vi|jest)\.(?:clearAllMocks|resetAllMocks|restoreAllMocks)\(/g
const MOCK_CONFIGURATION_REGEX =
  /\.mock(?:ResolvedValue|RejectedValue|Implementation|ReturnValue)(?:Once)?\(/g
const STAGE_PATTERNS: Record<MutationLifecycleStage, RegExp[]> = {
  loading: [/\bisLoading\b/i, /\bloading\b/i, /\bpending\b/i, /\bsubmitting\b/i, /toBeDisabled\(/],
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
}

const confidenceSchema = z.enum(['low', 'medium', 'high'])
const importStyleSchema = z.enum(['esm', 'cjs'])
const testRunnerSchema = z.enum(['vitest', 'jest', 'unknown'])
const mockPatternSchema = z.enum(['vi.mock', 'jest.mock', 'none'])
const folderPatternSchema = z.enum(['colocated', '__tests__', 'mixed', 'unknown'])
const fileExtensionSchema = z.enum(['ts', 'tsx', 'js', 'jsx', 'mixed'])
const fixtureRootKindSchema = z.enum(['mock-store', 'mocks', 'fixtures', 'factories'])
const conventionFileSchema = z.object({
  path: z.string(),
  importStyle: importStyleSchema,
  hasDescribeBlock: z.boolean(),
  mockPattern: mockPatternSchema,
  hasHelperWithExpect: z.boolean(),
})
const conventionsSchema = z.object({
  scannedAt: z.string(),
  projectRoot: z.string(),
  importStyle: importStyleSchema,
  mockPattern: mockPatternSchema,
  testFiles: z.array(conventionFileSchema),
  folderPattern: folderPatternSchema,
  fileExtension: fileExtensionSchema,
})
const taroSignalSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: confidenceSchema,
    evidence: z.array(z.string()),
  })
const renderTargetCandidateSchema = z.object({
  symbol: z.string(),
  importPath: z.string(),
  sourceTestFile: z.string(),
  helperNames: z.array(z.string()),
  usesWithin: z.boolean(),
})
const renderHelperProfileSchema = z.object({
  name: z.string(),
  importPath: z.string(),
  importKind: z.enum(['named', 'default']),
  sourceTestFile: z.string(),
  usageCount: z.number(),
  usesWithin: z.boolean(),
})
const providerWrapperProfileSchema = z.object({
  name: z.string(),
  importPath: z.string(),
  sourceTestFile: z.string(),
})
const sharedMockFactoryProfileSchema = z.object({
  target: z.string(),
  importPath: z.string(),
  files: z.array(z.string()),
  count: z.number(),
})
const fixtureRootProfileSchema = z.object({
  path: z.string(),
  kind: fixtureRootKindSchema,
  source: z.enum(['directory', 'import']),
})
const exemplarProfileSchema = z.object({
  file: z.string(),
  tags: z.array(z.string()),
})
const mockTargetUsageSchema = z.object({
  target: z.string(),
  files: z.array(z.string()),
  count: z.number(),
})
const mutationLifecyclePatternSchema = z.object({
  file: z.string(),
  stages: z.array(z.enum(['loading', 'success', 'error'])),
  evidence: z.array(z.string()),
})
const mockInstabilityWarningSchema = z.object({
  file: z.string(),
  kind: z.enum(['recreated-factory', 'per-test-churn']),
  reason: z.string(),
  evidence: z.array(z.string()),
})
const mockRecommendationSchema = z.object({
  target: z.string(),
  kind: z.enum(['inline', 'extract']),
  reason: z.string(),
  files: z.array(z.string()),
  count: z.number(),
})
const scoreDimensionsSchema = z.object({
  queryQuality: z.number(),
  assertionSpecificity: z.number(),
  testStructure: z.number(),
  boundaryIsolation: z.number(),
})
const scoreSignalsSchema = z.object({
  queryCheckpointCount: z.number(),
  roleQueryCount: z.number(),
  testIdQueryCount: z.number(),
  strongAssertionCount: z.number(),
  weakAssertionCount: z.number(),
  boundaryWarningCount: z.number(),
  boundaryIssueCount: z.number(),
  placeholderRenderTarget: z.boolean(),
  multipleTestBlocks: z.boolean(),
})
const scoreReasonSchema = z.object({
  code: z.string(),
  dimension: z.enum([
    'queryQuality',
    'assertionSpecificity',
    'testStructure',
    'boundaryIsolation',
  ]),
  impact: z.enum(['positive', 'negative']),
  weight: z.number(),
  message: z.string(),
})
const packageProfileSchema = z.object({
  packagePath: z.string(),
  packageName: z.string().nullable(),
  scannedAt: z.string().optional().default(''),
  testFileCount: z.number(),
  conventions: conventionsSchema,
  importStyle: taroSignalSchema(importStyleSchema),
  runner: taroSignalSchema(testRunnerSchema),
  mockPattern: taroSignalSchema(mockPatternSchema),
  folderPattern: taroSignalSchema(folderPatternSchema),
  fileExtension: taroSignalSchema(fileExtensionSchema),
  renderHelpers: z.array(renderHelperProfileSchema),
  providerWrappers: z.array(providerWrapperProfileSchema),
  renderTargets: z.array(renderTargetCandidateSchema),
  repeatedMockTargets: z.array(mockTargetUsageSchema),
  sharedMockFactories: z.array(sharedMockFactoryProfileSchema),
  inlineSafeMockTargets: z.array(z.string()),
  mutationLifecycles: z.array(mutationLifecyclePatternSchema),
  instabilityWarnings: z.array(mockInstabilityWarningSchema),
  mockRecommendations: z.array(mockRecommendationSchema),
  fixtureRoots: z.array(fixtureRootProfileSchema),
  exemplars: z.array(exemplarProfileSchema),
  warnings: z.array(z.string()),
})
const generatedTestRecordSchema = z.object({
  createdAt: z.string(),
  packagePath: z.string(),
  recordingFile: z.string(),
  testFile: z.string(),
  quality: z.object({
    overall: z.number(),
    grade: z.enum(['A', 'B', 'C', 'D', 'F']),
    dimensions: scoreDimensionsSchema,
    signals: scoreSignalsSchema,
    reasons: z.array(scoreReasonSchema),
  }),
  requiresReview: z.boolean(),
})
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
})
const taroOverridesSchema = z.object({
  packages: z
    .record(
      z.string(),
      z.object({
        runner: z.enum(['vitest', 'jest']).optional(),
        renderHelper: z
          .object({
            name: z.string(),
            importPath: z.string(),
          })
          .optional(),
        forbidMocks: z.array(z.string()).optional(),
        preferredSharedMocks: z.record(z.string(), z.string()).optional(),
      })
    )
    .optional(),
})

interface PackageDescriptor {
  key: string
  root: string
  name: string | null
}

interface TestFileContent {
  path: string
  content: string
}

interface ScanStateOptions {
  preserveGeneratedTests?: boolean
  existingState?: TaroState | null
}

interface ScanStateResult {
  state: TaroState
  summary: TaroStateSummary
}

interface ReadStateDiagnostics {
  state: TaroState | null
  warnings: string[]
}

interface ReadOverridesDiagnostics {
  overrides: TaroOverrides
  warnings: string[]
}

export interface TaroPackageProfileStaleness {
  stale: boolean
  reason: string | null
  latestEvidencePath: string | null
}

function toConfidence(value: number): TaroStateConfidence {
  if (value >= 0.8) {
    return 'high'
  }
  if (value >= 0.45) {
    return 'medium'
  }
  return 'low'
}

function normalizePackageKey(projectRoot: string, packageRoot: string): string {
  const relativePath = relative(projectRoot, packageRoot).replace(/\\/g, '/')
  return relativePath.length === 0 ? '.' : relativePath
}

function sortByCountThenName<T extends { count: number; target?: string; name?: string }>(
  entries: T[]
): T[] {
  return [...entries].sort((left, right) => {
    return (
      right.count - left.count ||
      (left.target ?? left.name ?? '').localeCompare(right.target ?? right.name ?? '')
    )
  })
}

function normalizeConventionPaths(
  projectRoot: string,
  conventions: ConventionsSchema
): ConventionsSchema {
  return {
    ...conventions,
    projectRoot: conventions.projectRoot === projectRoot ? '.' : conventions.projectRoot,
    testFiles: conventions.testFiles.map((file) => ({
      ...file,
      path: relative(projectRoot, file.path).replace(/\\/g, '/'),
    })),
  }
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))].length
}

function extractMockTargets(content: string): string[] {
  return [...content.matchAll(MOCK_TARGET_REGEX)].map((match) => match[1]!)
}

function findStages(content: string): MutationLifecycleStage[] {
  return (Object.entries(STAGE_PATTERNS) as [MutationLifecycleStage, RegExp[]][])
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
    .map(([stage]) => stage)
}

function deriveMockRecommendations(targets: MockTargetUsage[]): MockRecommendation[] {
  return targets.map((target) => {
    const kind: MockRecommendationKind = target.count >= 2 ? 'extract' : 'inline'
    return {
      count: target.count,
      files: target.files,
      kind,
      reason:
        kind === 'extract'
          ? 'Mock target appears in multiple tests and should be shared'
          : 'Mock target appears in one place and can stay local to the test',
      target: target.target,
    }
  })
}

function scanMockTargetsInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
): MockTargetUsage[] {
  const targets = new Map<string, Set<string>>()

  for (const file of testFiles) {
    for (const target of extractMockTargets(file.content)) {
      const files = targets.get(target) ?? new Set<string>()
      files.add(relative(projectRoot, file.path).replace(/\\/g, '/'))
      targets.set(target, files)
    }
  }

  return [...targets.entries()]
    .map(([target, files]) => ({
      target,
      files: [...files].sort(),
      count: files.size,
    }))
    .sort((left, right) => right.count - left.count || left.target.localeCompare(right.target))
}

function analyzeMutationLifecycleInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
): MutationLifecyclePattern[] {
  return testFiles
    .filter((file) => MUTATION_TRIGGER_REGEX.test(file.content))
    .map((file) => {
      const stages = findStages(file.content)
      if (stages.length < 2) {
        return null
      }

      return {
        file: relative(projectRoot, file.path).replace(/\\/g, '/'),
        stages,
        evidence: stages.map((stage) => `${stage} cues detected`),
      }
    })
    .filter((entry): entry is MutationLifecyclePattern => entry !== null)
    .sort((left, right) => left.file.localeCompare(right.file))
}

function detectMockInstabilityInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
): MockInstabilityWarning[] {
  const warnings: MockInstabilityWarning[] = []

  for (const file of testFiles) {
    const relativePath = relative(projectRoot, file.path).replace(/\\/g, '/')
    const testBodies = file.content.split(TEST_BLOCK_REGEX).slice(1)
    const scopedMockCount = testBodies.filter((body) => TEST_SCOPED_MOCK_REGEX.test(body)).length

    if (scopedMockCount > 0) {
      warnings.push({
        file: relativePath,
        kind: 'recreated-factory',
        reason: 'Mocks are declared inside test bodies and may recreate factories per test run',
        evidence: [`${scopedMockCount} test block(s) declare vi.mock/jest.mock`],
      })
    }

    const resetCount = countMatches(file.content, MOCK_RESET_REGEX)
    const configCount = countMatches(file.content, MOCK_CONFIGURATION_REGEX)

    if (resetCount > 0 && configCount >= 2) {
      warnings.push({
        file: relativePath,
        kind: 'per-test-churn',
        reason: 'Mock configuration is reset and redefined repeatedly across tests',
        evidence: [
          `${resetCount} resetAll/clearAll/restoreAll call(s)`,
          `${configCount} mock configuration call(s)`,
        ],
      })
    }
  }

  return warnings.sort((left, right) => {
    return left.file.localeCompare(right.file) || left.kind.localeCompare(right.kind)
  })
}

function inferFileExtension(conventions: ConventionsSchema): TaroSignal<TaroFileExtension> {
  const value = conventions.fileExtension
  const confidence =
    value === 'mixed' || value === 'tsx' || value === 'jsx'
      ? 'medium'
      : conventions.testFiles.length > 0
        ? 'high'
        : 'low'
  return {
    value,
    confidence,
    evidence: conventions.testFiles.slice(0, MAX_EVIDENCE).map((file) => file.path),
  }
}

function inferFolderPattern(conventions: ConventionsSchema): TaroSignal<TaroPackageProfile['folderPattern']['value']> {
  return {
    value: conventions.folderPattern,
    confidence: conventions.folderPattern === 'unknown' ? 'low' : 'high',
    evidence: conventions.testFiles.slice(0, MAX_EVIDENCE).map((file) => file.path),
  }
}

function inferImportStyle(conventions: ConventionsSchema): TaroSignal<ImportStyle> {
  const cjsCount = conventions.testFiles.filter((file) => file.importStyle === 'cjs').length
  const total = conventions.testFiles.length || 1
  const winner = conventions.importStyle === 'cjs' ? cjsCount : total - cjsCount
  return {
    value: conventions.importStyle,
    confidence: toConfidence(winner / total),
    evidence: conventions.testFiles
      .filter((file) => file.importStyle === conventions.importStyle)
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  }
}

function inferMockPattern(conventions: ConventionsSchema): TaroSignal<MockPattern> {
  const winningFiles =
    conventions.mockPattern === 'none'
      ? conventions.testFiles.filter((file) => file.mockPattern === 'none').length
      : conventions.testFiles.filter((file) => file.mockPattern === conventions.mockPattern).length
  const total = conventions.testFiles.length || 1
  return {
    value: conventions.mockPattern,
    confidence: toConfidence(winningFiles / total),
    evidence: conventions.testFiles
      .filter((file) => file.mockPattern === conventions.mockPattern)
      .slice(0, MAX_EVIDENCE)
      .map((file) => file.path),
  }
}

function parseImportBindings(
  content: string
): Array<{ local: string; imported: string; importPath: string; kind: 'default' | 'named' }> {
  const bindings: Array<{ local: string; imported: string; importPath: string; kind: 'default' | 'named' }> = []

  for (const match of content.matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1]!.trim()
    const importPath = match[2]!
    const braceIndex = clause.indexOf('{')

    if (braceIndex === -1) {
      const local = clause.replace(/,\s*$/, '').trim()
      if (local.length > 0 && !local.startsWith('*')) {
        bindings.push({ local, imported: 'default', importPath, kind: 'default' })
      }
      continue
    }

    const defaultPart = clause.slice(0, braceIndex).replace(/,\s*$/, '').trim()
    if (defaultPart.length > 0 && !defaultPart.startsWith('*')) {
      bindings.push({ local: defaultPart, imported: 'default', importPath, kind: 'default' })
    }

    const namedPart = clause.slice(braceIndex + 1, clause.lastIndexOf('}'))
    for (const rawEntry of namedPart.split(',')) {
      const entry = rawEntry.trim()
      if (!entry) {
        continue
      }

      const [imported, alias] = entry.split(/\s+as\s+/)
      bindings.push({
        local: (alias ?? imported).trim(),
        imported: imported.trim(),
        importPath,
        kind: 'named',
      })
    }
  }

  return bindings
}

function isRenderHelperBinding(binding: { local: string; importPath: string }): boolean {
  if (binding.importPath === '@testing-library/react') {
    return false
  }

  return (
    binding.local === 'render' ||
    /^render[A-Z]/.test(binding.local) ||
    binding.local === 'renderWithProviders'
  )
}

function collectRenderHelpers(
  projectRoot: string,
  testFiles: TestFileContent[]
): TaroRenderHelperProfile[] {
  const helpers = new Map<
    string,
    { profile: TaroRenderHelperProfile; files: Set<string> }
  >()

  for (const file of testFiles) {
    const sourceTestFile = relative(projectRoot, file.path).replace(/\\/g, '/')
    const bindings = parseImportBindings(file.content)
    const usesWithin = file.content.includes('within(')

    for (const binding of bindings) {
      if (!isRenderHelperBinding(binding)) {
        continue
      }

      if (!new RegExp(`\\b${binding.local}\\s*\\(`).test(file.content)) {
        continue
      }

      const key = `${binding.local}|${binding.importPath}`
      const existing = helpers.get(key)
      if (existing) {
        existing.profile.usageCount += 1
        existing.profile.usesWithin = existing.profile.usesWithin || usesWithin
        existing.files.add(sourceTestFile)
        continue
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
      })
    }
  }

  return [...helpers.values()]
    .map(({ profile }) => profile)
    .sort((left, right) => {
      return (
        right.usageCount - left.usageCount ||
        left.name.localeCompare(right.name) ||
        left.importPath.localeCompare(right.importPath)
      )
    })
    .slice(0, MAX_EVIDENCE)
}

function collectProviderWrappers(
  projectRoot: string,
  testFiles: TestFileContent[]
): TaroProviderWrapperProfile[] {
  const providers = new Map<string, TaroProviderWrapperProfile>()

  for (const file of testFiles) {
    const sourceTestFile = relative(projectRoot, file.path).replace(/\\/g, '/')
    const bindings = parseImportBindings(file.content)
    const importsByLocal = new Map(bindings.map((binding) => [binding.local, binding.importPath]))

    for (const match of file.content.matchAll(/wrapper\s*:\s*([A-Z][A-Za-z0-9_]*)/g)) {
      const name = match[1]!
      const importPath = importsByLocal.get(name)
      if (!importPath) {
        continue
      }

      providers.set(`${name}|${importPath}`, {
        name,
        importPath,
        sourceTestFile,
      })
    }
  }

  return [...providers.values()].sort((left, right) => {
    return left.name.localeCompare(right.name) || left.importPath.localeCompare(right.importPath)
  })
}

function extractFixtureRootFromImport(importPath: string): { path: string; kind: TaroFixtureRootKind } | null {
  const normalized = importPath.replace(/\\/g, '/')
  const match = normalized.match(/^(.*?(mock-store|mocks|fixtures|factories))(?:\/.*)?$/)
  if (!match) {
    return null
  }

  const rootPath = match[1]!
  const kind = match[2] as TaroFixtureRootKind
  return { path: rootPath, kind }
}

async function collectFixtureDirs(projectRoot: string): Promise<TaroFixtureRootProfile[]> {
  const found = new Map<string, TaroFixtureRootProfile>()

  async function walk(dir: string, depth: number): Promise<void> {
    if (found.size >= MAX_FIXTURE_ROOTS || depth > 6) {
      return
    }

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (SKIP_DIRS.has(entry.name)) {
        continue
      }

      const fullPath = join(dir, entry.name)
      const relativePath = relative(projectRoot, fullPath).replace(/\\/g, '/')

      if ((FIXTURE_DIR_NAMES as readonly string[]).includes(entry.name)) {
        found.set(relativePath, {
          path: relativePath,
          kind: entry.name as TaroFixtureRootKind,
          source: 'directory',
        })
      }

      await walk(fullPath, depth + 1)
    }
  }

  await walk(projectRoot, 0)
  return [...found.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function collectFixtureRootsFromImports(testFiles: TestFileContent[]): TaroFixtureRootProfile[] {
  const roots = new Map<string, TaroFixtureRootProfile>()

  for (const file of testFiles) {
    for (const binding of parseImportBindings(file.content)) {
      const root = extractFixtureRootFromImport(binding.importPath)
      if (!root) {
        continue
      }

      roots.set(root.path, {
        path: root.path,
        kind: root.kind,
        source: 'import',
      })
    }
  }

  return [...roots.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function collectSharedMockFactories(
  projectRoot: string,
  testFiles: TestFileContent[]
): TaroSharedMockFactoryProfile[] {
  const factories = new Map<
    string,
    { files: Set<string>; count: number; importPath: string; target: string }
  >()

  for (const file of testFiles) {
    const relativePath = relative(projectRoot, file.path).replace(/\\/g, '/')
    for (const binding of parseImportBindings(file.content)) {
      if (!/(mock|fixture|factor)/i.test(binding.importPath)) {
        continue
      }

      const key = `${binding.importPath}|${binding.local}`
      const existing = factories.get(key)
      if (existing) {
        existing.files.add(relativePath)
        existing.count += 1
        continue
      }

      factories.set(key, {
        files: new Set([relativePath]),
        count: 1,
        importPath: binding.importPath,
        target: binding.local,
      })
    }
  }

  return sortByCountThenName(
    [...factories.values()].map((entry) => ({
      target: entry.target,
      importPath: entry.importPath,
      files: [...entry.files].sort(),
      count: entry.count,
    }))
  ).slice(0, MAX_EVIDENCE)
}

function createExemplarTags(file: TestFileContent, helperNames: string[]): string[] {
  const tags = new Set<string>()

  if (file.content.includes('within(')) {
    tags.add('dialog-scope')
  }
  if (helperNames.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(file.content))) {
    tags.add('render-helper')
  }
  if (extractMockTargets(file.content).length > 0) {
    tags.add('mocking')
  }
  if (findStages(file.content).length >= 2) {
    tags.add('mutation')
  }
  if (file.content.includes('userEvent.setup')) {
    tags.add('user-event')
  }

  return [...tags].sort()
}

function collectExemplars(
  projectRoot: string,
  testFiles: TestFileContent[],
  renderHelpers: TaroRenderHelperProfile[]
): TaroExemplarProfile[] {
  const helperNames = renderHelpers.map((helper) => helper.name)

  return testFiles
    .map((file) => ({
      file: relative(projectRoot, file.path).replace(/\\/g, '/'),
      tags: createExemplarTags(file, helperNames),
    }))
    .sort((left, right) => {
      return right.tags.length - left.tags.length || left.file.localeCompare(right.file)
    })
    .slice(0, MAX_EXEMPLARS)
}

async function readPackageName(packageRoot: string): Promise<string | null> {
  const packageJsonPath = join(packageRoot, 'package.json')
  try {
    const content = await readFile(packageJsonPath, 'utf-8')
    const parsed = JSON.parse(content) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

async function hasConfigFile(packageRoot: string, prefix: string): Promise<boolean> {
  try {
    const entries = await readdir(packageRoot)
    return entries.some((entry) => entry.startsWith(prefix))
  } catch {
    return false
  }
}

async function detectRunner(
  packageRoot: string,
  packageKey: string,
  testFiles: TestFileContent[]
): Promise<TaroSignal<TaroTestRunner>> {
  const evidence: string[] = []
  let vitestWeight = 0
  let jestWeight = 0
  const packageJsonPath = join(packageRoot, 'package.json')

  if (await hasConfigFile(packageRoot, 'vitest.config.')) {
    vitestWeight += 4
    evidence.push(`${packageKey}: vitest.config.* present`)
  }
  if (await hasConfigFile(packageRoot, 'jest.config.')) {
    jestWeight += 4
    evidence.push(`${packageKey}: jest.config.* present`)
  }

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencyMap = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }
    if (dependencyMap.vitest || Object.values(packageJson.scripts ?? {}).some((script) => /vitest/.test(script))) {
      vitestWeight += 3
      evidence.push(`${packageKey}: package.json references vitest`)
    }
    if (dependencyMap.jest || Object.values(packageJson.scripts ?? {}).some((script) => /\bjest\b/.test(script))) {
      jestWeight += 3
      evidence.push(`${packageKey}: package.json references jest`)
    }
  } catch {
    // Package metadata is optional for runner detection.
  }

  const vitestFileHits = testFiles.filter(
    (file) => /from\s+['"]vitest['"]/.test(file.content) || /\bvi\./.test(file.content)
  )
  const jestFileHits = testFiles.filter(
    (file) =>
      /from\s+['"]@jest\/globals['"]/.test(file.content) ||
      /from\s+['"]jest['"]/.test(file.content) ||
      /\bjest\./.test(file.content)
  )

  vitestWeight += vitestFileHits.length * 2
  jestWeight += jestFileHits.length * 2

  const winner: TaroTestRunner =
    vitestWeight === 0 && jestWeight === 0
      ? 'unknown'
      : vitestWeight >= jestWeight
        ? 'vitest'
        : 'jest'
  const winningWeight = winner === 'vitest' ? vitestWeight : winner === 'jest' ? jestWeight : 0
  const totalWeight = Math.max(vitestWeight + jestWeight, 1)
  const fileEvidence =
    winner === 'vitest'
      ? vitestFileHits.map((file) => relative(packageRoot, file.path).replace(/\\/g, '/'))
      : jestFileHits.map((file) => relative(packageRoot, file.path).replace(/\\/g, '/'))

  return {
    value: winner,
    confidence: winner === 'unknown' ? 'low' : toConfidence(winningWeight / totalWeight),
    evidence: [...evidence, ...fileEvidence].slice(0, MAX_EVIDENCE),
  }
}

async function findPackageDescriptors(projectRoot: string): Promise<PackageDescriptor[]> {
  const packages = new Map<string, PackageDescriptor>()

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue
        }
        await walk(fullPath)
        continue
      }

      if (!entry.isFile() || entry.name !== 'package.json') {
        continue
      }

      const packageRoot = dirname(fullPath)
      const key = normalizePackageKey(projectRoot, packageRoot)
      packages.set(key, {
        key,
        root: packageRoot,
        name: await readPackageName(packageRoot),
      })
    }
  }

  await walk(projectRoot)

  if (packages.size === 0) {
    packages.set('.', {
      key: '.',
      root: projectRoot,
      name: await readPackageName(projectRoot),
    })
  }

  return [...packages.values()].sort((left, right) => right.root.length - left.root.length)
}

function findNearestPackageDescriptor(
  descriptors: PackageDescriptor[],
  filePath: string
): PackageDescriptor {
  const sorted = [...descriptors].sort((left, right) => right.root.length - left.root.length)
  const normalizedFilePath = resolve(filePath)
  for (const descriptor of sorted) {
    if (
      normalizedFilePath === descriptor.root ||
      normalizedFilePath.startsWith(`${descriptor.root}/`) ||
      normalizedFilePath.startsWith(`${descriptor.root}\\`)
    ) {
      return descriptor
    }
  }

  return descriptors.find((descriptor) => descriptor.key === '.') ?? descriptors[0]!
}

function resolveExistingPackageProfile(
  state: TaroState | null,
  packageKey: string
): TaroPackageProfile | null {
  if (!state) {
    return null
  }

  return state.packages[packageKey] ?? null
}

async function buildPackageProfile(
  projectRoot: string,
  descriptor: PackageDescriptor,
  files: TestFileContent[],
  existingState: TaroState | null
): Promise<TaroPackageProfile> {
  const scannedAt = new Date().toISOString()
  const analyzedFiles = await Promise.all(files.map((file) => analyzeTestFile(file.path)))
  const conventions = normalizeConventionPaths(
    projectRoot,
    deriveConventions(analyzedFiles, descriptor.root)
  )
  const repeatedMockTargets = scanMockTargetsInFiles(projectRoot, files)
  const mockRecommendations = deriveMockRecommendations(repeatedMockTargets)
  const renderHelpers = collectRenderHelpers(projectRoot, files)
  const fixtureRoots = [
    ...collectFixtureRootsFromImports(files),
    ...(await collectFixtureDirs(descriptor.root)).map((root) => ({
      ...root,
      path:
        descriptor.key === '.'
          ? root.path
          : `${descriptor.key}/${root.path}`.replace(/\/+/g, '/'),
    })),
  ]
    .filter(
      (root, index, list) =>
        list.findIndex((candidate) => candidate.path === root.path && candidate.kind === root.kind) ===
        index
    )
    .slice(0, MAX_FIXTURE_ROOTS)

  const warnings: string[] = []
  const runner = await detectRunner(descriptor.root, descriptor.key, files)

  if (runner.value === 'unknown') {
    warnings.push('Runner could not be detected confidently from local tests/config.')
  }
  if (renderHelpers.length === 0) {
    warnings.push('No shared render helper detected; generation may fall back to plain render().')
  }

  const renderTargets = files
    .flatMap((file) => extractRenderTargetCandidatesFromFile(projectRoot, file))
    .sort((left, right) => {
      return (
        left.sourceTestFile.localeCompare(right.sourceTestFile) ||
        left.symbol.localeCompare(right.symbol)
      )
    })
  const mutationLifecycles = analyzeMutationLifecycleInFiles(projectRoot, files)
  const instabilityWarnings = detectMockInstabilityInFiles(projectRoot, files)
  const existingProfile = resolveExistingPackageProfile(existingState, descriptor.key)

  return {
    packagePath: descriptor.key,
    packageName: descriptor.name,
    scannedAt,
    testFileCount: files.length,
    conventions,
    importStyle: inferImportStyle(conventions),
    runner,
    mockPattern: inferMockPattern(conventions),
    folderPattern: inferFolderPattern(conventions),
    fileExtension: inferFileExtension(conventions),
    renderHelpers,
    providerWrappers: collectProviderWrappers(projectRoot, files),
    renderTargets,
    repeatedMockTargets: repeatedMockTargets.filter((target) => target.count > 1),
    sharedMockFactories: collectSharedMockFactories(projectRoot, files),
    inlineSafeMockTargets: mockRecommendations
      .filter((recommendation) => recommendation.kind === 'inline')
      .map((recommendation) => recommendation.target)
      .sort(),
    mutationLifecycles,
    instabilityWarnings,
    mockRecommendations,
    fixtureRoots,
    exemplars: collectExemplars(projectRoot, files, renderHelpers),
    warnings: [
      ...warnings,
      ...(existingProfile?.warnings ?? []).filter((warning) => warning.startsWith('override:')),
    ],
  }
}

async function collectMockStoreResources(
  projectRoot: string,
  statePackages: Record<string, TaroPackageProfile>
): Promise<TaroState['mockStore']> {
  const fixtureRoots = Object.values(statePackages)
    .flatMap((profile) => profile.fixtureRoots)
    .filter((root) => root.kind === 'mock-store')

  const rootDir =
    fixtureRoots.find((root) => root.source === 'directory')?.path ?? fixtureRoots[0]?.path ?? null
  const importHint = fixtureRoots.find((root) => root.source === 'import')?.path ?? rootDir

  if (!rootDir) {
    return {
      rootDir: null,
      importHint: null,
      resources: [],
    }
  }

  const diskRoot = join(projectRoot, rootDir)
  try {
    const info = await stat(diskRoot)
    if (!info.isDirectory()) {
      throw new Error('not a directory')
    }
  } catch {
    return {
      rootDir,
      importHint,
      resources: [],
    }
  }

  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_EVIDENCE) {
      return
    }

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= MAX_EVIDENCE) {
        return
      }

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }

      if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  await walk(diskRoot)
  const resources: TaroMockStoreResource[] = []

  for (const filePath of files) {
    let content = ''
    try {
      content = await readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    const exports = new Set<string>()
    for (const match of content.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g)) {
      exports.add(match[1]!)
    }
    for (const match of content.matchAll(/export\s*{([^}]+)}/g)) {
      for (const item of match[1]!.split(',')) {
        const [exported] = item.trim().split(/\s+as\s+/)
        if (exported) {
          exports.add(exported.trim())
        }
      }
    }

    resources.push({
      name: basename(filePath),
      file: relative(projectRoot, filePath).replace(/\\/g, '/'),
      exports: [...exports].sort(),
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    rootDir,
    importHint,
    resources: resources.sort((left, right) => left.file.localeCompare(right.file)),
  }
}

function emptyState(now: string): TaroState {
  return {
    version: STATE_VERSION,
    meta: {
      createdAt: now,
      updatedAt: now,
      taroVersion: TARO_VERSION,
    },
    packages: {},
    mockStore: {
      rootDir: null,
      importHint: null,
      resources: [],
    },
    generatedTests: [],
  }
}

function deriveLegacyPackageProfile(
  projectRoot: string,
  conventions: ConventionsSchema
): TaroPackageProfile {
  const normalized = normalizeConventionPaths(projectRoot, conventions)
  return {
    packagePath: '.',
    packageName: null,
    scannedAt: normalized.scannedAt || new Date().toISOString(),
    testFileCount: conventions.testFiles.length,
    conventions: normalized,
    importStyle: inferImportStyle(normalized),
    runner: {
      value: 'unknown',
      confidence: 'low',
      evidence: ['Migrated from legacy conventions.json'],
    },
    mockPattern: inferMockPattern(normalized),
    folderPattern: inferFolderPattern(normalized),
    fileExtension: inferFileExtension(normalized),
    renderHelpers: [],
    providerWrappers: [],
    renderTargets: [],
    repeatedMockTargets: [],
    sharedMockFactories: [],
    inlineSafeMockTargets: [],
    mutationLifecycles: [],
    instabilityWarnings: [],
    mockRecommendations: [],
    fixtureRoots: [],
    exemplars: normalized.testFiles.slice(0, MAX_EXEMPLARS).map((file) => ({
      file: file.path,
      tags: [],
    })),
    warnings: ['Migrated from legacy conventions.json'],
  }
}

function migrateLegacyHistory(
  history: Array<{
    timestamp?: string
    recordingFile?: string
    score?: number
    grade?: string
    dimensions?: ScoreResult['dimensions']
  }>
): TaroState['generatedTests'] {
  return history
    .filter((entry) => typeof entry.recordingFile === 'string')
    .map((entry): TaroGeneratedTestRecord => {
      const grade: TaroGeneratedTestRecord['quality']['grade'] =
        entry.grade === 'A' ||
        entry.grade === 'B' ||
        entry.grade === 'C' ||
        entry.grade === 'D'
          ? entry.grade
          : 'F'

      return {
        createdAt: entry.timestamp ?? new Date().toISOString(),
        packagePath: '.',
        recordingFile: entry.recordingFile!,
        testFile: entry.recordingFile!.replace(/\.[cm]?[jt]sx?$/, '.test.tsx'),
        quality: {
          overall: entry.score ?? 0,
          grade,
          dimensions:
            entry.dimensions ?? {
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
            weakAssertionCount: 0,
            boundaryWarningCount: 0,
            boundaryIssueCount: 0,
            placeholderRenderTarget: false,
            multipleTestBlocks: false,
          },
          reasons: [],
        },
        requiresReview: true,
      }
    })
    .slice(-GENERATED_TEST_HISTORY_LIMIT)
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

async function readTaroStateWithDiagnostics(projectRoot: string): Promise<ReadStateDiagnostics> {
  const statePath = await findReadableProjectStatePath(projectRoot, 'state.json')
  if (!statePath) {
    return {
      state: null,
      warnings: [],
    }
  }

  const parsed = await readJsonFile<unknown>(statePath)
  if (parsed === null) {
    return {
      state: null,
      warnings: ['Failed to parse .taro/state.json. Taro will ignore it and rebuild state.'],
    }
  }

  const result = taroStateSchema.safeParse(parsed)
  if (!result.success) {
    return {
      state: null,
      warnings: ['Invalid .taro/state.json shape detected. Taro will ignore it and rebuild state.'],
    }
  }

  return {
    state: result.data,
    warnings: [],
  }
}

async function readTaroOverridesWithDiagnostics(
  projectRoot: string
): Promise<ReadOverridesDiagnostics> {
  const overridesPath = await findReadableProjectStatePath(projectRoot, 'overrides.json')
  if (!overridesPath) {
    return {
      overrides: {},
      warnings: [],
    }
  }

  const parsed = await readJsonFile<unknown>(overridesPath)
  if (parsed === null) {
    return {
      overrides: {},
      warnings: ['Failed to parse .taro/overrides.json. Taro will ignore overrides for this run.'],
    }
  }

  const result = taroOverridesSchema.safeParse(parsed)
  if (!result.success) {
    return {
      overrides: {},
      warnings: ['Invalid .taro/overrides.json shape detected. Taro will ignore overrides for this run.'],
    }
  }

  return {
    overrides: result.data,
    warnings: [],
  }
}

export async function readTaroState(projectRoot: string): Promise<TaroState | null> {
  return (await readTaroStateWithDiagnostics(projectRoot)).state
}

export async function readTaroOverrides(projectRoot: string): Promise<TaroOverrides> {
  return (await readTaroOverridesWithDiagnostics(projectRoot)).overrides
}

async function loadLegacyState(projectRoot: string): Promise<{
  state: TaroState | null
  migratedLegacyState: boolean
  warnings: string[]
}> {
  const currentState = await readTaroStateWithDiagnostics(projectRoot)
  if (currentState.state) {
    return {
      state: currentState.state,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    }
  }

  const [legacyConventionsPath, legacyHistoryPath] = await Promise.all([
    findReadableProjectStatePath(projectRoot, 'conventions.json'),
    findReadableProjectStatePath(projectRoot, 'history.json'),
  ])
  const [legacyConventions, legacyHistory] = await Promise.all([
    legacyConventionsPath ? readJsonFile<ConventionsSchema>(legacyConventionsPath) : null,
    legacyHistoryPath
      ? readJsonFile<
          Array<{
            timestamp?: string
            recordingFile?: string
            score?: number
            grade?: string
            dimensions?: ScoreResult['dimensions']
          }>
        >(legacyHistoryPath)
      : null,
  ])

  if (!legacyConventions && !legacyHistory) {
    return {
      state: null,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    }
  }

  const now = new Date().toISOString()
  const state = emptyState(now)
  state.meta.createdAt = now
  state.meta.updatedAt = now

  if (legacyConventions) {
    state.packages['.'] = deriveLegacyPackageProfile(projectRoot, legacyConventions)
  }
  if (legacyHistory) {
    state.generatedTests = migrateLegacyHistory(legacyHistory)
  }

  return {
    state,
    migratedLegacyState: true,
    warnings: currentState.warnings,
  }
}

export async function writeTaroState(projectRoot: string, state: TaroState): Promise<void> {
  await ensureProjectStateDir(projectRoot)
  const statePath = getProjectStatePath(projectRoot, 'state.json')
  const result = taroStateSchema.safeParse(state)
  if (!result.success) {
    throw new Error('Refusing to write invalid .taro/state.json payload.')
  }

  const serialized = JSON.stringify(result.data, null, 2)
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, serialized, 'utf-8')
  await rename(tempPath, statePath)
}

export async function scanProjectState(
  projectRoot: string,
  options: ScanStateOptions = {}
): Promise<ScanStateResult> {
  const loadedLegacy = options.existingState
    ? { state: options.existingState, migratedLegacyState: false, warnings: [] }
    : await loadLegacyState(projectRoot)
  const overridesDiagnostics = await readTaroOverridesWithDiagnostics(projectRoot)
  const now = new Date().toISOString()
  const testFiles = await readTestFiles(projectRoot)
  const packageDescriptors = await findPackageDescriptors(projectRoot)
  const packagesByKey = new Map<string, TestFileContent[]>()

  for (const file of testFiles) {
    const descriptor = findNearestPackageDescriptor(packageDescriptors, file.path)
    const files = packagesByKey.get(descriptor.key) ?? []
    files.push(file)
    packagesByKey.set(descriptor.key, files)
  }

  const packageProfiles = await Promise.all(
    [...packagesByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([packageKey, files]) => {
        const descriptor = packageDescriptors.find((candidate) => candidate.key === packageKey)!
        return buildPackageProfile(projectRoot, descriptor, files, loadedLegacy.state)
      })
  )

  const packages =
    packageProfiles.length > 0
      ? Object.fromEntries(packageProfiles.map((profile) => [profile.packagePath, profile]))
      : (loadedLegacy.state?.packages ?? {})
  const existingState = loadedLegacy.state
  const generatedTests =
    options.preserveGeneratedTests === false
      ? []
      : existingState?.generatedTests.slice(-GENERATED_TEST_HISTORY_LIMIT) ?? []
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
  }
  const summaryPackages: TaroStateSummaryPackage[] = Object.values(packages)
    .map((profile) => ({
      packagePath: profile.packagePath,
      runner: profile.runner.value,
      scannedAt: profile.scannedAt,
      renderHelperCount: profile.renderHelpers.length,
      repeatedMockTargetCount: profile.repeatedMockTargets.length,
      fixtureRootCount: profile.fixtureRoots.length,
      warnings: profile.warnings,
    }))
    .sort((left, right) => left.packagePath.localeCompare(right.packagePath))

  return {
    state,
    summary: {
      packageCount: summaryPackages.length,
      renderHelperCount: summaryPackages.reduce((sum, item) => sum + item.renderHelperCount, 0),
      repeatedMockTargetCount: summaryPackages.reduce(
        (sum, item) => sum + item.repeatedMockTargetCount,
        0
      ),
      fixtureRootCount: summaryPackages.reduce((sum, item) => sum + item.fixtureRootCount, 0),
      migratedLegacyState: loadedLegacy.migratedLegacyState,
      overridePackageCount: Object.keys(overridesDiagnostics.overrides.packages ?? {}).length,
      packages: summaryPackages,
      warnings: [
        ...(summaryPackages.length === 0
          ? ['No test files were detected; state contains defaults only.']
          : []),
        ...loadedLegacy.warnings,
        ...overridesDiagnostics.warnings,
      ],
    },
  }
}

export async function initTaroState(projectRoot: string): Promise<ScanStateResult> {
  const result = await scanProjectState(projectRoot)
  await writeTaroState(projectRoot, result.state)
  return result
}

export async function refreshTaroState(projectRoot: string): Promise<ScanStateResult> {
  const result = await scanProjectState(projectRoot)
  await writeTaroState(projectRoot, result.state)
  return result
}

export async function loadOrBootstrapTaroState(projectRoot: string): Promise<ScanStateResult> {
  const existingStateDiagnostics = await readTaroStateWithDiagnostics(projectRoot)
  const overridesDiagnostics = await readTaroOverridesWithDiagnostics(projectRoot)
  const existingState = existingStateDiagnostics.state
  if (existingState) {
    const summaryPackages: TaroStateSummaryPackage[] = Object.values(existingState.packages).map(
      (profile) => ({
        packagePath: profile.packagePath,
        runner: profile.runner.value,
        scannedAt: profile.scannedAt,
        renderHelperCount: profile.renderHelpers.length,
        repeatedMockTargetCount: profile.repeatedMockTargets.length,
        fixtureRootCount: profile.fixtureRoots.length,
        warnings: profile.warnings,
      })
    )
    return {
      state: existingState,
      summary: {
        packageCount: summaryPackages.length,
        renderHelperCount: summaryPackages.reduce((sum, item) => sum + item.renderHelperCount, 0),
        repeatedMockTargetCount: summaryPackages.reduce(
          (sum, item) => sum + item.repeatedMockTargetCount,
          0
        ),
        fixtureRootCount: summaryPackages.reduce((sum, item) => sum + item.fixtureRootCount, 0),
        migratedLegacyState: false,
        overridePackageCount: Object.keys(overridesDiagnostics.overrides.packages ?? {}).length,
        packages: summaryPackages,
        warnings: [...existingStateDiagnostics.warnings, ...overridesDiagnostics.warnings],
      },
    }
  }

  const loadedLegacy = await loadLegacyState(projectRoot)
  if (loadedLegacy.state) {
    const result = await scanProjectState(projectRoot, { existingState: loadedLegacy.state })
    await writeTaroState(projectRoot, result.state)
    return result
  }

  const result = await scanProjectState(projectRoot)
  await writeTaroState(projectRoot, result.state)
  return result
}

export function findRepoFallbackPackageProfile(state: TaroState): TaroPackageProfile | null {
  if (state.packages['.']) {
    return state.packages['.']!
  }

  const profiles = Object.values(state.packages)
  if (profiles.length === 0) {
    return null
  }

  return [...profiles].sort((left, right) => {
    return right.testFileCount - left.testFileCount || left.packagePath.localeCompare(right.packagePath)
  })[0]!
}

function findBestPackageProfile(
  state: TaroState,
  targetPath: string
): TaroPackageProfile | null {
  const normalizedTarget = targetPath.replace(/\\/g, '/')
  const profiles = Object.values(state.packages).sort(
    (left, right) => right.packagePath.length - left.packagePath.length
  )

  for (const profile of profiles) {
    if (
      profile.packagePath === '.' ||
      normalizedTarget === profile.packagePath ||
      normalizedTarget.startsWith(`${profile.packagePath}/`)
    ) {
      return profile
    }
  }

  return findRepoFallbackPackageProfile(state)
}

async function getLatestPackageEvidence(projectRoot: string, profile: TaroPackageProfile): Promise<{
  latestMtimeMs: number
  latestPath: string | null
}> {
  const candidates = new Set<string>()
  const packageRoot =
    profile.packagePath === '.' ? projectRoot : join(projectRoot, profile.packagePath)

  candidates.add(join(packageRoot, 'package.json'))
  for (const file of profile.conventions.testFiles) {
    candidates.add(join(projectRoot, file.path))
  }

  try {
    const entries = await readdir(packageRoot)
    for (const entry of entries) {
      if (/^(vitest|jest)\.config\./.test(entry)) {
        candidates.add(join(packageRoot, entry))
      }
    }
  } catch {
    // Best-effort only.
  }

  let latestMtimeMs = 0
  let latestPath: string | null = null

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate)
      if (info.mtimeMs > latestMtimeMs) {
        latestMtimeMs = info.mtimeMs
        latestPath = relative(projectRoot, candidate).replace(/\\/g, '/')
      }
    } catch {
      // Ignore unreadable probe paths.
    }
  }

  return {
    latestMtimeMs,
    latestPath,
  }
}

export async function detectPackageProfileStaleness(
  projectRoot: string,
  profile: TaroPackageProfile
): Promise<TaroPackageProfileStaleness> {
  const scannedAtMs = Date.parse(profile.scannedAt)
  if (!Number.isFinite(scannedAtMs)) {
    return {
      stale: true,
      reason: 'Package profile scan timestamp is invalid.',
      latestEvidencePath: null,
    }
  }

  const latestEvidence = await getLatestPackageEvidence(projectRoot, profile)
  if (latestEvidence.latestMtimeMs === 0) {
    return {
      stale: false,
      reason: null,
      latestEvidencePath: null,
    }
  }

  if (latestEvidence.latestMtimeMs > scannedAtMs + 1000) {
    return {
      stale: true,
      reason: latestEvidence.latestPath
        ? `${latestEvidence.latestPath} changed after the package profile was scanned.`
        : 'Package evidence changed after the package profile was scanned.',
      latestEvidencePath: latestEvidence.latestPath,
    }
  }

  return {
    stale: false,
    reason: null,
    latestEvidencePath: latestEvidence.latestPath,
  }
}

export function resolveTaroPackageProfile(
  state: TaroState,
  projectRoot: string,
  targetPath: string,
  overrides: TaroOverrides = {}
): ResolvedTaroPackageProfile | null {
  const normalizedTarget = relative(projectRoot, resolve(targetPath)).replace(/\\/g, '/')
  const profile = findBestPackageProfile(state, normalizedTarget)
  if (!profile) {
    return null
  }

  const packageOverrides: TaroPackageOverrides | undefined = overrides.packages?.[profile.packagePath]
  const appliedOverrides: string[] = []
  let effectiveRenderHelper = profile.renderHelpers[0] ?? null
  if (packageOverrides?.runner) {
    appliedOverrides.push(`runner:${packageOverrides.runner}`)
  }
  if (packageOverrides?.renderHelper) {
    appliedOverrides.push(`renderHelper:${packageOverrides.renderHelper.name}`)
    effectiveRenderHelper = {
      name: packageOverrides.renderHelper.name,
      importPath: packageOverrides.renderHelper.importPath,
      importKind: 'named',
      sourceTestFile: '.taro/overrides.json',
      usageCount: 0,
      usesWithin: false,
    }
  }
  if (packageOverrides?.forbidMocks?.length) {
    appliedOverrides.push('forbidMocks')
  }
  if (packageOverrides?.preferredSharedMocks && Object.keys(packageOverrides.preferredSharedMocks).length > 0) {
    appliedOverrides.push('preferredSharedMocks')
  }

  return {
    ...profile,
    appliedOverrides,
    effectiveRunner: packageOverrides?.runner ?? profile.runner.value,
    effectiveRenderHelper,
    forbidMocks: packageOverrides?.forbidMocks ?? [],
    preferredSharedMocks: packageOverrides?.preferredSharedMocks ?? {},
  }
}

export async function appendGeneratedTestRecord(
  projectRoot: string,
  record: {
    packagePath: string
    recordingFile: string
    testFile: string
    scoreResult: ScoreResult
  }
): Promise<void> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot)
  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: new Date().toISOString(),
      taroVersion: TARO_VERSION,
    },
    generatedTests: [
      ...bootstrap.state.generatedTests,
      {
        createdAt: new Date().toISOString(),
        packagePath: record.packagePath,
        recordingFile: record.recordingFile,
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
    ].slice(-GENERATED_TEST_HISTORY_LIMIT),
  }

  await writeTaroState(projectRoot, nextState)
}

export function formatStateSummary(summary: TaroStateSummary, action: 'init' | 'refresh'): string[] {
  const lines = [
    `${pc.dim('[taro]')} ${action === 'init' ? 'Initialized' : 'Refreshed'} project state`,
    `${pc.dim('[taro]')} packages=${summary.packageCount}, renderHelpers=${summary.renderHelperCount}, repeatedMockTargets=${summary.repeatedMockTargetCount}, fixtureRoots=${summary.fixtureRootCount}`,
  ]

  if (summary.migratedLegacyState) {
    lines.push(`${pc.dim('[taro]')} migrated legacy .taro/.tayo convention history into state.json`)
  }
  if (summary.overridePackageCount > 0) {
    lines.push(`${pc.dim('[taro]')} overrides applied from .taro/overrides.json for ${summary.overridePackageCount} package(s)`)
  }

  for (const pkg of summary.packages) {
    lines.push(
      `${pc.dim('[taro]')} ${pkg.packagePath}: runner=${pkg.runner}, scannedAt=${pkg.scannedAt}, renderHelpers=${pkg.renderHelperCount}, repeatedMocks=${pkg.repeatedMockTargetCount}, fixtureRoots=${pkg.fixtureRootCount}`
    )
  }
  for (const warning of summary.warnings) {
    lines.push(`${pc.yellow('[taro]')} ${warning}`)
  }

  return lines
}
