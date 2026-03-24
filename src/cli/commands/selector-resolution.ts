import pc from "picocolors";

import type { SelectorDebugReporter } from "#cli/commands/generate-runtime-types.ts";
import type { CaptureVisualStateAuthOptions } from "#core/resolver.ts";
import {
  createPageInspector,
  openCapturePage,
  replayStep,
  resolveSelector,
  urlsMateriallyDiffer,
} from "#core/resolver.ts";
import type {
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  SelectorDescriptor,
  SelectorResolutionPhase,
  SelectorResolutionResult,
  StepId,
  UnresolvedSelectorResolutionResult,
} from "#types/recording.ts";

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

function queryDescriptorToResult(descriptor: QueryDescriptor): QueryResult {
  return {
    query: descriptor.raw ?? descriptor.target ?? descriptor.method,
    quality: descriptor.quality ?? "fragile",
    method: descriptor.method,
    line: descriptor.line,
  };
}

export function isQueryDescriptor(value: unknown): value is QueryDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof value.method === "string"
  );
}

function getStepQueryDescriptor(
  step: NormalizedStep
): QueryDescriptor | undefined {
  const query = step.metadata?.query;
  return isQueryDescriptor(query) ? query : undefined;
}

function groupSelectorsByStepId(
  selectors: SelectorDescriptor[]
): Map<StepId, SelectorDescriptor[]> {
  const grouped = new Map<StepId, SelectorDescriptor[]>();

  for (const selector of selectors) {
    const current = grouped.get(selector.stepId) ?? [];
    current.push(selector);
    grouped.set(selector.stepId, current);
  }

  return grouped;
}

export function mergeSelectorResolutionWarnings<
  T extends SelectorResolutionResult,
>(resolution: T, warnings: string[]): T {
  const mergedWarnings = Array.from(
    new Set([...resolution.warnings, ...warnings])
  );
  if (mergedWarnings.length === resolution.warnings.length) {
    return resolution;
  }

  return { ...resolution, warnings: mergedWarnings };
}

function applySelectorResolution(
  step: NormalizedStep,
  resolution: SelectorResolutionResult
): NormalizedStep {
  return {
    ...step,
    metadata: {
      ...step.metadata,
      selectorResolution: resolution,
      ...(resolution.status === "resolved" ? { query: resolution.query } : {}),
    },
  };
}

function toUnexpectedPageSelectorResolution(params: {
  actualUrl: string;
  expectedUrl: string;
  phase: SelectorResolutionPhase;
  selector: SelectorDescriptor;
}): UnresolvedSelectorResolutionResult {
  const { actualUrl, expectedUrl, phase, selector } = params;
  const reason =
    `Playwright replay page did not reach the recorded URL. ` +
    `Expected ${expectedUrl}, reached ${actualUrl}.`;

  return {
    debug: {
      cssSelector: selector.selector,
      inspectSource: "persistent-page",
      pageUrl: actualUrl,
      phase,
      reason,
      result: "unresolved",
    },
    status: "unresolved",
    outcome: "unexpected-page",
    stepId: selector.stepId,
    selector,
    url: actualUrl,
    reason,
    warnings: [reason],
  };
}

function canSuccessfulReplayRevealAdditionalState(
  step: NormalizedStep
): boolean {
  return (
    step.action === "click" ||
    step.action === "fill" ||
    step.action === "select" ||
    step.action === "navigate" ||
    step.action === "keyDown"
  );
}

function rehydrateItGroups(
  itGroups: ItGroup[],
  steps: NormalizedStep[]
): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) =>
      step.id ? (stepMap.get(step.id) ?? step) : step
    ),
  }));
}

