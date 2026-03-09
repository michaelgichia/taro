export interface ScoreDimensions {
  queryQuality: number
  assertionSpecificity: number
  testStructure: number
  boundaryIsolation: number
}

export interface ScoreResult {
  total: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  dimensions: ScoreDimensions
}

export interface HistoryEntry {
  timestamp: string
  recordingFile: string
  score: number
  grade: string
  dimensions: ScoreDimensions
}
