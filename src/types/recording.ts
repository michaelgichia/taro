/**
 * TypeScript types for Chrome Recorder exports and normalized steps.
 */

export interface AssertedEvent {
  type: string
  url?: string
  title?: string
}

export interface ChromeStep {
  type: string
  target?: string
  selectors?: string[][]
  value?: string
  key?: string
  url?: string
  assertedEvents?: AssertedEvent[]
  timeout?: number
  offsetX?: number
  offsetY?: number
  x?: number
  y?: number
  width?: number
  height?: number
  deviceScaleFactor?: number
  isMobile?: boolean
  hasTouch?: boolean
  isLandscape?: boolean
}

export interface ChromeRecorderExport {
  title?: string
  steps: ChromeStep[]
  settings?: Record<string, unknown>
}

export type NormalizedAction =
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'assert'
  | 'navigate'
  | 'keyDown'
  | 'unknown'

export type RecordingSource = 'json' | 'js'

export interface NormalizedStep {
  action: NormalizedAction
  target?: string
  value?: string
  originalType: string
  source?: RecordingSource
  selectors?: string[][]
  assertedEvents?: AssertedEvent[]
  key?: string
  line?: number
  offsetX?: number
  offsetY?: number
  x?: number
  y?: number
}

export interface NormalizedRecording {
  title: string
  steps: NormalizedStep[]
  rawStepCount: number
}

export interface RecordingDiagnostics {
  removedRedundantClicks: number
  removedDoubleClickNoise: number
  removedCursorWander: number
  rawStepCount: number
  filteredStepCount: number
  intentGroupCount: number
}

export interface IntentGroup {
  name: string
  steps: NormalizedStep[]
}

export interface AnalyzedRecording extends NormalizedRecording {
  diagnostics: RecordingDiagnostics
  intentGroups: IntentGroup[]
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
  query: string // e.g., `screen.getByRole('button', { name: 'Save' })`
  quality: QueryQuality
  method: string // e.g., 'getByRole'
  matcher?: string // e.g., '.toHaveValue()', '.toBeChecked()' — context-aware matcher
  line?: number // source line in input JS (for quality summary)
}

export interface ItGroup {
  name: string
  steps: NormalizedStep[]
}

export interface GeneratedItBlock {
  name: string
  stepLines: string[]
  hasUserEvent: boolean
}
