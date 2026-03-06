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
import type { NormalizedRecording } from '../types/recording.js';
import { type DialogFlow } from './steps/dialog-detector.js';
/**
 * Parse Chrome Recorder JSON file and apply deduplication and noise filtering
 *
 * @param filePath - Path to Chrome Recorder JSON export
 * @returns Normalized recording with cleaned steps
 */
export declare function parseRecording(filePath: string): Promise<NormalizedRecording>;
/**
 * Reset step counter (useful for testing)
 */
export declare function resetStepCounter(): void;
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
export declare function parseRecordingWithDialogs(filePath: string): Promise<{
    recording: NormalizedRecording;
    dialogFlows: DialogFlow[];
}>;
//# sourceMappingURL=recorder-parser.d.ts.map