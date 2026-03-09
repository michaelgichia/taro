import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { classifyQuery, parseJsRecording, type JsParseResult } from './js-parser.js'
import { parseRecording } from './parser.js'
import {
  createStepId,
  type AssertionDescriptor,
  type JsBaselineMetadata,
  type NormalizedRecording,
  type NormalizedStep,
  type ParsedInput,
  type QueryDescriptor,
  type RecordingSource,
  type SelectorDescriptor,
  type StepId,
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

function findNearestStepId(steps: NormalizedStep[], line?: number): StepId {
  if (typeof line === 'number') {
    const exactMatch = steps.find((step) => step.line === line)?.id
    if (exactMatch) {
      return exactMatch
    }

    const earlierMatch = [...steps]
      .reverse()
      .find((step) => typeof step.line === 'number' && step.line! <= line)?.id
    if (earlierMatch) {
      return earlierMatch
    }
  }

  return steps[0]?.id ?? createStepId('js', 0)
}

function buildQueryDescriptors(steps: NormalizedStep[]): QueryDescriptor[] {
  return steps
    .filter((step) => step.originalType.startsWith('getBy'))
    .map((step) => ({
      stepId: step.id ?? createStepId('js', 0),
      method: step.originalType,
      queryRoot: 'screen',
      line: step.line,
      target: step.target,
      quality: classifyQuery(step.originalType),
      raw: step.target,
    }))
}

function buildAssertionDescriptors(steps: NormalizedStep[]): AssertionDescriptor[] {
  return steps
    .filter((step) => step.action === 'assert')
    .map((step) => ({
      stepId: step.id ?? createStepId('js', 0),
      kind: 'query-result',
      line: step.line,
      target: step.target,
      queryMethod: step.originalType,
      raw: step.target,
    }))
}

function buildSelectorDescriptors(
  jsResult: JsParseResult,
  steps: NormalizedStep[]
): SelectorDescriptor[] {
  return jsResult.querySelectorCalls.map((call) => ({
    stepId: findNearestStepId(steps, call.line),
    selector: call.selector,
    selectorKind: 'document.querySelector',
    line: call.line,
    raw: call.selector,
  }))
}

function buildJsBaselineMetadata(
  jsResult: JsParseResult,
  steps: NormalizedStep[]
): JsBaselineMetadata {
  return {
    environmentUrl: jsResult.environmentUrl,
    queries: buildQueryDescriptors(steps),
    selectors: buildSelectorDescriptors(jsResult, steps),
    assertions: buildAssertionDescriptors(steps),
    itGroups: jsResult.itGroups,
  }
}

function toJsRecording(jsResult: JsParseResult): NormalizedRecording {
  const steps = attachStepIds('js', jsResult.steps)
  return {
    title: jsResult.title,
    steps,
    rawStepCount: steps.length,
    url: jsResult.environmentUrl,
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
    baseline: buildJsBaselineMetadata(jsResult, recording.steps),
  }
}
