/**
 * Quality scoring types for test evaluation
 */

export interface QualityCriteria {
  structure: number; // 0-100: has describe/test blocks
  queries: number; // 0-100: robust vs fragile queries
  matchers: number; // 0-100: has meaningful assertions
  noFragility: number; // 0-100: no CSS selectors/test IDs as primary
}

export interface QualityIssue {
  type: "structure" | "queries" | "matchers" | "fragility";
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}

export interface QualityScore {
  overall: number; // 0-100 weighted score
  criteria: QualityCriteria; // Breakdown by category
  issues: QualityIssue[]; // Detailed issues found
  passed: boolean; // Whether quality gates passed
}

export interface ScoringResult {
  score: QualityScore;
  code: string;
  timestamp: number;
}
