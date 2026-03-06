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

// --- Phase 3 additions ---

export type QueryQuality = 'excellent' | 'good' | 'acceptable' | 'fragile'

export interface ElementInfo {
  tagName: string
  role: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
  innerText: string
  value: string | undefined
  type: string | undefined
  placeholder: string | null
  isPresent: boolean
}

export interface QueryResult {
  query: string
  quality: QueryQuality
  method: string
  line?: number
}

export interface ItGroup {
  name: string
  steps: RecordingStep[]
}

export interface GeneratedItBlock {
  name: string
  stepLines: string[]
  hasUserEvent: boolean
}
