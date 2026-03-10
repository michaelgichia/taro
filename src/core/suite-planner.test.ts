import { describe, expect, it } from 'vitest'
import { normalizeJsBaseline } from './baseline-normalizer.js'
import { planJsSuite } from './suite-planner.js'
import type { MockAnalysis } from './mock-intelligence.js'
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  ParsedJsInput,
  SemanticMarkerCandidate,
  SemanticMarkerLink,
  UnresolvedSemanticMarker,
} from '../types/recording.js'

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
  it('rehydrates semantic marker state from baseline evidence and keeps anchor linkage in planned groups', () => {
    const semanticMarkerCandidate: SemanticMarkerCandidate = {
      stepId: 'js-step-2',
      status: 'qualified',
      originalGesture: 'dblClick',
      proofSubject: 'heading',
      proofText: 'Review Sale',
      target: 'Review Sale',
      query: {
        stepId: 'js-step-2',
        method: 'getByRole',
        queryRoot: 'screen',
        role: 'heading',
        raw: "screen.getByRole('heading', { name: 'Review Sale' })",
        target: 'Review Sale',
      },
      anchor: {
        anchorStepId: 'js-step-1',
        relation: 'precedes',
      },
      sourceContext: {
        originalType: 'dblClick',
      },
    }
    const semanticMarkerLink: SemanticMarkerLink = {
      markerStepId: 'js-step-2',
      anchorStepId: 'js-step-1',
      relation: 'precedes',
      proofSubject: 'heading',
      proofText: 'Review Sale',
      target: 'Review Sale',
      sourceContext: {
        originalType: 'dblClick',
      },
      query: semanticMarkerCandidate.query,
    }
    const unresolvedSemanticMarker: UnresolvedSemanticMarker = {
      stepId: 'js-step-3',
      reason: 'unsupported-proof-subject',
      proofSubject: 'field-label',
      proofText: 'Customer PIN',
      target: 'Customer PIN',
      sourceContext: {
        originalType: 'dblClick',
      },
      query: {
        stepId: 'js-step-3',
        method: 'getByText',
        queryRoot: 'screen',
        raw: "screen.getByText('Customer PIN')",
        target: 'Customer PIN',
      },
    }

    const parsedInput: ParsedJsInput = {
      source: 'js',
      recording: createRecording([
        {
          id: 'js-step-1',
          action: 'click',
          target: 'Save',
          originalType: 'click',
          source: 'js',
        },
        {
          id: 'js-step-2',
          action: 'click',
          target: 'Review Sale',
          originalType: 'dblClick',
          source: 'js',
          metadata: {
            semanticMarkerCandidate,
            semanticMarkerLink,
          },
        },
        {
          id: 'js-step-3',
          action: 'click',
          target: 'Customer PIN',
          originalType: 'dblClick',
          source: 'js',
          metadata: {
            semanticMarkerCandidate: {
              ...unresolvedSemanticMarker,
              status: 'unresolved',
              originalGesture: 'dblClick',
            },
            unresolvedSemanticMarker,
          },
        },
      ]),
      baseline: {
        environmentUrl: 'http://localhost:3001/sales',
        queries: [],
        selectors: [],
        assertions: [],
        semanticMarkerCandidates: [
          semanticMarkerCandidate,
          {
            ...unresolvedSemanticMarker,
            status: 'unresolved',
            originalGesture: 'dblClick',
          },
        ],
        itGroups: [
          {
            name: 'review sale',
            steps: [],
          },
        ],
      },
    }

    const normalized = normalizeJsBaseline({
      ...parsedInput,
      baseline: {
        ...parsedInput.baseline,
        itGroups: [
          {
            name: 'review sale',
            steps: parsedInput.recording.steps.map((step) => ({
              ...step,
              semanticMarkerCandidate: undefined,
              semanticMarkerLink: undefined,
              unresolvedSemanticMarker: undefined,
            })),
          },
        ],
      },
    })
    const intentGroups: ItGroup[] = [
      { name: 'submit sale', steps: [normalized.steps[0]!] },
      { name: 'review confirmation', steps: normalized.steps.slice(1) },
    ]

    const plan = planJsSuite({
      recording: normalized,
      analyzedRecording: createAnalyzedRecording(normalized, intentGroups),
      mockAnalysis: null,
      fallbackTitle: normalized.title,
    })

    expect(normalized.steps[1]?.semanticMarkerLink).toEqual(semanticMarkerLink)
    expect(normalized.steps[2]?.unresolvedSemanticMarker).toEqual(unresolvedSemanticMarker)
    expect(normalized.baseline?.itGroups[0]?.steps[1]).toMatchObject({
      semanticMarkerLink,
    })
    expect(normalized.baseline?.itGroups[0]?.steps[2]).toMatchObject({
      unresolvedSemanticMarker,
    })
    expect(plan.helpers[1]).toMatchObject({
      name: 'planReviewConfirmation',
    })
    expect(plan.helpers[1]?.steps[0]).toMatchObject({
      semanticMarkerLink,
      metadata: {
        semanticMarkerAnchorStep: expect.objectContaining({
          id: 'js-step-1',
          action: 'click',
          target: 'Save',
        }),
      },
    })
    expect(plan.scenarios[1]?.steps[0]).toMatchObject({
      semanticMarkerLink,
    })
    expect(plan.scenarios[1]?.steps[1]).toMatchObject({
      unresolvedSemanticMarker,
    })
    expect(plan.scenarios[1]?.helperRefs).toEqual(['planReviewConfirmation'])
  })

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
      'Tayo could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
  })
})