export function dedupeQueryResults(queryResults: QueryResult[]): QueryResult[] {
  const seen = new Set<string>();

  return queryResults.filter((queryResult) => {
    const key = `${queryResult.method}:${queryResult.query}:${queryResult.line ?? "na"}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function resolveJsGeneration(
  recording: NormalizedRecording,
  itGroups: ItGroup[],
  options?: {
    auth?: CaptureVisualStateAuthOptions | null;
    debugReporter?: SelectorDebugReporter;
  }
): Promise<{
  itGroups: ItGroup[];
  queryResults: QueryResult[];
  recording: NormalizedRecording;
  warnings: string[];
}> {
  const baseline = recording.baseline;
  if (!baseline) {
    return { itGroups, queryResults: [], recording, warnings: [] };
  }

  const queryResults = baseline.queries.map(queryDescriptorToResult);
  const warnings: string[] = [];
  const selectorGroups = groupSelectorsByStepId(baseline.selectors);
  const stepMap = new Map(
    recording.steps
      .filter((step): step is NormalizedStep & { id: StepId } =>
        Boolean(step.id)
      )
      .map((step) => [step.id, step])
  );
  const updatedSteps = new Map<StepId, NormalizedStep>();

  const hasSelectorsToResolve = selectorGroups.size > 0;
  const hasUrl = Boolean(recording.url);
  const debugReporter = options?.debugReporter;

  if (hasSelectorsToResolve && hasUrl) {
    log(
      pc.dim("[taro]") +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright with step replay...`
    );

    const selectorStepIds = new Set(selectorGroups.keys());
    let browser: import("playwright").Browser | null = null;

    try {
      const authOptions = options?.auth ?? undefined;
      const captureSession = await openCapturePage({
        auth: authOptions,
        headless: true,
        timeoutMs: 10000,
        url: recording.url!,
      });
      browser = captureSession.browser;
      const page = captureSession.page;
      const inspect = createPageInspector(page);
      const unresolvedSelectorResolutions = new Map<
        StepId,
        UnresolvedSelectorResolutionResult
      >();
      const replayPageUrl =
        typeof page.url === "function" ? page.url() : recording.url!;

      const resolveStepSelectors = async (
        stepId: StepId,
        phase: SelectorResolutionPhase
      ): Promise<{ resolved: number }> => {
        const selectors = selectorGroups.get(stepId)!;
        const currentStep = updatedSteps.get(stepId) ?? stepMap.get(stepId)!;

        const preservedQuery = getStepQueryDescriptor(currentStep);
        const stepWarnings: string[] = [];
        let chosenResolution: SelectorResolutionResult | undefined;

        if (preservedQuery) {
          chosenResolution = await resolveSelector(selectors[0]!, {
            debug: { inspectSource: "preserved-query", phase },
            url: recording.url,
            preservedQuery,
          });
          debugReporter?.traceSelector(chosenResolution);
        } else {
          for (const selector of selectors) {
            const resolution = await resolveSelector(selector, {
              debug: { inspectSource: "persistent-page", phase },
              url: recording.url,
              inspect,
            });
            debugReporter?.traceSelector(resolution);

            if (resolution.status === "resolved") {
              chosenResolution = resolution;
              break;
            }

            stepWarnings.push(...resolution.warnings);
            chosenResolution ??= resolution;
          }
        }

        const resolution = mergeSelectorResolutionWarnings(
          chosenResolution!,
          stepWarnings
        );
        updatedSteps.set(
          stepId,
          applySelectorResolution(currentStep, resolution)
        );

        if (resolution.status === "resolved") {
          unresolvedSelectorResolutions.delete(stepId);
          if (resolution.outcome !== "preserved-query") {
            queryResults.push(queryDescriptorToResult(resolution.query));
          }
          return { resolved: 1 };
        }

        unresolvedSelectorResolutions.set(stepId, resolution);
        return { resolved: 0 };
      };

      if (urlsMateriallyDiffer(recording.url!, replayPageUrl)) {
        const mismatchWarning =
          `Step replay skipped: replay page did not reach the recorded URL. ` +
          `Expected ${recording.url!}, reached ${replayPageUrl}.`;
        debugReporter?.traceBrowserFailure({
          authStrategy: options?.auth?.strategy,
          error: mismatchWarning,
          url: recording.url!,
        });
        console.warn(pc.yellow("[taro]") + ` ${mismatchWarning}`);

        for (const [stepId, selectors] of selectorGroups.entries()) {
          const currentStep = updatedSteps.get(stepId) ?? stepMap.get(stepId);
          if (!currentStep) {
            continue;
          }

          const stepWarnings: string[] = [];
          let chosenResolution: UnresolvedSelectorResolutionResult | undefined;
          for (const selector of selectors) {
            const resolution = toUnexpectedPageSelectorResolution({
              actualUrl: replayPageUrl,
              expectedUrl: recording.url!,
              phase: "fallback-no-replay",
              selector,
            });
            debugReporter?.traceSelector(resolution);
            stepWarnings.push(...resolution.warnings);
            chosenResolution ??= resolution;
          }

          const resolution = mergeSelectorResolutionWarnings(
            chosenResolution!,
            stepWarnings
          );
          updatedSteps.set(
            stepId,
            applySelectorResolution(currentStep, resolution)
          );
          unresolvedSelectorResolutions.set(stepId, resolution);
        }
      } else {
        for (const step of recording.steps) {
          const stepId = step.id;
          let selectorsResolvedThisStep = 0;

          if (stepId && selectorStepIds.has(stepId)) {
            const stats = await resolveStepSelectors(stepId, "pre-step");
            selectorsResolvedThisStep += stats.resolved;
          }

          const replayResult = await replayStep(page, step, {
            collectDebug: debugReporter?.enabled,
          });
          debugReporter?.traceReplay(replayResult.debug);
          if (!replayResult.replayed && replayResult.warning) {
            console.warn(
              pc.yellow("[taro]") +
                pc.dim(" Step replay: ") +
                replayResult.warning
            );
          }

          if (
            replayResult.replayed &&
            canSuccessfulReplayRevealAdditionalState(step) &&
            unresolvedSelectorResolutions.size > 0
          ) {
            for (const unresolvedStepId of unresolvedSelectorResolutions.keys()) {
              const stats = await resolveStepSelectors(
                unresolvedStepId,
                "post-step"
              );
              selectorsResolvedThisStep += stats.resolved;
            }
          }

          debugReporter?.traceStepSummary({
            action: step.action,
            replayed: replayResult.replayed,
            selectorsResolved: selectorsResolvedThisStep,
            selectorsStillUnresolved: unresolvedSelectorResolutions.size,
            stepId: stepId ?? "(unknown)",
            warningCount: replayResult.warning ? 1 : 0,
          });
        }
      }

      for (const resolution of unresolvedSelectorResolutions.values()) {
        warnings.push(
          `QRY-03 [${resolution.stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      debugReporter?.traceBrowserFailure({
        authStrategy: options?.auth?.strategy,
        error: message,
        url: recording.url!,
      });
      console.warn(
        pc.yellow("[taro]") +
          ` Step replay browser failed: ${message}. Selectors will remain unresolved.`
      );
    } finally {
      await browser?.close().catch(() => undefined);
    }
  } else if (hasSelectorsToResolve) {
    log(
      pc.dim("[taro]") +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright...`
    );

    for (const [stepId, selectors] of selectorGroups) {
      const step = updatedSteps.get(stepId) ?? stepMap.get(stepId);
      if (!step) {
        continue;
      }

      const preservedQuery = getStepQueryDescriptor(step);
      const stepWarnings: string[] = [];
      let chosenResolution: SelectorResolutionResult | undefined;

      if (preservedQuery) {
        chosenResolution = await resolveSelector(selectors[0]!, {
          debug: {
            inspectSource: "preserved-query",
            phase: "fallback-no-replay",
          },
          url: recording.url,
          preservedQuery,
        });
        debugReporter?.traceSelector(chosenResolution);
      } else {
        for (const selector of selectors) {
          const resolution = await resolveSelector(selector, {
            debug: {
              inspectSource: "fresh-browser",
              phase: "fallback-no-replay",
            },
            url: recording.url,
          });
          debugReporter?.traceSelector(resolution);

          if (resolution.status === "resolved") {
            chosenResolution = resolution;
            break;
          }

          stepWarnings.push(...resolution.warnings);
          chosenResolution ??= resolution;
        }
      }

      const resolution = mergeSelectorResolutionWarnings(
        chosenResolution!,
        stepWarnings
      );
      updatedSteps.set(stepId, applySelectorResolution(step, resolution));

      if (resolution.status === "resolved") {
        if (resolution.outcome !== "preserved-query") {
          queryResults.push(queryDescriptorToResult(resolution.query));
        }
        continue;
      }

      warnings.push(
        `QRY-03 [${stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
      );
    }
  }

  const resolvedSteps = recording.steps.map((step) =>
    step.id ? (updatedSteps.get(step.id) ?? step) : step
  );

  return {
    itGroups: rehydrateItGroups(itGroups, resolvedSteps),
    queryResults: dedupeQueryResults(queryResults),
    recording: {
      ...recording,
      baseline: {
        ...baseline,
        itGroups: rehydrateItGroups(baseline.itGroups, resolvedSteps),
      },
      steps: resolvedSteps,
    },
    warnings,
  };
}

export function summarizeSelectorWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`));
  }
}
