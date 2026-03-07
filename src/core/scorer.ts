import type { QueryResult } from '../types/recording.js'
import type { ScoreDimensions, ScoreResult } from '../types/score.js'

const QUERY_WEIGHTS: Record<string, number> = {
  getByRole: 1.0,
  getByLabelText: 0.8,
  getByText: 0.6,
  getByPlaceholderText: 0.5,
  getByTestId: 0.2,
}

const STRONG_ASSERTION_REGEX = /\.toHaveValue\(|\.toBeChecked\(|\.toHaveTextContent\(|\.toBeVisible\(/g
const WEAK_ASSERTION_REGEX = /\.toBeInTheDocument\(/g

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)))
}

export function calculateQueryScore(queryResults: QueryResult[]): number {
  if (queryResults.length === 0) {
    return 100
  }

  const totalWeight = queryResults.reduce((sum, queryResult) => {
    return sum + (QUERY_WEIGHTS[queryResult.method] ?? 0.2)
  }, 0)

  return clampScore((totalWeight / queryResults.length) * 100)
}

export function calculateAssertionScore(code: string): number {
  const strongAssertions = code.match(STRONG_ASSERTION_REGEX)?.length ?? 0
  const weakAssertions = code.match(WEAK_ASSERTION_REGEX)?.length ?? 0
  const totalAssertions = strongAssertions + weakAssertions

  if (totalAssertions === 0) {
    return 0
  }

  const weightedScore = strongAssertions + weakAssertions * 0.3
  return clampScore((weightedScore / totalAssertions) * 100)
}

export function calculateStructureScore(code: string): number {
  const describeCount = code.match(/\bdescribe\s*\(/g)?.length ?? 0
  const itCount = code.match(/\b(?:it|test)\s*\(/g)?.length ?? 0

  let score = 50

  if (describeCount > 0) {
    score += 20
  }

  if (itCount > 1) {
    score += Math.min((itCount - 1) * 15, 30)
  }

  if (itCount === 1 && code.length > 2000) {
    score -= 20
  }

  return clampScore(score)
}

export function calculateAggregateScore(
  dimensions: ScoreDimensions
): Pick<ScoreResult, 'total' | 'grade'> {
  const total = clampScore(
    dimensions.queryQuality * 0.4 +
      dimensions.assertionSpecificity * 0.35 +
      dimensions.testStructure * 0.25
  )

  if (total >= 90) {
    return { total, grade: 'A' }
  }

  if (total >= 80) {
    return { total, grade: 'B' }
  }

  if (total >= 70) {
    return { total, grade: 'C' }
  }

  if (total >= 60) {
    return { total, grade: 'D' }
  }

  return { total, grade: 'F' }
}

export function scoreGeneratedTest(
  code: string,
  queryResults: QueryResult[] = []
): ScoreResult {
  const dimensions: ScoreDimensions = {
    queryQuality: calculateQueryScore(queryResults),
    assertionSpecificity: calculateAssertionScore(code),
    testStructure: calculateStructureScore(code),
  }

  return {
    ...calculateAggregateScore(dimensions),
    dimensions,
  }
}
