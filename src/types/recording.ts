/**
 * TypeScript types for Chrome Recorder exports and normalized steps.
 */

export interface AssertedEvent {
  type: string
  url?: string
  title?: string
}

export interface ChromeRecorderSettings {
  url?: string
  viewport?: {
    width: number
    height: number
  }
  [key: string]: unknown
}

export type NormalizedAction =
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'assert'
  | 'navigate'
  | 'keyDown'
  | 'waitForSelector'
  | 'doubleClick'
  | 'unknown'

export type StepType = Exclude<NormalizedAction, 'unknown'> | (string & {})
export type RecordingSource = 'json' | 'js'

export interface ChromeStep {
  type: StepType
  target?: string
  selectors?: string[][]
  value?: string
  key?: string
  url?: string
  assertedEvents?: AssertedEvent[]
  assert?: {
    expression: string
  }
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
  modifiedTime?: number
}

export interface ChromeRecorderExport {
  title?: string
  steps: ChromeStep[]
  settings?: ChromeRecorderSettings
}

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
  id?: string
  type?: StepType
  selector?: string
  timestamp?: number
  metadata?: Record<string, unknown>
}

export interface RecordingStep extends NormalizedStep {
  id: string
  type: StepType
  action: Exclude<NormalizedAction, 'unknown'>
  target: string
}

export interface NormalizedRecording {
  title: string
  steps: NormalizedStep[]
  rawStepCount: number
  url?: string
  settings?: ChromeRecorderSettings
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

export interface DialogState {
  role: 'dialog' | 'alertdialog' | null
  title: string | null
  description: string | null
  actions: string[]
  isOpen: boolean
}

export interface VisualState {
  capturedAt: string
  element: ElementInfo | null
  pageTitle: string
  reason: string
  screenshotPath?: string
  selector?: string
  url: string
  dialog: DialogState | null
}

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
  matcher?: string
  line?: number
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
