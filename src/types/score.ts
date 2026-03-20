import type {
  TaroBoundaryGuardrailReason,
  TaroBoundaryKind,
} from "#types/state.ts";

export interface ScoreDimensions {
  queryQuality: number;
  assertionSpecificity: number;
  testStructure: number;
  boundaryIsolation: number;
}

export type ScoreImportKind = TaroBoundaryKind | "asset" | "helper" | "hook";

export interface ScoreImportReference {
  target: string;
  importedNames: string[];
  kind: ScoreImportKind;
  guardrailReason: TaroBoundaryGuardrailReason | null;
}

export type HighSignalBranchFamily =
  | "null-or-missing-mapped-values"
  | "unknown-mapping-fallback"
  | "split-loading-flags"
  | "display-name-fallback"
  | "role-gated-prop-propagation";

export interface HighSignalBranchHint {
  family: HighSignalBranchFamily;
  coverageTokens: string[];
}

export interface ComponentScoreContext {
  componentDisplayName?: string;
  componentConditionalCount?: number;
  componentEventHandlerCount?: number;
  componentImportReferences?: ScoreImportReference[];
  exportedUtilityNames?: string[];
  dynamicImportTargets?: string[];
  highSignalBranchHints?: HighSignalBranchHint[];
}

export interface ScoreSignals {
  queryCheckpointCount: number;
  roleQueryCount: number;
  testIdQueryCount: number;
  strongAssertionCount: number;
  presenceAssertionCount: number;
  visibilityAssertionCount: number;
  visibilityOnlyTestCount: number;
  presenceOnlyTestCount: number;
  boundaryWarningCount: number;
  boundaryIssueCount: number;
  placeholderRenderTarget: boolean;
  multipleTestBlocks: boolean;
  minimumExpectedTestCount: number;
  branchCoverageRatio: number;
  missingMockCount: number;
  fireEventCount: number;
  hasBasePropsConstant: boolean;
  hasOverrideRenderHelper: boolean;
  duplicatedInlineRenderCount: number;
  hasStandaloneUtilityDescribe: boolean;
}

export interface ScoreReason {
  code: string;
  dimension: keyof ScoreDimensions;
  impact: "positive" | "negative";
  weight: number;
  message: string;
  severity?: "advisory" | "blocker";
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

export interface ScoreGeneratedTestOptions extends ComponentScoreContext {
  queryResults?: import("#types/recording.ts").QueryResult[];
  markerCoverage?: Partial<MarkerCoverageTotals>;
  markerDiagnostics?: Partial<MarkerReviewDiagnostics>;
}

export interface HistoryEntry {
  timestamp: string;
  recordingFile: string;
  score: number;
  grade: string;
  dimensions: ScoreDimensions;
}
