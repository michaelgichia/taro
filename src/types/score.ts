export interface ScoreDimensions {
  queryQuality: number;
  assertionSpecificity: number;
  testStructure: number;
  boundaryIsolation: number;
}

export interface ScoreSignals {
  queryCheckpointCount: number;
  roleQueryCount: number;
  testIdQueryCount: number;
  strongAssertionCount: number;
  weakAssertionCount: number;
  boundaryWarningCount: number;
  boundaryIssueCount: number;
  placeholderRenderTarget: boolean;
  multipleTestBlocks: boolean;
}

export interface ScoreReason {
  code: string;
  dimension: keyof ScoreDimensions;
  impact: "positive" | "negative";
  weight: number;
  message: string;
}

export interface MarkerCoverageTotals {
  detected: number;
  emitted: number;
  unresolved: number;
}

export interface MarkerReviewDiagnostics {
  canonicalRecoveries: number;
  placementConflicts: number;
  placementCorrections: number;
}

export type MarkerQualityGateStatus = "pass" | "warn";

export type MarkerQualityGateReason =
  | "no-markers-detected"
  | "markers-fully-converted"
  | "markers-partially-converted"
  | "zero-marker-conversion";

export interface MarkerQualityGateState {
  status: MarkerQualityGateStatus;
  reason: MarkerQualityGateReason;
  failing: boolean;
  message: string;
}

export interface ScoreResult {
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: ScoreDimensions;
  signals: ScoreSignals;
  reasons: ScoreReason[];
  blockers: string[];
  requiresReview: boolean;
  markerCoverage: MarkerCoverageTotals;
  markerDiagnostics: MarkerReviewDiagnostics;
  markerQualityGate: MarkerQualityGateState;
}

export interface HistoryEntry {
  timestamp: string;
  recordingFile: string;
  score: number;
  grade: string;
  dimensions: ScoreDimensions;
}
