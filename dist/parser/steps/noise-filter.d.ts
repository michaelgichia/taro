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
import type { RecordingStep } from '../../types/recording.js';
/**
 * Filter noise events from recording steps
 *
 * @param steps - Array of recording steps
 * @returns Filtered array with noise events removed
 */
export declare function filterNoiseSteps(steps: RecordingStep[]): RecordingStep[];
export { filterNoiseSteps as default };
//# sourceMappingURL=noise-filter.d.ts.map