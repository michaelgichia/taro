/**
 * Recorder parser - Main entry point for parsing Chrome Recorder exports
 * 
 * Pipeline:
 * 1. Parse JSON → NormalizedSteps
 * 2. deduplicateSteps(NormalizedSteps) → DedupedSteps  
 * 3. filterNoiseSteps(DedupedSteps) → CleanSteps
 * 4. groupDialogSteps(CleanSteps) → DialogFlows
 * 5. Continue to generation
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { ChromeRecorderExport, ChromeStep, NormalizedRecording, RecordingStep, StepType } from '../types/recording.js';
import { deduplicateSteps } from './steps/deduplicator.js';
import { filterNoiseSteps } from './steps/noise-filter.js';
import { groupDialogSteps, type DialogFlow } from './steps/dialog-detector.js';

let stepIdCounter = 0;

/**
 * Generate unique step IDs
 */
function generateStepId(): string {
  return `step_${++stepIdCounter}`;
}

/**
 * Map Chrome Recorder step type to action name
 */
function getActionName(type: StepType): string {
  const actionMap: Record<StepType, string> = {
    click: 'click',
    fill: 'fill',
    select: 'select',
    scroll: 'scroll',
    assert: 'assert',
    waitForSelector: 'waitForSelector',
    doubleClick: 'doubleClick',
    keyDown: 'keyDown',
    navigate: 'navigate'
  };
  return actionMap[type] || type;
}

/**
 * Extract selector from Chrome step
 */
function extractSelector(step: ChromeStep): string | undefined {
  if (step.selectors && step.selectors.length > 0) {
    const firstSelectorArray = step.selectors[0];
    if (firstSelectorArray && firstSelectorArray.length > 0) {
      return firstSelectorArray[0];
    }
  }
  return step.target;
}

/**
 * Normalize a single Chrome step to internal format
 */
function normalizeStep(step: ChromeStep, index: number): RecordingStep {
  const normalized: RecordingStep = {
    id: generateStepId(),
    type: step.type,
    action: getActionName(step.type),
    target: step.target || '',
    selector: extractSelector(step),
    timestamp: step.modifiedTime,
    metadata: {}
  };

  if (step.value !== undefined) {
    normalized.value = step.value;
  }

  if (step.assert) {
    normalized.metadata = {
      ...normalized.metadata,
      assertExpression: step.assert.expression
    };
  }

  if (step.url) {
    normalized.metadata = {
      ...normalized.metadata,
      url: step.url
    };
  }

  return normalized;
}

/**
 * Parse Chrome Recorder JSON file and apply deduplication and noise filtering
 * 
 * @param filePath - Path to Chrome Recorder JSON export
 * @returns Normalized recording with cleaned steps
 */
export async function parseRecording(filePath: string): Promise<NormalizedRecording> {
  const absolutePath = resolve(process.cwd(), filePath);
  const content = await readFile(absolutePath, 'utf-8');
  
  let exportData: ChromeRecorderExport;
  try {
    exportData = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!exportData.steps || !Array.isArray(exportData.steps)) {
    throw new Error(`Invalid Chrome Recorder export: missing or invalid "steps" array`);
  }

  // Reset step counter for each new recording
  stepIdCounter = 0;

  // Step 1: Normalize steps
  let steps: RecordingStep[] = exportData.steps.map((step, index) => 
    normalizeStep(step, index)
  );

  // Step 2: Deduplicate rapid clicks (must run first)
  steps = deduplicateSteps(steps);

  // Step 3: Filter noise events
  steps = filterNoiseSteps(steps);

  return {
    title: exportData.title || 'Untitled Recording',
    steps,
    url: exportData.settings?.url,
    settings: exportData.settings
  };
}

/**
 * Reset step counter (useful for testing)
 */
export function resetStepCounter(): void {
  stepIdCounter = 0;
}

// Re-export for convenience
export { deduplicateSteps } from './steps/deduplicator.js';
export { filterNoiseSteps } from './steps/noise-filter.js';
export { groupDialogSteps, resetDialogIdCounter } from './steps/dialog-detector.js';
export type { DialogFlow, DialogType } from './steps/dialog-detector.js';

/**
 * Parse recording and extract dialog flows
 * 
 * @param filePath - Path to Chrome Recorder JSON export
 * @returns Object with normalized recording and detected dialog flows
 */
export async function parseRecordingWithDialogs(filePath: string): Promise<{
  recording: NormalizedRecording;
  dialogFlows: DialogFlow[];
}> {
  const recording = await parseRecording(filePath);
  const dialogFlows = groupDialogSteps(recording.steps);
  return { recording, dialogFlows };
}
