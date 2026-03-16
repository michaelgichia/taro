/**
 * Click deduplicator - removes rapid duplicate clicks on the same element
 * 
 * Algorithm:
 * 1. Iterate through steps in order
 * 2. For each click step, look ahead up to 500ms
 * 3. If matching selector found, mark as duplicate
 * 4. Return filtered list preserving original order
 */

import type { RecordingStep } from '#types/recording.ts';

const RAPID_CLICK_THRESHOLD_MS = 500;

/**
 * Check if a step is a click type
 */
function isClickStep(step: RecordingStep): boolean {
  return step.type === 'click' || step.type === 'doubleClick';
}

/**
 * Check if two steps target the same element
 */
function hasSameTarget(step1: RecordingStep, step2: RecordingStep): boolean {
  // Compare by selector or target
  const target1 = step1.selector || step1.target;
  const target2 = step2.selector || step2.target;
  return target1 === target2 && target1 !== '';
}

/**
 * Check if two steps are within the rapid-click threshold
 */
function isWithinThreshold(step1: RecordingStep, step2: RecordingStep): boolean {
  if (step1.timestamp === undefined || step2.timestamp === undefined) {
    // If no timestamps, assume they could be rapid (conservative)
    return true;
  }
  return Math.abs(step2.timestamp - step1.timestamp) <= RAPID_CLICK_THRESHOLD_MS;
}

/**
 * Deduplicate rapid clicks on the same element
 * 
 * @param steps - Array of recording steps
 * @returns Filtered array with duplicate clicks removed
 */
export function deduplicateSteps(steps: RecordingStep[]): RecordingStep[] {
  if (!steps || steps.length === 0) {
    return [];
  }

  // Track which steps are duplicates
  const duplicateIds = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const currentStep = steps[i];
    
    // Only consider click steps for deduplication
    if (!isClickStep(currentStep)) {
      continue;
    }

    // Look ahead for potential duplicates
    for (let j = i + 1; j < steps.length; j++) {
      const lookAheadStep = steps[j];
      
      // Stop looking if we've gone past the threshold time
      if (currentStep.timestamp !== undefined && 
          lookAheadStep.timestamp !== undefined &&
          lookAheadStep.timestamp - currentStep.timestamp > RAPID_CLICK_THRESHOLD_MS) {
        break;
      }

      // Check if this is a duplicate click on the same target
      if (isClickStep(lookAheadStep) && 
          hasSameTarget(currentStep, lookAheadStep) &&
          isWithinThreshold(currentStep, lookAheadStep)) {
        duplicateIds.add(lookAheadStep.id);
      }
    }
  }

  // Filter out duplicates, preserving original order
  return steps.filter(step => !duplicateIds.has(step.id));
}
