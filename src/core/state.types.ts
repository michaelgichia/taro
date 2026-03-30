import type { TaroFolderPattern } from "#types/state.ts";

export type AtomicFolderPattern = Exclude<
  TaroFolderPattern,
  "mixed" | "unknown"
>;

export type AtomicFileExtension = "ts" | "js";

export interface GeneratedTestQualityEntry {
  createdAtMs: number;
  overall: number;
  weight: number;
  requiresReview: boolean;
}

export type GeneratedTestQualityIndex = Map<string, GeneratedTestQualityEntry>;

export interface WeightedValueBucket<T extends string> {
  value: T;
  weight: number;
  count: number;
  files: string[];
}

export interface PackageScoreLearningSummary {
  scoredTestFileCount: number;
  unscoredTestFileCount: number;
}

export interface TaroPackageProfileStaleness {
  stale: boolean;
  reason: string | null;
  latestEvidencePath: string | null;
}
