import type { TestFileContent } from "#core/convention-intelligence.ts";
import type {
  TaroOverrides,
  TaroPackageProfile,
  TaroPlaywrightAuthDetectedAt,
  TaroState,
  TaroStateSummary,
} from "#types/state.ts";

export interface PackageDescriptor {
  key: string;
  root: string;
  name: string | null;
}

export interface ScanStateOptions {
  detectedAt?: TaroPlaywrightAuthDetectedAt;
  preserveGeneratedTests?: boolean;
  existingState?: TaroState | null;
}

export interface ScanStateResult {
  state: TaroState;
  summary: TaroStateSummary;
}

export interface ReadStateDiagnostics {
  state: TaroState | null;
  warnings: string[];
}

export interface ReadOverridesDiagnostics {
  overrides: TaroOverrides;
  warnings: string[];
}

export interface LoadedLegacyStateResult {
  state: TaroState | null;
  migratedLegacyState: boolean;
  warnings: string[];
}

export interface ScanStateMachineContext {
  projectRoot: string;
  options: ScanStateOptions;
  detectedAt: TaroPlaywrightAuthDetectedAt | null;
  loadedLegacy: LoadedLegacyStateResult | null;
  overridesDiagnostics: ReadOverridesDiagnostics | null;
  now: string | null;
  generatedHistoryForLearning: TaroState["generatedTests"] | null;
  testFiles: TestFileContent[] | null;
  packageDescriptors: PackageDescriptor[] | null;
  packages: Record<string, TaroPackageProfile> | null;
  result: ScanStateResult | null;
  error: Error | null;
}

export interface PrepareScanActorOutput {
  detectedAt: TaroPlaywrightAuthDetectedAt;
  loadedLegacy: LoadedLegacyStateResult;
  overridesDiagnostics: ReadOverridesDiagnostics;
  now: string;
  generatedHistoryForLearning: TaroState["generatedTests"];
}

export type PrepareScanActorInput = Pick<
  ScanStateMachineContext,
  "projectRoot" | "options"
>;

export type ReadRepoInventoryActorInput = Pick<
  ScanStateMachineContext,
  "projectRoot"
>;

export interface ReadRepoInventoryActorOutput {
  testFiles: TestFileContent[];
  packageDescriptors: PackageDescriptor[];
}

export type BuildPackagesActorInput = Pick<
  ScanStateMachineContext,
  | "projectRoot"
  | "detectedAt"
  | "loadedLegacy"
  | "generatedHistoryForLearning"
  | "testFiles"
  | "packageDescriptors"
>;

export interface BuildPackagesActorOutput {
  packages: Record<string, TaroPackageProfile>;
}

export type FinalizeScanActorInput = Pick<
  ScanStateMachineContext,
  | "projectRoot"
  | "options"
  | "loadedLegacy"
  | "overridesDiagnostics"
  | "now"
  | "generatedHistoryForLearning"
  | "packages"
>;

export interface FinalizeScanActorOutput {
  result: ScanStateResult;
}

export interface LoadOrBootstrapStateMachineContext {
  projectRoot: string;
  existingStateDiagnostics: ReadStateDiagnostics | null;
  overridesDiagnostics: ReadOverridesDiagnostics | null;
  shouldRefreshExistingState: boolean;
  existingResult: ScanStateResult | null;
  loadedLegacy: LoadedLegacyStateResult | null;
  scanResult: ScanStateResult | null;
  result: ScanStateResult | null;
  error: Error | null;
}

export type ReadBootstrapDiagnosticsActorInput = Pick<
  LoadOrBootstrapStateMachineContext,
  "projectRoot"
>;

export interface ReadBootstrapDiagnosticsActorOutput {
  existingStateDiagnostics: ReadStateDiagnostics;
  overridesDiagnostics: ReadOverridesDiagnostics;
  shouldRefreshExistingState: boolean;
  existingResult: ScanStateResult | null;
}

export type LoadLegacyStateActorInput = Pick<
  LoadOrBootstrapStateMachineContext,
  "projectRoot"
>;

export interface LoadLegacyStateActorOutput {
  loadedLegacy: LoadedLegacyStateResult;
}

export interface RunScanActorInput {
  projectRoot: string;
  options: ScanStateOptions;
}

export interface RunScanActorOutput {
  result: ScanStateResult;
}

export interface WriteStateActorInput {
  projectRoot: string;
  state: TaroState;
}
