import type { Locator } from "playwright";

import type {
  DialogState,
  ElementInfo,
  NormalizedAction,
  QueryDescriptor,
  SelectorResolutionInspectSource,
  SelectorResolutionPhase,
  StepId,
} from "#types/recording.ts";
import type { TaroPlaywrightAuthStrategy } from "#types/state.ts";

export interface FoundSelectorInspectionResult {
  status: "found";
  element: ElementInfo;
}

export interface MissingSelectorInspectionResult {
  status: "selector-not-found";
}

export interface FailedSelectorInspectionResult {
  status: "inspection-failed";
  error: string;
}

export type SelectorInspectionResult =
  | FoundSelectorInspectionResult
  | MissingSelectorInspectionResult
  | FailedSelectorInspectionResult;

export interface ResolveSelectorOptions {
  debug?: {
    inspectSource?: SelectorResolutionInspectSource;
    phase?: SelectorResolutionPhase;
  };
  url?: string;
  preservedQuery?: QueryDescriptor;
  timeoutMs?: number;
  inspect?: (
    url: string,
    cssSelector: string,
    timeoutMs?: number
  ) => Promise<SelectorInspectionResult>;
}

export interface CaptureVisualStateAuthOptions {
  path: string;
  strategy: TaroPlaywrightAuthStrategy;
}

export interface CaptureVisualStateExpectations {
  landmarks?: string[];
  title?: string;
  url?: string;
}

export interface CaptureVisualStateRecoveryOptions {
  enabled: boolean;
  instructionsPath?: string;
  persistedAuthPath?: string;
  saveStorageStatePath?: string;
  timeoutMs: number;
}

export interface CaptureVisualStateOptions {
  auth?: CaptureVisualStateAuthOptions | null;
  authRecovery?: CaptureVisualStateRecoveryOptions;
  expected?: CaptureVisualStateExpectations;
  reason: string;
  screenshotDir?: string;
  selector?: string;
  timeoutMs?: number;
}

export interface VisualPageSnapshot {
  authCheckpoint: {
    authSignals: string[];
    interrupt: boolean;
    matchedLandmarks: string[];
    missingExpectedSelector: boolean;
    missingLandmarks: string[];
    pageTitleMismatch: boolean;
    routeMismatch: boolean;
    reachedUrl: string;
  };
  dialog: DialogState | null;
  element: ElementInfo | null;
  pageTitle: string;
}

export type ReplayLocatorSource =
  | "metadata.selector"
  | "metadata.query"
  | "step.target"
  | "fill.placeholder"
  | "none";

export interface ReplayStepDebugTrace {
  action: NormalizedAction;
  error?: string;
  fallbackLocators?: string[];
  locatorSource: ReplayLocatorSource;
  locatorValue?: string;
  pageTitle?: string;
  pageUrl?: string;
  playwrightAction: string;
  result: "replayed" | "failed" | "skipped";
  stepId?: StepId;
  target?: string;
  timeoutMs: number;
}

export interface ReplayStepResult {
  debug?: ReplayStepDebugTrace;
  replayed: boolean;
  warning?: string;
}

export interface ResolvedStepLocator {
  locator: Locator | null;
  source: ReplayLocatorSource;
  value?: string;
}

export interface SkippedReplaySelector {
  reason: string;
  source: ReplayLocatorSource;
  value: string;
}

export interface PageInspector {
  (
    url: string,
    cssSelector: string,
    timeoutMs?: number
  ): Promise<SelectorInspectionResult>;
}
