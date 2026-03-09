import { describe, expect, it } from 'vitest'
import { planJsSuite } from './suite-planner.js'
import type { MockAnalysis } from './mock-intelligence.js'
import type { AnalyzedRecording, NormalizedRecording } from '../types/recording.js'

function createRecording(steps: NormalizedRecording['steps']): NormalizedRecording {
  return {
    title: 'Add sale flow',
    rawStepCount: steps.length,
    steps,
  }
}

function createAnalyzedRecording(
  recording: NormalizedRecording
): AnalyzedRecording {
  return {
    ...recording,
    diagnostics: {
      removedRedundantClicks: 0,
      removedDoubleClickNoise: 0,
      removedCursorWander: 0,
      rawStepCount: recording.steps.length,
      filteredStepCount: recording.steps.length,
      intentGroupCount: 2,
    },
    intentGroups: [
      { name: 'open sale dialog', steps: recording.steps.slice(0, 2) },
      { name: 'complete sale wizard', steps: recording.steps.slice(2) },
    ],
  }
}

function createMockAnalysis(): MockAnalysis {
  return {
    conventions: null,
    recommendations: [
      {
        count: 3,
        files: ['src/modules/kenya/sales/SalesModule.test.tsx'],
        kind: 'extract',
        reason: 'Mock target appears in multiple tests and should be shared',
        target: '@digitax/data-layer',
      },
    ],
    repeatedTargets: [
      {
        count: 3,
        files: ['src/modules/kenya/sales/SalesModule.test.tsx'],
        target: '@digitax/data-layer',
      },
    ],
    mutationLifecycles: [
      {
        file: 'src/modules/kenya/sales/SalesModule.test.tsx',
        stages: ['loading', 'success', 'error'],
        evidence: ['loading cues detected', 'success cues detected', 'error cues detected'],
      },
    ],
    instabilityWarnings: [],
  }
}

describe('planJsSuite', () => {
  it('marks multi-step mutation-heavy flows as module-boundary drafts', () => {
    const recording = createRecording([
      { action: 'click', target: 'Add Sale (Invoice)', originalType: 'click', source: 'js' },
      { action: 'fill', target: 'Quantity', value: '4', originalType: 'fill', source: 'js' },
      { action: 'select', target: 'Customer PIN / Name', value: 'John Doe', originalType: 'select', source: 'js' },
      { action: 'fill', target: 'General Invoice Details', value: 'Hello world', originalType: 'fill', source: 'js' },
      { action: 'click', target: 'Continue', originalType: 'click', source: 'js' },
      { action: 'click', target: 'Review Sale (Invoice)', originalType: 'click', source: 'js' },
      { action: 'click', target: 'Save', originalType: 'click', source: 'js' },
    ])

    const plan = planJsSuite({
      recording,
      analyzedRecording: createAnalyzedRecording(recording),
      mockAnalysis: createMockAnalysis(),
      fallbackTitle: recording.title,
    })

    expect(plan.renderBoundary.kind).toBe('module')
    expect(plan.renderBoundary.reason).toContain('container/module boundary')
    expect(plan.itGroups).toHaveLength(1)
    expect(plan.warnings).toContain(
      'Prefer a repo-local module/container render boundary for this flow instead of targeting a leaf form component directly.'
    )
    expect(plan.warnings.some((warning) => warning.includes('@digitax/data-layer'))).toBe(true)
  })

  it('keeps simple flows at component scope without boundary warnings', () => {
    const recording = createRecording([
      { action: 'click', target: 'Open filters', originalType: 'click', source: 'js' },
      { action: 'fill', target: 'Search', value: 'milk', originalType: 'fill', source: 'js' },
      { action: 'click', target: 'Apply', originalType: 'click', source: 'js' },
    ])

    const plan = planJsSuite({
      recording,
      analyzedRecording: {
        ...createAnalyzedRecording(recording),
        diagnostics: {
          removedRedundantClicks: 0,
          removedDoubleClickNoise: 0,
          removedCursorWander: 0,
          rawStepCount: recording.steps.length,
          filteredStepCount: recording.steps.length,
          intentGroupCount: 1,
        },
        intentGroups: [{ name: 'filter list', steps: recording.steps }],
      },
      mockAnalysis: null,
      fallbackTitle: recording.title,
    })

    expect(plan.renderBoundary.kind).toBe('component')
    expect(plan.itGroups).toHaveLength(1)
    expect(plan.warnings).toEqual([])
  })
})
