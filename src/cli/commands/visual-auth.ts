import { resolve } from "node:path";

import pc from "picocolors";

import { logToStderr as log } from "#cli/commands/log.ts";
import {
  resolveOptionalFilePath,
  resolveVisualAuthStorageStatePath,
} from "#cli/commands/generate-paths.ts";
import {
  collectExpectedLandmarks,
  findExpectedPageTitle,
} from "#cli/commands/generate-recording.ts";
import { findVisualCaptureCandidates } from "#core/recording-intelligence.ts";
import { captureVisualState } from "#core/resolver.ts";
import { persistPlaywrightAuthProfile } from "#core/state.ts";
import type {
  AnalyzedRecording,
  NormalizedRecording,
  VisualState,
} from "#types/recording.ts";
import type { TaroPlaywrightAuthProfile } from "#types/state.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";

export const MANUAL_VISUAL_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

type AuthPreflightStatus =
  | "not_required"
  | "unknown_recipe"
  | "authenticated"
  | "failed";

function resolveVisualCaptureScreenshotDir(projectRoot: string): string {
  return resolve(projectRoot, ".taro", "playwright", "screenshots");
}

function resolveAuthPreflightStatus(params: {
  auth: TaroPlaywrightAuthProfile | null;
  url?: string;
  visualState: VisualState | null;
}): AuthPreflightStatus | null {
  const { auth, url, visualState } = params;
  if (!url || !visualState) {
    return null;
  }

  switch (visualState.status) {
    case "auth-recovered":
      return "authenticated";
    case "auth-recovery-failed":
    case "auth-recovery-timed-out":
      return "failed";
    case "auth-interrupted":
      return auth ? "failed" : "unknown_recipe";
    case "captured":
      return auth ? "authenticated" : "not_required";
    case "capture-failed":
      return null;
  }
}

export function hasInteractiveVisualAuthCapability(
  context: { input?: { isTTY?: boolean }; output?: { isTTY?: boolean } } = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean(context.input?.isTTY && context.output?.isTTY)
  );
}

export function summarizeAuthPreflight(params: {
  auth: TaroPlaywrightAuthProfile | null;
  url?: string;
  visualState: VisualState | null;
}): void {
  const status = resolveAuthPreflightStatus(params);
  if (!status) {
    return;
  }

  log(pc.dim("[taro]") + ` Auth status: ${status}`);
}

export function summarizePlaywrightAuth(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile?.playwrightAuth) {
    return;
  }

  log(
    pc.dim("[taro]") +
      ` Visual auth: ${packageProfile.playwrightAuth.strategy}=${packageProfile.playwrightAuth.path} (${packageProfile.playwrightAuth.source})`
  );
}

