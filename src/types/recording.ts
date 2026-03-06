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

export interface NormalizedStep {
  action: NormalizedAction
  target?: string
  value?: string
  originalType: string
}

export interface NormalizedRecording {
  title: string
  steps: NormalizedStep[]
  rawStepCount: number
}
