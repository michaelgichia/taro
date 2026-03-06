/**
 * Chrome Recorder JSON parser
 * Parses and normalizes Chrome Recorder exports to internal format
 */
import type { ChromeStep, NormalizedRecording, RecordingStep } from '../types/recording.js';
/**
 * Normalize a single Chrome step to internal format
 */
export declare function normalizeStep(step: ChromeStep, index: number): RecordingStep;
/**
 * Parse Chrome Recorder JSON file to normalized recording
 */
export declare function parseRecording(filePath: string): Promise<NormalizedRecording>;
/**
 * Reset step counter (useful for testing)
 */
export declare function resetStepCounter(): void;
//# sourceMappingURL=parser.d.ts.map