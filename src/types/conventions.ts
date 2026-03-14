/**
 * TypeScript types for project conventions detection (Phase 3).
 */

export type ImportStyle = "esm" | "cjs";
export type MockPattern = "vi.mock" | "jest.mock" | "none";
export type MockRecommendationKind = "inline" | "extract";
export type MutationLifecycleStage = "loading" | "success" | "error";
export type MockInstabilityKind = "recreated-factory" | "per-test-churn";
export type InteractionContractKind = "mutation-form";
export type InteractionCompanionState = "in-flight" | "failed-completion";

export interface ConventionFile {
  path: string;
  importStyle: ImportStyle;
  hasDescribeBlock: boolean;
  mockPattern: MockPattern;
  hasHelperWithExpect: boolean;
}

export interface ConventionsSchema {
  scannedAt: string; // ISO date string
  projectRoot: string;
  importStyle: ImportStyle; // majority convention
  mockPattern: MockPattern; // majority convention
  testFiles: ConventionFile[]; // one entry per discovered test file
  folderPattern: "colocated" | "__tests__" | "mixed" | "unknown";
  fileExtension: "ts" | "tsx" | "js" | "jsx" | "mixed";
}

export interface MockTargetUsage {
  target: string;
  files: string[];
  count: number;
}

export interface MockRecommendation {
  target: string;
  kind: MockRecommendationKind;
  reason: string;
  files: string[];
  count: number;
}

export interface MutationLifecyclePattern {
  file: string;
  stages: MutationLifecycleStage[];
  evidence: string[];
}

export interface InteractionContractPattern {
  file: string;
  kind: InteractionContractKind;
  states: InteractionCompanionState[];
  evidence: string[];
}

export interface MockInstabilityWarning {
  file: string;
  kind: MockInstabilityKind;
  reason: string;
  evidence: string[];
}

export const DEFAULT_CONVENTIONS: ConventionsSchema = {
  scannedAt: "",
  projectRoot: "",
  importStyle: "esm",
  mockPattern: "none",
  testFiles: [],
  folderPattern: "unknown",
  fileExtension: "ts",
};
