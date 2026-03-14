/**
 * Chrome Recorder JSON parsing
 * Parses Chrome Recorder export format and normalizes all step types
 * into a consistent internal representation.
 */

import { readFile } from "node:fs/promises";
import type {
  AssertedEvent,
  ChromeRecorderExport,
  ChromeStep,
  ChromeRecorderSettings,
  StepId,
  NormalizedAction,
  NormalizedRecording,
  NormalizedStep,
} from "../types/recording.js";
import { createStepId } from "../types/recording.js";

function getFirstSelector(selectors?: string[][]): string | undefined {
  if (!selectors || selectors.length === 0) return undefined;
  const first = selectors[0];
  if (!first || first.length === 0) return undefined;
  return first[0];
}

function withMetadata(
  chromeStep: ChromeStep,
  step: Omit<NormalizedStep, "source">
): NormalizedStep {
  const metadata: Pick<
    NormalizedStep,
    "assertedEvents" | "key" | "offsetX" | "offsetY" | "selectors" | "x" | "y"
  > = {
    assertedEvents: chromeStep.assertedEvents as AssertedEvent[] | undefined,
    key: chromeStep.key,
    offsetX: chromeStep.offsetX,
    offsetY: chromeStep.offsetY,
    selectors: chromeStep.selectors,
    x: chromeStep.x,
    y: chromeStep.y,
  };

  return { ...step, ...metadata, source: "json" };
}

export function normalizeStep(chromeStep: ChromeStep): NormalizedStep {
  const target = getFirstSelector(chromeStep.selectors) ?? chromeStep.target;

  const actionMap: Record<string, NormalizedAction> = {
    click: "click",
    doubleClick: "click",
    fill: "fill",
    change: "fill",
    select: "select",
    scroll: "scroll",
    assertElementPresent: "assert",
    assertElementVisible: "assert",
    navigate: "navigate",
    keyDown: "keyDown",
    keyUp: "keyDown",
  };

  const action = actionMap[chromeStep.type];

  if (action !== undefined) {
    switch (action) {
      case "navigate":
        return withMetadata(chromeStep, {
          action,
          target: chromeStep.url,
          originalType: chromeStep.type,
        });
      case "keyDown":
        return withMetadata(chromeStep, {
          action,
          value: chromeStep.key,
          originalType: chromeStep.type,
        });
      case "fill":
      case "select":
      case "assert":
        return withMetadata(chromeStep, {
          action,
          target,
          value: chromeStep.value,
          originalType: chromeStep.type,
        });
      default:
        return withMetadata(chromeStep, {
          action,
          target,
          originalType: chromeStep.type,
        });
    }
  }

  const knownNoOp = new Set([
    "waitForSelector",
    "setViewport",
    "waitForExpression",
  ]);
  if (knownNoOp.has(chromeStep.type)) {
    console.warn(
      `[taro] Step type "${chromeStep.type}" is not mapped to an RTL action — skipped`
    );
  } else {
    console.warn(`[taro] Unknown step type "${chromeStep.type}" — skipped`);
  }

  return withMetadata(chromeStep, {
    action: "unknown",
    target,
    originalType: chromeStep.type,
  });
}

function attachJsonStepIds(steps: NormalizedStep[]): NormalizedStep[] {
  return steps.map((step, index) => ({
    ...step,
    id: (step.id ?? createStepId("json", index)) as StepId,
    source: "json",
  }));
}

export async function parseRecording(
  filePath: string
): Promise<NormalizedRecording> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read recording file: ${filePath}\n${String(err)}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in recording file: ${filePath}`);
  }

  if (typeof data !== "object" || data === null || !("steps" in data)) {
    throw new Error(
      'Invalid Chrome Recorder export: missing required "steps" field'
    );
  }

  const recording = data as ChromeRecorderExport;

  if (!Array.isArray(recording.steps)) {
    throw new Error('Invalid Chrome Recorder export: "steps" must be an array');
  }

  const steps = attachJsonStepIds(
    recording.steps.map((step: ChromeStep) => normalizeStep(step))
  );

  return {
    title: recording.title ?? "Untitled Recording",
    steps,
    rawStepCount: recording.steps.length,
    url: recording.settings?.url,
    settings: recording.settings as ChromeRecorderSettings | undefined,
  };
}
