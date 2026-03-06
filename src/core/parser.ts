/**
 * Chrome Recorder JSON parsing
 * Parses Chrome Recorder export format into internal step representation.
 */

export interface RecordingStep {
  type: string
  target?: string
  selectors?: string[][]
  value?: string
  assertedEvents?: AssertedEvent[]
}

export interface AssertedEvent {
  type: string
  url?: string
  title?: string
}

export interface Recording {
  title: string
  steps: RecordingStep[]
}

export function parseRecording(json: unknown): Recording {
  // Stub implementation — will be implemented in a later plan
  if (typeof json !== 'object' || json === null) {
    throw new Error('Invalid recording: expected an object')
  }

  const raw = json as Record<string, unknown>

  if (!Array.isArray(raw.steps)) {
    throw new Error('Invalid recording: missing steps array')
  }

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Untitled Recording',
    steps: raw.steps as RecordingStep[],
  }
}
