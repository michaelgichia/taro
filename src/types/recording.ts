/**
 * Type definitions for Chrome Recorder exports and normalized recording steps
 */

export type StepType = 
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'assert'
  | 'waitForSelector'
  | 'doubleClick'
  | 'keyDown'
  | 'navigate';

/**
 * Chrome Recorder export format
 */
export interface ChromeRecorderExport {
  title: string;
  steps: ChromeStep[];
  settings?: {
    url?: string;
    viewport?: {
      width: number;
      height: number;
    };
  };
}

/**
 * Individual step from Chrome Recorder
 */
export interface ChromeStep {
  type: StepType;
  target?: string;
  value?: string;
  selectors?: string[][];
  assert?: {
    expression: string;
  };
  url?: string;
  key?: string;
  modifiedTime?: number;
}

/**
 * Normalized step in internal format
 */
export interface RecordingStep {
  id: string;
  type: StepType;
  action: string;
  target: string;
  selector?: string;
  value?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized recording with all steps
 */
export interface NormalizedRecording {
  title: string;
  steps: RecordingStep[];
  url?: string;
  settings?: ChromeRecorderExport['settings'];
}
