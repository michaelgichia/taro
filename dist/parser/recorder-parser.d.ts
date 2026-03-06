/**
 * Recorder parser - Main entry point for parsing Chrome Recorder exports
 *
 * Pipeline:
 * 1. Parse JSON → NormalizedSteps
 * 2. deduplicateSteps(NormalizedSteps) → DedupedSteps
 * 3. filterNoiseSteps(DedupedSteps) → CleanSteps
 * 4. Continue to generation
 */
import type { NormalizedRecording } from '../types/recording.js';
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
//# sourceMappingURL=recorder-parser.d.ts.map