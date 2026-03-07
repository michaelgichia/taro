import { relative } from 'node:path'
import { readConventions, readTestFiles } from './scanner.js'
import type {
  ConventionsSchema,
  MockRecommendation,
  MockRecommendationKind,
  MockTargetUsage,
} from '../types/conventions.js'

export interface MockAnalysis {
  conventions: ConventionsSchema | null
  recommendations: MockRecommendation[]
  repeatedTargets: MockTargetUsage[]
}

const MOCK_TARGET_REGEX = /(?:vi|jest)\.mock\(\s*['"`]([^'"`]+)['"`]/g

function extractMockTargets(content: string): string[] {
  return [...content.matchAll(MOCK_TARGET_REGEX)].map((match) => match[1]!)
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

export async function analyzeMocks(projectRoot: string): Promise<MockAnalysis> {
  const [conventions, targets] = await Promise.all([
    readConventions(projectRoot),
    scanMockTargets(projectRoot),
  ])

  return {
    conventions,
    recommendations: deriveMockRecommendations(targets),
    repeatedTargets: targets.filter((target) => target.count > 1),
  }
}
