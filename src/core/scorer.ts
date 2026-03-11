import { analyzeBoundaryIsolation, calculateBoundaryIsolationScore } from './boundary-intelligence.js'
import type { QueryResult } from '../types/recording.js'
import type {
  MarkerCoverageTotals,
  MarkerQualityGateState,
  ScoreDimensions,
  ScoreReason,
  ScoreResult,
  ScoreSignals,
} from '../types/score.js'

const QUERY_WEIGHTS: Record<string, number> = {
  getByRole: 1.0,
  getByLabelText: 0.8,
  getByText: 0.6,
  getByPlaceholderText: 0.5,
  getByTestId: 0.2,
}

const STRONG_ASSERTION_REGEX = /\.toHaveValue\(|\.toBeChecked\(|\.toHaveTextContent\(|\.toBeVisible\(/g
const WEAK_ASSERTION_REGEX = /\.toBeInTheDocument\(/g
const QUERY_CHECKPOINT_REGEX = /taro-query-checkpoint:/g
const ROLE_QUERY_REGEX = /\b(?:getByRole|findByRole)\s*\(/g
const TEST_ID_QUERY_REGEX = /\b(?:getByTestId|findByTestId)\s*\(/g
const BOUNDARY_WARNING_REGEX = /taro-boundary-warning:/g
const TEST_BLOCK_REGEX = /\b(?:it|test)\s*\(/g

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)))
}

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length ?? 0
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.round(value))
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
  const strongAssertions = countMatches(code, STRONG_ASSERTION_REGEX)
  const weakAssertions = countMatches(code, WEAK_ASSERTION_REGEX)
  const totalAssertions = strongAssertions + weakAssertions

  if (totalAssertions === 0) {
    return 0
  }

  const weightedScore = strongAssertions + weakAssertions * 0.3
  return clampScore((weightedScore / totalAssertions) * 100)
}

export function calculateStructureScore(code: string): number {
  const describeCount = code.match(/\bdescribe\s*\(/g)?.length ?? 0
  const itCount = countMatches(code, TEST_BLOCK_REGEX)

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

  if (code.includes('render(<App />)')) {
    score -= 25
  }

  if (code.includes('taro-boundary-warning:')) {
    score -= 20
  }

  return clampScore(score)
}

function collectSignals(
  code: string,
  queryResults: QueryResult[],
  boundaryIssueCount: number
): ScoreSignals {
  return {
    queryCheckpointCount: countMatches(code, QUERY_CHECKPOINT_REGEX),
    roleQueryCount:
      queryResults.filter((queryResult) => queryResult.method === 'getByRole').length +
      countMatches(code, ROLE_QUERY_REGEX),
    testIdQueryCount:
      queryResults.filter((queryResult) => queryResult.method === 'getByTestId').length +
      countMatches(code, TEST_ID_QUERY_REGEX),
    strongAssertionCount: countMatches(code, STRONG_ASSERTION_REGEX),
    weakAssertionCount: countMatches(code, WEAK_ASSERTION_REGEX),
    boundaryWarningCount: countMatches(code, BOUNDARY_WARNING_REGEX),
    boundaryIssueCount,
    placeholderRenderTarget: code.includes('render(<App />)'),
    multipleTestBlocks: countMatches(code, TEST_BLOCK_REGEX) > 1,
  }
}

function createReason(
  code: string,
  dimension: keyof ScoreDimensions,
  impact: 'positive' | 'negative',
  weight: number,
  message: string
): ScoreReason {
  return { code, dimension, impact, weight, message }
}

function compareReasons(left: ScoreReason, right: ScoreReason): number {
  if (right.weight !== left.weight) {
    return right.weight - left.weight
  }

  return left.code.localeCompare(right.code)
}

function collectReasons(
  dimensions: ScoreDimensions,
  signals: ScoreSignals,
  boundaryMessages: string[],
  markerQualityGate: MarkerQualityGateState
): ScoreReason[] {
  const reasons: ScoreReason[] = []

  if (signals.queryCheckpointCount > 0) {
    reasons.push(
      createReason(
        'query-checkpoints',
        'queryQuality',
        'negative',
        Math.min(40, signals.queryCheckpointCount * 3),
        `${signals.queryCheckpointCount} unresolved query checkpoint(s) remain, so query quality is still draft-grade.`
      )
    )
  }

  if (signals.testIdQueryCount > 0) {
    reasons.push(
      createReason(
        'testid-queries',
        'queryQuality',
        'negative',
        Math.min(15, signals.testIdQueryCount * 4),
        `${signals.testIdQueryCount} test-id query(ies) remain in the generated output.`
      )
    )
  }

  if (signals.roleQueryCount > 0 && dimensions.queryQuality >= 80) {
    reasons.push(
      createReason(
        'role-queries',
        'queryQuality',
        'positive',
        8,
        `Recovered role-based queries cover ${signals.roleQueryCount} interaction(s).`
      )
    )
  }

  if (signals.strongAssertionCount === 0 && signals.weakAssertionCount > 0) {
    reasons.push(
      createReason(
        'weak-assertions-only',
        'assertionSpecificity',
        'negative',
        12,
        'Assertions rely on generic presence checks instead of stronger user-visible expectations.'
      )
    )
  }

  if (signals.strongAssertionCount === 0 && signals.weakAssertionCount === 0) {
    reasons.push(
      createReason(
        'no-assertions',
        'assertionSpecificity',
        'negative',
        20,
        'The generated test has no load-bearing assertions yet.'
      )
    )
  }

  if (signals.strongAssertionCount > 0) {
    reasons.push(
      createReason(
        'strong-assertions',
        'assertionSpecificity',
        'positive',
        8,
        `Strong matcher usage covers ${signals.strongAssertionCount} assertion(s).`
      )
    )
  }

  if (signals.placeholderRenderTarget) {
    reasons.push(
      createReason(
        'placeholder-render-target',
        'testStructure',
        'negative',
        25,
        'The generated test still renders <App /> instead of a resolved repo target.'
      )
    )
  }

  if (signals.boundaryWarningCount > 0) {
    reasons.push(
      createReason(
        'boundary-warnings',
        'testStructure',
        'negative',
        20,
        'Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.'
      )
    )
  }

  if (signals.multipleTestBlocks && dimensions.testStructure >= 70) {
    reasons.push(
      createReason(
        'multiple-tests',
        'testStructure',
        'positive',
        6,
        'The suite is organized into multiple test blocks where the flow allows it.'
      )
    )
  }

  if (signals.boundaryIssueCount > 0) {
    for (const [index, message] of boundaryMessages.slice(0, 2).entries()) {
      reasons.push(
        createReason(
          `boundary-issue-${index + 1}`,
          'boundaryIsolation',
          'negative',
          10 - index,
          message
        )
      )
    }
  }

  if (markerQualityGate.failing) {
    reasons.push(
      createReason(
        'marker-quality-gate-fail',
        'assertionSpecificity',
        'negative',
        45,
        `QUAL-02 failed: ${markerQualityGate.message}`
      )
    )
  } else if (markerQualityGate.reason === 'markers-converted') {
    reasons.push(
      createReason(
        'marker-quality-gate-pass',
        'assertionSpecificity',
        'positive',
        8,
        `QUAL-02 passed: ${markerQualityGate.message}`
      )
    )
  } else {
    reasons.push(
      createReason(
        'marker-quality-gate-pass-no-markers',
        'assertionSpecificity',
        'positive',
        4,
        `QUAL-02 passed: ${markerQualityGate.message}`
      )
    )
  }

  return reasons.sort(compareReasons)
}

function deriveBlockers(reasons: ScoreReason[], limit = 2): string[] {
  return reasons
    .filter((reason) => reason.impact === 'negative')
    .sort(compareReasons)
    .slice(0, limit)
    .map((reason) => reason.message)
}

export function calculateAggregateScore(
  dimensions: ScoreDimensions
): Pick<ScoreResult, 'total' | 'grade'> {
  const total = clampScore(
    dimensions.queryQuality * 0.3 +
      dimensions.assertionSpecificity * 0.25 +
      dimensions.testStructure * 0.2 +
      dimensions.boundaryIsolation * 0.25
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

export interface ScoreGeneratedTestOptions {
  queryResults?: QueryResult[]
  markerCoverage?: Partial<MarkerCoverageTotals>
}

function resolveMarkerCoverage(
  markerCoverage?: Partial<MarkerCoverageTotals>
): MarkerCoverageTotals {
  return {
    detected: normalizeCount(markerCoverage?.detected),
    emitted: normalizeCount(markerCoverage?.emitted),
    unresolved: normalizeCount(markerCoverage?.unresolved),
  }
}

function deriveMarkerQualityGate(
  markerCoverage: MarkerCoverageTotals
): MarkerQualityGateState {
  if (markerCoverage.detected === 0) {
    return {
      status: 'pass',
      reason: 'no-markers-detected',
      failing: false,
      message: 'No semantic markers were detected in this run.',
    }
  }

  if (markerCoverage.emitted === 0) {
    return {
      status: 'fail',
      reason: 'zero-marker-conversion',
      failing: true,
      message: 'Semantic markers were detected, but no marker-derived assertions were emitted.',
    }
  }

  return {
    status: 'pass',
    reason: 'markers-converted',
    failing: false,
    message: 'Marker-derived assertions were emitted for this run.',
  }
}

function resolveScoreGeneratedTestOptions(
  input: QueryResult[] | ScoreGeneratedTestOptions | undefined
): {
  queryResults: QueryResult[]
  markerCoverage: MarkerCoverageTotals
} {
  if (Array.isArray(input)) {
    return {
      queryResults: input,
      markerCoverage: resolveMarkerCoverage(),
    }
  }

  if (input && typeof input === 'object') {
    return {
      queryResults: input.queryResults ?? [],
      markerCoverage: resolveMarkerCoverage(input.markerCoverage),
    }
  }

  return {
    queryResults: [],
    markerCoverage: resolveMarkerCoverage(),
  }
}

export function scoreGeneratedTest(
  code: string,
  input: QueryResult[] | ScoreGeneratedTestOptions = []
): ScoreResult {
  const { queryResults, markerCoverage } = resolveScoreGeneratedTestOptions(input)
  const markerQualityGate = deriveMarkerQualityGate(markerCoverage)
  const boundaryIssues = analyzeBoundaryIsolation(code)
  const boundaryIsolation = calculateBoundaryIsolationScore(code)
  const signals = collectSignals(code, queryResults, boundaryIssues.length)
  const queryCheckpointPenalty = Math.min(40, signals.queryCheckpointCount * 3)

  const dimensions: ScoreDimensions = {
    queryQuality: clampScore(calculateQueryScore(queryResults) - queryCheckpointPenalty),
    assertionSpecificity: calculateAssertionScore(code),
    testStructure: calculateStructureScore(code),
    boundaryIsolation,
  }
  const reasons = collectReasons(
    dimensions,
    signals,
    boundaryIssues.map((issue) => issue.message),
    markerQualityGate
  )
  const blockers = deriveBlockers(reasons)
  const aggregate = calculateAggregateScore(dimensions)

  return {
    ...aggregate,
    dimensions,
    signals,
    reasons,
    blockers,
    requiresReview: aggregate.total < 80 || markerQualityGate.failing,
    markerCoverage,
    markerQualityGate,
  }
}
