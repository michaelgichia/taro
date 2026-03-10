export interface ScoreDimensions {
  queryQuality: number
  assertionSpecificity: number
  testStructure: number
  boundaryIsolation: number
}

export interface ScoreSignals {
  queryCheckpointCount: number
  roleQueryCount: number
  testIdQueryCount: number
  strongAssertionCount: number
  weakAssertionCount: number
  boundaryWarningCount: number
  boundaryIssueCount: number
  placeholderRenderTarget: boolean
  multipleTestBlocks: boolean
}

export interface ScoreReason {
  code: string
  dimension: keyof ScoreDimensions
  impact: 'positive' | 'negative'
  weight: number
  message: string
}

export interface ScoreResult {
  total: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  dimensions: ScoreDimensions
  signals: ScoreSignals
  reasons: ScoreReason[]
  blockers: string[]
  requiresReview: boolean
}

export interface HistoryEntry {
  timestamp: string
  recordingFile: string
  score: number
  grade: string
  dimensions: ScoreDimensions
}
