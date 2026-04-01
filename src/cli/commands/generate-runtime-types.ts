import type { Finding } from "#core/findings-reporter.ts";
import type { MockAnalysis } from "#core/mock-intelligence.ts";
import type { ReplayStepDebugTrace } from "#core/resolver.ts";
import type {
  runLoadOrBootstrapStateWorkflow,
  readTaroOverrides,
} from "#core/state.ts";
import type { JsSuitePlan } from "#core/suite-planner.ts";
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  QueryResult,
  SelectorResolutionResult,
  VisualState,
} from "#types/recording.ts";
import type { ComponentScoreContext, ScoreResult } from "#types/score.ts";
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroPlaywrightAuthProfile,
  TaroTestRunner,
} from "#types/state.ts";

export interface SelectorDebugReporter {
  enabled: boolean;
  persist(): Promise<void>;
  traceBrowserFailure(record: {
    authStrategy?: string;
    error: string;
    url: string;
  }): void;
  traceReplay(debug?: ReplayStepDebugTrace): void;
  traceSelector(result: SelectorResolutionResult): void;
  traceStepSummary(record: {
    action: string;
    replayed: boolean;
    selectorsResolved: number;
    selectorsStillUnresolved: number;
    stepId: string;
    warningCount: number;
  }): void;
}

export interface RepoContextMatch {
  filePath: string;
  matchedTerms: string[];
  kind: "source" | "test";
  score: number;
}

export interface FlowCoverageSummary {
  totalSteps: number;
  coveredSteps: number;
  coveredStepIds: string[];
  uncoveredStepIds: string[];
}

export interface OutputAssessment {
  flowCoverage: FlowCoverageSummary;
  scoreResult: ScoreResult;
}

export interface ExistingOutputResolution {
  mergeApplied: boolean;
  mergedTestCount: number;
  outputAssessment: OutputAssessment;
  outputCode: string;
  preferredSource: "candidate" | "existing";
  shouldWrite: boolean;
}

export interface GenerateMachineContext {
  filePath: string;
  projectRoot: string;
  stdioContext?: { input?: { isTTY?: boolean }; output?: { isTTY?: boolean } };
  commandOptions: {
    auth?: string;
    debugSelectors?: boolean;
    debugSelectorsJson?: string;
    interactiveAuth?: boolean;
    instructions?: string;
    minScore?: number;
    screenshots?: boolean;
  };
  debugReporter: SelectorDebugReporter;
  findings: Finding[];
  normalizedRecording?: NormalizedRecording;
  defaultOutputPath?: string;
  hadState?: boolean;
  bootstrappedState?: Awaited<ReturnType<typeof runLoadOrBootstrapStateWorkflow>>;
  overrides?: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile?: ResolvedTaroPackageProfile | null;
  explicitAuthPath?: { absolutePath: string; relativePath: string } | null;
  explicitInstructionsPath?: {
    absolutePath: string;
    relativePath: string;
  } | null;
  visualAuth?: TaroPlaywrightAuthProfile | null;
  earlyAnalyzedRecording?: AnalyzedRecording;
  recordingUrl?: string;
  visualState?: VisualState | null;
  contextMatches?: RepoContextMatch[];
  contextProfileReason?: string | null;
  staleness?: { stale: boolean; reason?: string } | null;
  analyzedRecording?: AnalyzedRecording;
  markerAwareRecording?: NormalizedRecording;
  recoveredVisualAuth?: TaroPlaywrightAuthProfile | null;
  mockAnalysis?: MockAnalysis | null;
  jsSuitePlan?: JsSuitePlan | null;
  outputPath?: string;
  resolvedRenderTargetFile?: string | null;
  boundarySupportPlan?: {
    importLines: string[];
    mockBlocks: string[];
    runner?: TaroTestRunner;
    setupLines: string[];
    supportFiles: Array<{
      path: string;
      content: string;
      lowConfidence: boolean;
    }>;
    warnings: string[];
    requiresReview: boolean;
  };
  generationRenderTarget?: RepoRenderTargetCandidate | null;
  componentScoreContext?: ComponentScoreContext | null;
  generationRenderHelper?: ResolvedTaroPackageProfile["effectiveRenderHelper"];
  resolvedJsGeneration?: {
    itGroups: ItGroup[];
    queryResults: QueryResult[];
    recording: NormalizedRecording;
    warnings: string[];
  };
  generatedCode?: string;
  hydratedSuitePlan?: JsSuitePlan | null;
  scoreResult?: ScoreResult;
  boundaryPolicyWarnings?: string[];
  candidateAssessment?: OutputAssessment;
  existingCode?: string | null;
  existingAssessment?: OutputAssessment | null;
  outputResolution?: ExistingOutputResolution | null;
  shouldOverwrite?: boolean;
  error?: Error;
}

