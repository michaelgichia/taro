/**
 * Noise event filter - removes irrelevant events from recordings
 * 
 * Filters out:
 * - dblClick events (double clicks)
 * - mousemove/mouseover/mouseout (cursor wandering)
 * - Accidental scroll events (scroll with no action within 2s)
 * 
 * Preserves:
 * - click, fill, select, change, navigate, keyPress, assert
 */

import type { RecordingStep, StepType } from '../../types/recording.ts';

const INTENTIONAL_SCROLL_THRESHOLD_MS = 2000;

/**
 * Step types that are considered noise and should be filtered
 */
const NOISE_STEP_TYPES: StepType[] = [
  'doubleClick',
];

/**
 * Step types that are definitely intentional (never noise)
 */
const INTENTIONAL_STEP_TYPES: StepType[] = [
  'click',
  'fill',
  'select',
  'assert',
  'waitForSelector',
  'keyDown',
  'navigate',
];

/**
 * Step types that might be noise depending on context
 */
const POTENTIALLY_NOISE_STEP_TYPES: StepType[] = [
  'scroll',
];

/**
 * Check if a step type is definitely noise
 */
function isNoiseStepType(step: RecordingStep): boolean {
  return NOISE_STEP_TYPES.includes(step.type);
}

/**
 * Check if step is cursor-related noise
 */
function isCursorNoise(step: RecordingStep): boolean {
  const action = step.action?.toLowerCase() || '';
  return (
    action === 'mousemove' ||
    action === 'mouseover' ||
    action === 'mouseout' ||
    action === 'mouseenter' ||
    action === 'mouseleave'
  );
}

/**
 * Check if step is scroll-related
 */
function isScrollStep(step: RecordingStep): boolean {
  return step.type === 'scroll' || step.action?.toLowerCase() === 'scroll';
}

/**
 * Check if there's any intentional action after the scroll within the threshold
 * 
 * @param scrollIndex - Index of the scroll step in the array
 * @param steps - All steps
 * @returns true if there's an intentional action within 2s after the scroll
 */
function hasIntentionalActionAfter(scrollIndex: number, steps: RecordingStep[]): boolean {
  const scrollStep = steps[scrollIndex];
  const scrollTime = scrollStep.timestamp || 0;

  for (let i = scrollIndex + 1; i < steps.length; i++) {
    const step = steps[i];
    const stepTime = step.timestamp || 0;

    // If we've passed the threshold, stop looking
    if (stepTime - scrollTime > INTENTIONAL_SCROLL_THRESHOLD_MS) {
      break;
    }

    // Check if this is an intentional step
    if (INTENTIONAL_STEP_TYPES.includes(step.type)) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if a scroll step is noise (accidental scroll with no subsequent action)
 */
function isAccidentalScroll(scrollIndex: number, steps: RecordingStep[]): boolean {
  // If there's no timestamp, we can't determine - keep it to be safe
  if (steps[scrollIndex].timestamp === undefined) {
    return false;
  }

  // If there's an intentional action within 2s, it's not accidental
  return !hasIntentionalActionAfter(scrollIndex, steps);
}

/**
 * Filter noise events from recording steps
 * 
 * @param steps - Array of recording steps
 * @returns Filtered array with noise events removed
 */
export function filterNoiseSteps(steps: RecordingStep[]): RecordingStep[] {
  if (!steps || steps.length === 0) {
    return [];
  }

  const filteredSteps: RecordingStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let shouldKeep = true;
    let reason: string | undefined;

    // Check for explicit noise types
    if (isNoiseStepType(step)) {
      shouldKeep = false;
      reason = 'dblClick filtered';
    }
    // Check for cursor noise
    else if (isCursorNoise(step)) {
      shouldKeep = false;
      reason = 'cursor movement filtered';
    }
    // Check for accidental scroll
    else if (isScrollStep(step) && isAccidentalScroll(i, steps)) {
      shouldKeep = false;
      reason = 'accidental scroll filtered';
    }

    if (shouldKeep) {
      filteredSteps.push(step);
    } else if (step.metadata) {
      // Mark filtered steps with metadata (for debugging/analysis)
      step.metadata.isNoiseFiltered = true;
      step.metadata.noiseReason = reason;
      filteredSteps.push(step);
    }
  }

  return filteredSteps;
}

export { filterNoiseSteps as default };
