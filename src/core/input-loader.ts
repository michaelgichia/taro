import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parseJsRecording, type JsParseResult } from './js-parser.js'
import { parseRecording } from './parser.js'
import {
  createStepId,
  type NormalizedRecording,
  type NormalizedStep,
  type ParsedInput,
  type RecordingSource,
} from '../types/recording.js'

const JSON_EXTENSIONS = new Set(['.json'])
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])

function looksLikeJson(rawContent: string): boolean {
  const trimmed = rawContent.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function looksLikeRecorderJs(rawContent: string): boolean {
  return [
    '@jest-environment-options',
    'userEvent.',
    'screen.getBy',
    'document.querySelector',
    'page.goto(',
  ].some((snippet) => rawContent.includes(snippet))
}

export function detectInputSource(filePath: string, rawContent: string): RecordingSource {
  const extension = extname(filePath).toLowerCase()

  if (JSON_EXTENSIONS.has(extension)) {
    return 'json'
  }

  if (JS_EXTENSIONS.has(extension)) {
    return 'js'
  }

  if (looksLikeJson(rawContent)) {
    return 'json'
  }

  if (looksLikeRecorderJs(rawContent)) {
    return 'js'
  }

  throw new Error(`Unsupported recording input: ${filePath}`)
}

function attachStepIds(source: RecordingSource, steps: NormalizedStep[]): NormalizedStep[] {
  return steps.map((step, index) => ({
    ...step,
    id: step.id ?? createStepId(source, index),
    source,
  }))
}

function toJsRecording(jsResult: JsParseResult): NormalizedRecording {
  const steps = attachStepIds('js', jsResult.steps)
  return {
    title: jsResult.title,
    steps,
    rawStepCount: steps.length,
    url: jsResult.environmentUrl,
    baseline: {
      environmentUrl: jsResult.environmentUrl,
      queries: jsResult.queries,
      selectors: jsResult.selectors,
      assertions: jsResult.assertions,
      itGroups: jsResult.itGroups,
    },
  }
}

export async function loadInput(filePath: string): Promise<ParsedInput> {
  const rawContent = await readFile(filePath, 'utf-8')
  const source = detectInputSource(filePath, rawContent)

  if (source === 'json') {
    const recording = await parseRecording(filePath)
    return {
      source,
      recording,
    }
  }

  const jsResult = await parseJsRecording(rawContent)
  const recording = toJsRecording(jsResult)

  return {
    source,
    recording,
    baseline: recording.baseline!,
  }
}