export type ValidateFileActorInput = Pick<GenerateMachineContext, "filePath">;
export type ParseRecordingActorInput = Pick<GenerateMachineContext, "filePath">;
export type LoadStateActorInput = Pick<
  GenerateMachineContext,
  "filePath" | "projectRoot" | "commandOptions"
>;

export interface LoadStateActorOutput {
  hadState: boolean;
  bootstrappedState: Awaited<ReturnType<typeof runLoadOrBootstrapStateWorkflow>>;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile: ResolvedTaroPackageProfile | null;
  defaultOutputPath: string;
  explicitAuthPath: { absolutePath: string; relativePath: string } | null;
  explicitInstructionsPath: {
    absolutePath: string;
    relativePath: string;
  } | null;
  visualAuth: TaroPlaywrightAuthProfile | null;
}

export type CaptureVisualActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "visualAuth"
  | "projectRoot"
  | "stdioContext"
  | "commandOptions"
>;

export type SearchContextActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "visualState"
  | "projectRoot"
  | "defaultOutputPath"
  | "filePath"
>;

export type RefineProfileActorInput = Pick<
  GenerateMachineContext,
  | "bootstrappedState"
  | "packageProfile"
  | "projectRoot"
  | "overrides"
  | "contextMatches"
>;

export interface RefineProfileActorOutput {
  packageProfile: ResolvedTaroPackageProfile | null;
  contextProfileReason: string | null;
  staleness: {
    stale: boolean;
    reason: string | null;
    latestEvidencePath: string | null;
  } | null;
}

export type RefreshProfileActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "contextMatches" | "overrides"
>;

export interface RefreshProfileActorOutput {
  bootstrappedState: Awaited<ReturnType<typeof runLoadOrBootstrapStateWorkflow>>;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile: ResolvedTaroPackageProfile | null;
  contextProfileReason: string | null;
  staleness: {
    stale: boolean;
    reason: string | null;
    latestEvidencePath: string | null;
  } | null;
}

export type AnalyzeRecordingActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "visualState"
  | "visualAuth"
  | "explicitAuthPath"
  | "explicitInstructionsPath"
>;

export type AnalyzeMocksActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "packageProfile"
>;

export type PlanGenerationActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "analyzedRecording"
  | "mockAnalysis"
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "defaultOutputPath"
  | "contextMatches"
  | "visualState"
>;

export interface PlanGenerationActorOutput {
  jsSuitePlan: JsSuitePlan | null;
  outputPath: string;
  resolvedRenderTargetFile: string | null;
  boundarySupportPlan: GenerateMachineContext["boundarySupportPlan"];
  generationRenderTarget: RepoRenderTargetCandidate | null;
  componentScoreContext: ComponentScoreContext | null;
  generationRenderHelper: ResolvedTaroPackageProfile["effectiveRenderHelper"];
}

export type ResolveSelectorsActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "jsSuitePlan"
  | "analyzedRecording"
  | "normalizedRecording"
  | "visualAuth"
  | "projectRoot"
  | "debugReporter"
>;

export type GenerateCodeActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "resolvedJsGeneration"
  | "jsSuitePlan"
  | "outputPath"
  | "packageProfile"
  | "boundarySupportPlan"
  | "generationRenderTarget"
  | "componentScoreContext"
  | "generationRenderHelper"
  | "analyzedRecording"
>;

export interface GenerateCodeActorOutput {
  generatedCode: string;
  hydratedSuitePlan: JsSuitePlan | null;
  scoreResult: ScoreResult;
  boundaryPolicyWarnings: string[];
  candidateAssessment: OutputAssessment;
}

export type AssessOutputActorInput = Pick<
  GenerateMachineContext,
  | "outputPath"
  | "generatedCode"
  | "analyzedRecording"
  | "candidateAssessment"
  | "componentScoreContext"
>;

export type WriteOutputActorInput = Pick<
  GenerateMachineContext,
  "generatedCode" | "outputPath" | "shouldOverwrite" | "boundarySupportPlan"
>;

export type FinalizeActorInput = Pick<
  GenerateMachineContext,
  | "generatedCode"
  | "outputPath"
  | "projectRoot"
  | "filePath"
  | "scoreResult"
  | "packageProfile"
>;

export type RunHealthCommandsActorInput = Pick<
  GenerateMachineContext,
  "overrides" | "projectRoot"
>;
