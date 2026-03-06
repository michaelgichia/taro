/**
 * Click deduplicator - removes rapid duplicate clicks on the same element
 *
 * Algorithm:
 * 1. Iterate through steps in order
 * 2. For each click step, look ahead up to 500ms
 * 3. If matching selector found, mark as duplicate
 * 4. Return filtered list preserving original order
 */
import type { RecordingStep } from '../../types/recording.js';
/**
 * Deduplicate rapid clicks on the same element
 *
 * @param steps - Array of recording steps
 * @returns Filtered array with duplicate clicks removed
 */
export declare function deduplicateSteps(steps: RecordingStep[]): RecordingStep[];
export { deduplicateSteps as default };
//# sourceMappingURL=deduplicator.d.ts.map