import { describe, expect, it } from 'vitest'
import { planJsSuite } from './suite-planner.js'
import type { MockAnalysis } from './mock-intelligence.js'
import type { AnalyzedRecording, ItGroup, NormalizedRecording } from '../types/recording.js'

function createRecording(steps: NormalizedRecording['steps']): NormalizedRecording {
  return {
    title: 'Add sale flow',
    rawStepCount: steps.length,
    steps,
  }
}

function createAnalyzedRecording(
  recording: NormalizedRecording,
  intentGroups: ItGroup[] = [
    { name: 'open sale dialog', steps: recording.steps.slice(0, 2) },
    { name: 'complete sale wizard', steps: recording.steps.slice(2) },
  ]
): AnalyzedRecording {
  return {
    ...recording,
    diagnostics: {
      removedRedundantClicks: 0,
      removedDoubleClickNoise: 0,
      removedCursorWander: 0,
      rawStepCount: recording.steps.length,
      filteredStepCount: recording.steps.length,
      intentGroupCount: intentGroups.length,
    },
    intentGroups,
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
    expect(plan.stateSafety.status).toBe('single-flow-required')
    expect(plan.itGroups).toHaveLength(1)
    expect(plan.scenarios).toHaveLength(1)
    expect(plan.helpers).toHaveLength(2)
    expect(plan.helpers.every((helper) => helper.assertionPolicy === 'sync-only')).toBe(true)
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
    expect(plan.stateSafety.status).toBe('safe-multi-it')
    expect(plan.itGroups).toHaveLength(1)
    expect(plan.warnings).toEqual([])
  })

  it('splits non-wizard intent groups into safe multi-test scenarios with helper plans', () => {
    const recording = createRecording([
      { action: 'click', target: 'Open filters', originalType: 'click', source: 'js' },
      { action: 'fill', target: 'Search', value: 'milk', originalType: 'fill', source: 'js' },
      { action: 'click', target: 'Apply', originalType: 'click', source: 'js' },
      { action: 'click', target: 'Open review', originalType: 'click', source: 'js' },
      { action: 'assert', target: 'Review panel', originalType: 'assert', source: 'js' },
    ])

    const intentGroups: ItGroup[] = [
      { name: 'filter list', steps: recording.steps.slice(0, 3) },
      { name: 'review results', steps: recording.steps.slice(3) },
    ]

    const plan = planJsSuite({
      recording,
      analyzedRecording: createAnalyzedRecording(recording, intentGroups),
      mockAnalysis: null,
      fallbackTitle: recording.title,
    })

    expect(plan.stateSafety.status).toBe('safe-multi-it')
    expect(plan.itGroups).toHaveLength(2)
    expect(plan.scenarios).toHaveLength(2)
    expect(plan.scenarios.map((scenario) => scenario.name)).toEqual([
      'filter list',
      'review results',
    ])
    expect(plan.scenarios.every((scenario) => scenario.helperRefs.length > 0)).toBe(true)
    expect(plan.helpers.map((helper) => helper.name)).toEqual([
      'planFilterList',
      'planReviewResults',
    ])
    expect(plan.helpers.every((helper) => helper.assertionPolicy === 'sync-only')).toBe(true)
  })

  it('keeps stateful wizard flows explicit when the owning render target is still unresolved', () => {
    const recording = createRecording([
      { action: 'click', target: 'Open invoice wizard', originalType: 'click', source: 'js' },
      { action: 'fill', target: 'Customer', value: 'Jane', originalType: 'fill', source: 'js' },
      { action: 'fill', target: 'Email', value: 'jane@example.com', originalType: 'fill', source: 'js' },
      { action: 'click', target: 'Continue', originalType: 'click', source: 'js' },
      { action: 'fill', target: 'Notes', value: 'hello', originalType: 'fill', source: 'js' },
      { action: 'click', target: 'Review Invoice', originalType: 'click', source: 'js' },
      { action: 'click', target: 'Save', originalType: 'click', source: 'js' },
    ])

    const plan = planJsSuite({
      recording,
      analyzedRecording: createAnalyzedRecording(recording),
      mockAnalysis: null,
      fallbackTitle: recording.title,
    })

    expect(plan.renderBoundary.kind).toBe('unknown')
    expect(plan.stateSafety.status).toBe('unknown')
    expect(plan.renderBoundary.resolvedTarget).toBeNull()
    expect(plan.warnings).toContain(
      'Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
  })
})
