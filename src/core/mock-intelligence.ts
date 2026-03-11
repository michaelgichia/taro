import { relative } from 'node:path'
import { readConventions, readTestFiles } from './scanner.js'
import type {
  ConventionsSchema,
  MockInstabilityWarning,
  MockRecommendation,
  MockRecommendationKind,
  MockTargetUsage,
  MutationLifecyclePattern,
  MutationLifecycleStage,
} from '../types/conventions.js'
import type { ResolvedTaroPackageProfile, TaroSharedMockFactoryProfile } from '../types/state.js'
import type { TestFileContent } from './scanner.js'

export interface MockAnalysis {
  conventions: ConventionsSchema | null
  packagePath: string | null
  source: 'repo-scan' | 'package-profile'
  recommendations: MockRecommendation[]
  repeatedTargets: MockTargetUsage[]
  mutationLifecycles: MutationLifecyclePattern[]
  instabilityWarnings: MockInstabilityWarning[]
  sharedMockFactories: TaroSharedMockFactoryProfile[]
  inlineSafeMockTargets: string[]
  preferredSharedMocks: Record<string, string>
  forbidMocks: string[]
}

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

function extractMockTargets(content: string): string[] {
  return [...content.matchAll(MOCK_TARGET_REGEX)].map((match) => match[1]!)
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))].length
}

function findStages(content: string): MutationLifecycleStage[] {
  return (Object.entries(STAGE_PATTERNS) as [MutationLifecycleStage, RegExp[]][])
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
    .map(([stage]) => stage)
}

function scanMockTargetsInFiles(
  projectRoot: string,
  testFiles: TestFileContent[]
): MockTargetUsage[] {
  const targets = new Map<string, Set<string>>()

  for (const file of testFiles) {
    for (const target of extractMockTargets(file.content)) {
      const files = targets.get(target) ?? new Set<string>()
      files.add(relative(projectRoot, file.path))
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
        file: relative(projectRoot, file.path),
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
    const relativePath = relative(projectRoot, file.path)
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

export function deriveMockRecommendations(
  targets: MockTargetUsage[]
): MockRecommendation[] {
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

export async function scanMockTargets(projectRoot: string): Promise<MockTargetUsage[]> {
  const testFiles = await readTestFiles(projectRoot)
  return scanMockTargetsInFiles(projectRoot, testFiles)
}

export async function analyzeMutationLifecycle(
  projectRoot: string
): Promise<MutationLifecyclePattern[]> {
  const testFiles = await readTestFiles(projectRoot)
  return analyzeMutationLifecycleInFiles(projectRoot, testFiles)
}

export async function detectMockInstability(
  projectRoot: string
): Promise<MockInstabilityWarning[]> {
  const testFiles = await readTestFiles(projectRoot)
  return detectMockInstabilityInFiles(projectRoot, testFiles)
}

export async function analyzeMocks(
  projectRoot: string,
  options: {
    packageProfile?: ResolvedTaroPackageProfile | null
  } = {}
): Promise<MockAnalysis> {
  const packageProfile = options.packageProfile ?? null
  if (packageProfile) {
    const forbiddenTargets = new Set(packageProfile.forbidMocks)
    const repeatedTargets = packageProfile.repeatedMockTargets.filter(
      (target) => !forbiddenTargets.has(target.target)
    )
    const packageRecommendations = packageProfile.mockRecommendations.filter(
      (recommendation) => !forbiddenTargets.has(recommendation.target)
    )
    const preferredRecommendations = Object.entries(packageProfile.preferredSharedMocks).map(
      ([target, importPath]) => {
        const repeatedTarget = repeatedTargets.find((entry) => entry.target === target)
        return {
          target,
          kind: 'extract' as const,
          reason: `Shared mock preference pinned to ${importPath}`,
          files: repeatedTarget?.files ?? [],
          count: repeatedTarget?.count ?? 1,
        }
      }
    )

    return {
      conventions: packageProfile.conventions,
      packagePath: packageProfile.packagePath,
      source: 'package-profile',
      recommendations: [
        ...preferredRecommendations,
        ...packageRecommendations.filter(
          (recommendation) =>
            !preferredRecommendations.some((preferred) => preferred.target === recommendation.target)
        ),
      ],
      repeatedTargets,
      mutationLifecycles: packageProfile.mutationLifecycles,
      instabilityWarnings: packageProfile.instabilityWarnings,
      sharedMockFactories: packageProfile.sharedMockFactories,
      inlineSafeMockTargets: packageProfile.inlineSafeMockTargets,
      preferredSharedMocks: packageProfile.preferredSharedMocks,
      forbidMocks: packageProfile.forbidMocks,
    }
  }

  const testFiles = await readTestFiles(projectRoot)
  const [conventions] = await Promise.all([readConventions(projectRoot)])
  const targets = scanMockTargetsInFiles(projectRoot, testFiles)
  const mutationLifecycles = analyzeMutationLifecycleInFiles(projectRoot, testFiles)
  const instabilityWarnings = detectMockInstabilityInFiles(projectRoot, testFiles)

  return {
    conventions,
    packagePath: null,
    source: 'repo-scan',
    recommendations: deriveMockRecommendations(targets),
    repeatedTargets: targets.filter((target) => target.count > 1),
    mutationLifecycles,
    instabilityWarnings,
    sharedMockFactories: [],
    inlineSafeMockTargets: [],
    preferredSharedMocks: {},
    forbidMocks: [],
  }
}
