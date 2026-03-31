export type ExistingTestGradeLetter = "A" | "B" | "C" | "D" | "F";

export interface ExistingTestGradeDimensions {
  robustness: number;
  readability: number;
  assertionStrength: number;
  mockFidelity: number;
  maintainability: number;
}

export interface ExistingTestGradeReason {
  code: string;
  dimension: keyof ExistingTestGradeDimensions;
  impact: "positive" | "negative";
  weight: number;
  message: string;
  severity?: "advisory" | "blocker";
}

export interface ExistingTestGradeSignals {
  roleQueryCount: number;
  labelQueryCount: number;
  placeholderQueryCount: number;
  textQueryCount: number;
  testIdQueryCount: number;
  querySelectorCount: number;
  positionalRoleQueryCount: number;
  payloadAssertionCount: number;
  strongAssertionCount: number;
  presenceAssertionCount: number;
  visibilityAssertionCount: number;
  mockCallAssertionCount: number;
  sharedMockImportCount: number;
  setupHelperCount: number;
  renderHelperImportCount: number;
  beforeEachCount: number;
  mockResetCount: number;
  lineCount: number;
}

export interface ExistingTestGradeResult {
  total: number;
  grade: ExistingTestGradeLetter;
  dimensions: ExistingTestGradeDimensions;
  signals: ExistingTestGradeSignals;
  reasons: ExistingTestGradeReason[];
  blockers: string[];
  requiresReview: boolean;
}