function summarizeVisualStateWarnings(visualState: VisualState): void {
  for (const warning of visualState.warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`));
  }
}

function summarizeAuthCheckpointScreenshot(visualState: VisualState): void {
  if (visualState.screenshotPath) {
    log(
      pc.dim("[taro]") +
        ` Auth checkpoint screenshot: ${visualState.screenshotPath}`
    );
  }
}

function summarizeStartingPointScreenshot(visualState: VisualState): void {
  if (visualState.screenshotPath) {
    log(
      pc.dim("[taro]") +
        ` Starting point screenshot: ${visualState.screenshotPath}`
    );
  }
}

function summarizeAuthInterruptedVisualState(visualState: VisualState): void {
  const interrupt = visualState.interrupt;
  console.warn(
    pc.yellow(
      "[taro] Visual context unavailable: authentication required before reaching the target UI."
    )
  );

  if (interrupt) {
    console.warn(
      pc.yellow("[taro]") +
        ` Reached: ${interrupt.reachedUrl}${interrupt.actualTitle ? ` (${interrupt.actualTitle})` : ""}`
    );
    if (interrupt.expectedUrl) {
      console.warn(pc.yellow("[taro]") + ` Expected: ${interrupt.expectedUrl}`);
    }
    if (interrupt.expectedTitle) {
      console.warn(
        pc.yellow("[taro]") + ` Expected title: ${interrupt.expectedTitle}`
      );
    }
    console.warn(
      pc.yellow("[taro]") + ` Signals: ${interrupt.signals.join(", ")}`
    );
    if (interrupt.strategy === "storageState" && interrupt.path) {
      console.warn(
        pc.yellow("[taro]") +
          ` Reuse or replace the saved storage state with --auth ${interrupt.path}.`
      );
    } else if (interrupt.strategy === "instructions" && interrupt.path) {
      console.warn(
        pc.yellow("[taro]") +
          ` Review the saved auth instructions at ${interrupt.path}, or provide --auth for automatic session injection.`
      );
    } else {
      console.warn(
        pc.yellow("[taro]") +
          " Options: --auth <storageState.json>, --instructions <auth.md>, or --no-screenshots."
      );
    }
  }

  summarizeAuthCheckpointScreenshot(visualState);
}

function summarizeRecoveredVisualState(visualState: VisualState): void {
  log(pc.dim("[taro]") + " Visual auth recovered via Playwright runtime.");
  if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
    const retryAttemptCount =
      visualState.authRecovery.retryToExpectedUrl.attemptCount ?? 1;
    const retryLabel =
      retryAttemptCount === 1 ? "once" : `${retryAttemptCount} times`;
    log(
      pc.dim("[taro]") +
        ` Retried recorded URL ${retryLabel} after auth recovery: ${visualState.authRecovery.retryToExpectedUrl.targetUrl}`
    );
  }
  if (visualState.startingPointConfirmed) {
    log(
      pc.dim("[taro]") + ` Starting point confirmed: ${visualState.finalUrl}`
    );
  }
  if (visualState.authRecovery?.persistedAuthPath) {
    log(
      pc.dim("[taro]") +
        ` Saved Playwright storageState: ${visualState.authRecovery.persistedAuthPath}`
    );
  }

  summarizeStartingPointScreenshot(visualState);
}

function summarizeFailedAuthRecoveryVisualState(
  visualState: VisualState
): void {
  const label =
    visualState.status === "auth-recovery-timed-out"
      ? "Playwright authentication timed out."
      : "Playwright authentication could not be completed.";
  console.warn(pc.yellow(`[taro] ${label}`));
  if (visualState.authRecovery?.instructionsPath) {
    console.warn(
      pc.yellow("[taro]") +
        ` Visual auth instructions: ${visualState.authRecovery.instructionsPath}`
    );
  }
  if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
    const retry = visualState.authRecovery.retryToExpectedUrl;
    const retryAttemptCount = retry.attemptCount ?? 1;
    const retryLabel =
      retryAttemptCount === 1 ? "once" : `${retryAttemptCount} times`;
    const failureDetail =
      retry.outcome === "failed" && retry.error ? ` (${retry.error})` : "";
    console.warn(
      pc.yellow("[taro]") +
        ` Retried recorded URL ${retryLabel} after auth recovery: ${retry.targetUrl}${failureDetail}`
    );
  }
  if (visualState.authRecovery?.persistedAuthPath) {
    console.warn(
      pc.yellow("[taro]") +
        ` Saved Playwright storageState: ${visualState.authRecovery.persistedAuthPath}`
    );
  }

  summarizeAuthCheckpointScreenshot(visualState);
  summarizeVisualStateWarnings(visualState);
}

function summarizeCapturedVisualState(visualState: VisualState): void {
  const parts = [visualState.reason];
  if (visualState.dialog?.title) {
    parts.push(`dialog=${visualState.dialog.title}`);
  }
  if (visualState.startingPointConfirmed) {
    parts.push(`page=${visualState.finalUrl}`);
  }
  if (visualState.screenshotPath && !visualState.startingPointConfirmed) {
    parts.push(`screenshot=${visualState.screenshotPath}`);
  }

  log(pc.dim("[taro]") + ` Visual state: ${parts.join(", ")}`);
  if (visualState.startingPointConfirmed) {
    summarizeStartingPointScreenshot(visualState);
  }
  summarizeVisualStateWarnings(visualState);
}

export function summarizeVisualState(visualState: VisualState | null): void {
  if (!visualState) {
    return;
  }

  if (visualState.status === "capture-failed") {
    summarizeVisualStateWarnings(visualState);
    return;
  }

  if (visualState.status === "auth-interrupted") {
    summarizeAuthInterruptedVisualState(visualState);
    return;
  }

  if (visualState.status === "auth-recovered") {
    summarizeRecoveredVisualState(visualState);
    return;
  }

  if (
    visualState.status === "auth-recovery-failed" ||
    visualState.status === "auth-recovery-timed-out"
  ) {
    summarizeFailedAuthRecoveryVisualState(visualState);
    return;
  }

  summarizeCapturedVisualState(visualState);
}

export async function maybeCaptureVisualState(params: {
  analyzedRecording: AnalyzedRecording;
  auth?: TaroPlaywrightAuthProfile | null;
  authRecovery?: {
    enabled: boolean;
    instructionsPath?: string;
    persistedAuthPath?: string;
    saveStorageStatePath?: string;
    timeoutMs: number;
  };
  projectRoot: string;
  recording: NormalizedRecording;
  selector?: string;
  skipScreenshotArtifacts?: boolean;
  url?: string;
}): Promise<VisualState | null> {
  const {
    analyzedRecording,
    auth,
    authRecovery,
    projectRoot,
    recording,
    selector,
    skipScreenshotArtifacts = false,
    url,
  } = params;
  if (!url) {
    return null;
  }

  const candidates = findVisualCaptureCandidates(analyzedRecording);
  const expected = {
    landmarks: collectExpectedLandmarks(recording),
    title: findExpectedPageTitle(recording),
    url,
  };
  const screenshotDir = skipScreenshotArtifacts
    ? undefined
    : resolveVisualCaptureScreenshotDir(projectRoot);
  const authOptions = auth
    ? { path: resolve(projectRoot, auth.path), strategy: auth.strategy }
    : null;

  if (candidates.length > 0) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: candidates[0]!.reason,
      screenshotDir,
      selector: candidates[0]!.selector,
    });
  }

  if (selector) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: "ambiguous-ui",
      screenshotDir,
      selector,
    });
  }

  return captureVisualState(url, {
    auth: authOptions,
    authRecovery,
    expected,
    reason: "page-context",
    screenshotDir,
  });
}

export async function persistRecoveredVisualAuth(params: {
  packageProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  visualState: VisualState | null;
}): Promise<TaroPlaywrightAuthProfile | null> {
  const { packageProfile, projectRoot, visualState } = params;
  if (!visualState?.authRecovery?.persistedAuthPath) {
    return null;
  }

  const persistedAuth: TaroPlaywrightAuthProfile = {
    strategy: "storageState",
    path: visualState.authRecovery.persistedAuthPath,
    detectedAt: "generate",
    source: "manual",
  };

  if (!packageProfile) {
    console.warn(
      pc.yellow(
        "[taro] Visual auth: storageState was saved, but no package profile was available to persist it in state."
      )
    );
    return persistedAuth;
  }

  try {
    const persisted = await persistPlaywrightAuthProfile(
      projectRoot,
      packageProfile.packagePath,
      persistedAuth
    );
    if (persisted) {
      log(
        pc.dim("[taro]") +
          ` Persisted visual auth for package ${packageProfile.packagePath}: ${persistedAuth.strategy}=${persistedAuth.path}`
      );
    } else {
      console.warn(
        pc.yellow(
          "[taro] Visual auth: storageState was saved, but Taro could not persist it in state."
        )
      );
    }
  } catch {
    console.warn(
      pc.yellow(
        "[taro] Visual auth: storageState was saved, but persisting it in .taro/state.json failed."
      )
    );
  }

  return persistedAuth;
}

export { resolveOptionalFilePath, resolveVisualAuthStorageStatePath };
