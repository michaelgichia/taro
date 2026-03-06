/**
 * Chrome Recorder JSON parsing
 * Parses Chrome Recorder export format and normalizes all step types
 * into a consistent internal representation.
 */

import { readFile } from 'node:fs/promises'
import type {
  ChromeRecorderExport,
  ChromeStep,
  NormalizedAction,
  NormalizedRecording,
  NormalizedStep,
} from '../types/recording.js'

function getFirstSelector(selectors?: string[][]): string | undefined {
  if (!selectors || selectors.length === 0) return undefined
  const first = selectors[0]
  if (!first || first.length === 0) return undefined
  return first[0]
}

export function normalizeStep(chromeStep: ChromeStep): NormalizedStep {
  const target = getFirstSelector(chromeStep.selectors) ?? chromeStep.target

  const actionMap: Record<string, NormalizedAction> = {
    click: 'click',
    doubleClick: 'click',
    fill: 'fill',
    change: 'fill',
    select: 'select',
    scroll: 'scroll',
    assertElementPresent: 'assert',
    assertElementVisible: 'assert',
    navigate: 'navigate',
    keyDown: 'keyDown',
    keyUp: 'keyDown',
  }

  const action = actionMap[chromeStep.type]

  if (action !== undefined) {
    switch (action) {
      case 'navigate':
        return { action, target: chromeStep.url, originalType: chromeStep.type }
      case 'keyDown':
        return { action, value: chromeStep.key, originalType: chromeStep.type }
      case 'fill':
      case 'select':
      case 'assert':
        return { action, target, value: chromeStep.value, originalType: chromeStep.type }
      default:
        return { action, target, originalType: chromeStep.type }
    }
  }

  const knownNoOp = new Set(['waitForSelector', 'setViewport', 'waitForExpression'])
  if (knownNoOp.has(chromeStep.type)) {
    console.warn(`[taro] Step type "${chromeStep.type}" is not mapped to an RTL action — skipped`)
  } else {
    console.warn(`[taro] Unknown step type "${chromeStep.type}" — skipped`)
  }

  return { action: 'unknown', target, originalType: chromeStep.type }
}

export async function parseRecording(filePath: string): Promise<NormalizedRecording> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    throw new Error(`Failed to read recording file: ${filePath}\n${String(err)}`)
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in recording file: ${filePath}`)
  }

  if (typeof data !== 'object' || data === null || !('steps' in data)) {
    throw new Error('Invalid Chrome Recorder export: missing required "steps" field')
  }

  const recording = data as ChromeRecorderExport

  if (!Array.isArray(recording.steps)) {
    throw new Error('Invalid Chrome Recorder export: "steps" must be an array')
  }

  const steps = recording.steps.map((step: ChromeStep) => normalizeStep(step))

  return {
    title: recording.title ?? 'Untitled Recording',
    steps,
    rawStepCount: recording.steps.length,
  }
}
