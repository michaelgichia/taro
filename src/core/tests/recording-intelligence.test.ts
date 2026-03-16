import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseJsRecording } from '#core/js-parser.ts'
import { normalizeStep } from '#core/parser.ts'
import { parseRecording } from '#core/parser.ts'
import {
  analyzeRecording,
  filterNoiseSteps,
  findVisualCaptureCandidates,
  inferIntentGroups,
} from '#core/recording-intelligence.ts'
import {
  sampleJsonBasicRecording,
  sampleJsonDialogRecording,
  sampleRestRecordingJs,
} from '#tests/fixtures/sample-fixtures.ts'
import type { ChromeStep, NormalizedRecording, NormalizedStep } from '#types/recording.ts'

const sandboxes: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

function createJsClickStep(id: string, target: string): NormalizedStep {
  return {
    id,
    action: 'click',
    target,
    originalType: 'click',
    source: 'js',
  }
}

function createJsFillStep(id: string, target: string, value: string): NormalizedStep {
  return {
    id,
    action: 'fill',
    target,
    value,
    originalType: 'change',
    source: 'js',
  }
}

function createJsMarkerStep(options: {
  id: string
  target: string
  proofSubject:
    | 'heading'
    | 'visible-message'
    | 'concrete-value'
    | 'field-label'
    | 'selector-target'
    | 'unknown'
  method?: string
  role?: string
  line?: number
  source?: 'js' | 'json'
}): NormalizedStep {
  const {
    id,
    target,
    proofSubject,
    method = 'getByText',
    role,
    line = 1,
    source = 'js',
  } = options

  const semanticMarkerCandidate = {
    stepId: id,
    status: 'unresolved' as const,
    originalGesture: 'dblClick' as const,
    proofSubject,
    target,
    proofText: target,
    line,
    sourceContext: {
      line,
      originalType: 'dblClick',
    },
    query: {
      stepId: id,
      method,
      queryRoot: 'screen' as const,
      target,
      ...(role ? { role } : {}),
      line,
    },
    anchor: {},
  }

  return {
    id,
    action: 'click',
    target,
    originalType: 'dblClick',
    source,
    line,
    semanticMarkerCandidate,
    metadata: {
      semanticMarkerCandidate,
    },
  }
}

async function loadSampleRestRecordingAnalysis() {
  const parsed = await parseJsRecording(sampleRestRecordingJs)

  return {
    parsed,
    analyzed: analyzeRecording({
      title: parsed.title,
      rawStepCount: parsed.steps.length,
      steps: parsed.steps,
    }),
  }
}

function getStepById(steps: NormalizedStep[], stepId: string): NormalizedStep {
  const step = steps.find((candidate) => candidate.id === stepId)

  if (!step) {
    throw new Error(`Expected step ${stepId} to exist`)
  }

  return step
}

function getStepIndex(steps: NormalizedStep[], stepId: string): number {
  const index = steps.findIndex((candidate) => candidate.id === stepId)

  if (index === -1) {
    throw new Error(`Expected step ${stepId} to exist`)
  }

  return index
}

async function createRecordingFile(label: string, source: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-recording-${label}-`))
  sandboxes.push(root)
  const filePath = join(root, `${label}.json`)
  await writeFile(filePath, source, 'utf-8')
  return filePath
}

describe('normalizeStep', () => {
  it('preserves recorder metadata needed for noise heuristics', () => {
    const step: ChromeStep = {
      type: 'doubleClick',
      target: '#save',
      selectors: [['#save']],
      x: 320,
      y: 144,
      offsetX: 12,
      offsetY: 8,
      assertedEvents: [{ type: 'navigation', url: 'http://localhost:3000/save' }],
    }

    expect(normalizeStep(step)).toMatchObject({
      action: 'click',
      target: '#save',
      originalType: 'doubleClick',
      source: 'json',
      selectors: [['#save']],
      x: 320,
      y: 144,
      offsetX: 12,
      offsetY: 8,
      assertedEvents: [{ type: 'navigation', url: 'http://localhost:3000/save' }],
    })
  })
})

describe('filterNoiseSteps', () => {
  it('collapses adjacent redundant clicks on the same target', () => {
    const steps: NormalizedStep[] = [
      { action: 'click', target: '#save', originalType: 'click', source: 'json' },
      { action: 'click', target: '#save', originalType: 'click', source: 'json' },
      { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]?.target).toBe('#save')
    expect(result.diagnostics.removedRedundantClicks).toBe(1)
    expect(result.diagnostics.removedDoubleClickNoise).toBe(0)
  })

  it('counts doubleClick-style duplicates separately from ordinary repeated clicks', () => {
    const steps: NormalizedStep[] = [
      { action: 'click', target: '#save', originalType: 'click', source: 'json' },
      { action: 'click', target: '#save', originalType: 'doubleClick', source: 'json' },
      { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]?.originalType).toBe('click')
    expect(result.diagnostics.removedRedundantClicks).toBe(0)
    expect(result.diagnostics.removedDoubleClickNoise).toBe(1)
  })

  it('removes cursor wandering and movement-only noise', () => {
    const steps: NormalizedStep[] = [
      {
        action: 'unknown',
        target: undefined,
        originalType: 'hover',
        source: 'json',
        x: 10,
        y: 12,
      },
      {
        action: 'scroll',
        target: undefined,
        originalType: 'scroll',
        source: 'json',
      },
      { action: 'click', target: '#save', originalType: 'click', source: 'json' },
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toEqual([
      { action: 'click', target: '#save', originalType: 'click', source: 'json' },
    ])
    expect(result.diagnostics.removedCursorWander).toBe(2)
  })

  it('preserves qualified JS dblClick markers and drops non-interactive trailing clicks', () => {
    const steps: NormalizedStep[] = [
      createJsClickStep('js-step-1', 'Continue'),
      createJsMarkerStep({
        id: 'js-step-2',
        target: 'Review Example',
        proofSubject: 'heading',
        role: 'heading',
      }),
      createJsClickStep('js-step-3', 'Review Example'),
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      id: 'js-step-2',
      semanticMarkerLink: {
        markerStepId: 'js-step-2',
        anchorStepId: 'js-step-1',
        relation: 'follows',
        proofSubject: 'heading',
      },
      semanticMarkerCandidate: {
        status: 'qualified',
        anchor: {
          anchorStepId: 'js-step-1',
          relation: 'follows',
        },
      },
    })
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 1,
      unresolvedSemanticMarkers: 0,
      removedDoubleClickNoise: 0,
      removedRedundantClicks: 1,
    })
  })

  it('treats normalized dblClick marker metadata as semantic checkpoints even outside JS-sourced steps', () => {
    const result = filterNoiseSteps([
      {
        id: 'json-step-1',
        action: 'click',
        target: 'Open Example Dialog',
        originalType: 'click',
        source: 'json',
      },
      createJsMarkerStep({
        id: 'json-step-2',
        target: 'Review Example',
        proofSubject: 'heading',
        method: 'getByRole',
        role: 'heading',
        source: 'json',
      }),
      {
        id: 'json-step-3',
        action: 'click',
        target: 'Review Example',
        originalType: 'click',
        source: 'json',
      },
    ])

    expect(result.steps.map((step) => step.id)).toEqual(['json-step-1', 'json-step-2'])
    expect(result.steps[1]?.semanticMarkerCandidate?.originalGesture).toBe('dblClick')
    expect(result.diagnostics.preservedSemanticMarkers).toBe(1)
    expect(result.diagnostics.removedRedundantClicks).toBe(1)
  })

  it('keeps trailing clicks for interactive same-target marker pairs', () => {
    const steps: NormalizedStep[] = [
      createJsClickStep('js-step-1', 'Save'),
      createJsMarkerStep({
        id: 'js-step-2',
        target: '$1,200.00',
        proofSubject: 'concrete-value',
        method: 'getByRole',
        role: 'button',
      }),
      createJsClickStep('js-step-3', '$1,200.00'),
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(3)
    expect(result.steps[1]?.semanticMarkerLink).toMatchObject({
      markerStepId: 'js-step-2',
      anchorStepId: 'js-step-1',
      proofSubject: 'concrete-value',
    })
    expect(result.steps[2]).toMatchObject({
      id: 'js-step-3',
      originalType: 'click',
    })
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 1,
      unresolvedSemanticMarkers: 0,
      removedRedundantClicks: 0,
      removedDoubleClickNoise: 0,
    })
  })

  it('preserves resolvable field labels as semantic marker evidence', () => {
    const steps: NormalizedStep[] = [
      createJsClickStep('js-step-1', 'Save'),
      createJsMarkerStep({
        id: 'js-step-2',
        target: 'Customer Name',
        proofSubject: 'field-label',
        method: 'getByLabelText',
      }),
      createJsClickStep('js-step-3', 'Customer Name'),
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      id: 'js-step-2',
      semanticMarkerLink: {
        markerStepId: 'js-step-2',
        anchorStepId: 'js-step-1',
        relation: 'follows',
        proofSubject: 'field-label',
      },
      semanticMarkerCandidate: {
        status: 'qualified',
        anchor: {
          anchorStepId: 'js-step-1',
          relation: 'follows',
        },
      },
    })
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 1,
      unresolvedSemanticMarkers: 0,
      removedRedundantClicks: 1,
      removedDoubleClickNoise: 0,
    })
  })

  it('keeps ambiguous field-adjacent markers unresolved without fabricating control proof', () => {
    const steps: NormalizedStep[] = [
      createJsClickStep('js-step-1', 'Continue'),
      createJsMarkerStep({
        id: 'js-step-2',
        target: 'Customer Reference / Name',
        proofSubject: 'field-label',
        method: 'getByText',
      }),
      createJsClickStep('js-step-3', 'Customer Reference / Name'),
    ]

    const result = filterNoiseSteps(steps)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      id: 'js-step-2',
      semanticMarkerCandidate: {
        status: 'unresolved',
        anchor: {
          anchorStepId: 'js-step-1',
          relation: 'follows',
        },
      },
      unresolvedSemanticMarker: {
        stepId: 'js-step-2',
        reason: 'ambiguous-field-context',
        anchor: {
          anchorStepId: 'js-step-1',
          relation: 'follows',
        },
      },
    })
    expect(result.steps[1]?.semanticMarkerLink).toBeUndefined()
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 1,
      removedRedundantClicks: 1,
      removedDoubleClickNoise: 0,
    })
  })
})

describe('analyzeRecording', () => {
  it('returns diagnostics alongside the cleaned recording', () => {
    const recording: NormalizedRecording = {
      title: 'Save flow',
      rawStepCount: 3,
      steps: [
        { action: 'click', target: '#save', originalType: 'click', source: 'json' },
        { action: 'click', target: '#save', originalType: 'doubleClick', source: 'json' },
        { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.steps).toHaveLength(2)
    expect(result.diagnostics).toEqual({
      removedRedundantClicks: 0,
      removedDoubleClickNoise: 1,
      removedCursorWander: 0,
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 0,
      rawStepCount: 3,
      filteredStepCount: 2,
      intentGroupCount: 1,
    })
    expect(result.intentGroups[0]?.name).toBe('shows Saved')
  })

  it('links qualified markers to the nearest prior major transition step', () => {
    const recording: NormalizedRecording = {
      title: 'Example review flow',
      rawStepCount: 4,
      steps: [
        createJsClickStep('js-step-1', 'Open example flow'),
        createJsFillStep('js-step-2', 'Reference', 'INV-001'),
        createJsClickStep('js-step-3', 'Continue'),
        createJsMarkerStep({
          id: 'js-step-4',
          target: 'Review Example',
          proofSubject: 'heading',
          role: 'heading',
        }),
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.semanticMarkerLinks).toEqual([
      expect.objectContaining({
        markerStepId: 'js-step-4',
        anchorStepId: 'js-step-3',
        relation: 'follows',
        proofSubject: 'heading',
      }),
    ])
    expect(result.unresolvedSemanticMarkers).toEqual([])
    expect(result.steps[3]?.semanticMarkerCandidate).toMatchObject({
      status: 'qualified',
      anchor: {
        anchorStepId: 'js-step-3',
        relation: 'follows',
      },
    })
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 1,
      unresolvedSemanticMarkers: 0,
    })
  })

  it('attaches the sample Add Sale heading marker to the opener click', async () => {
    const { analyzed, parsed } = await loadSampleRestRecordingAnalysis()
    const marker = getStepById(analyzed.steps, 'js-step-4')

    expect(marker.semanticMarkerLink).toMatchObject({
      markerStepId: 'js-step-4',
      anchorStepId: 'js-step-3',
      relation: 'same-target',
      proofSubject: 'heading',
    })
    expect(marker.unresolvedSemanticMarker).toBeUndefined()
    expect(getStepById(parsed.steps, 'js-step-3')).toMatchObject({
      id: 'js-step-3',
      action: 'click',
      target: 'Add Sale (Invoice)',
    })
  })

  it('attaches later sample review markers past intervening non-anchor steps', async () => {
    const { analyzed } = await loadSampleRestRecordingAnalysis()
    const reviewContinue = analyzed.steps
      .filter((step) => step.action === 'click' && step.target === 'Continue')
      .slice(-1)[0]

    expect(reviewContinue).toBeDefined()

    for (const markerStepId of ['js-step-67', 'js-step-69']) {
      const marker = getStepById(analyzed.steps, markerStepId)
      const anchorStepId = marker.semanticMarkerLink?.anchorStepId
      const anchorIndex = getStepIndex(analyzed.steps, anchorStepId ?? '')
      const markerIndex = getStepIndex(analyzed.steps, markerStepId)

      expect(marker.semanticMarkerLink).toMatchObject({
        markerStepId,
        anchorStepId: reviewContinue?.id,
        relation: 'follows',
        proofSubject: 'concrete-value',
      })
      expect(marker.unresolvedSemanticMarker).toBeUndefined()
      expect(markerIndex - anchorIndex).toBeGreaterThan(1)
      expect(analyzed.steps[markerIndex - 1]?.id).not.toBe(reviewContinue?.id)
      expect(
        analyzed.steps
          .slice(anchorIndex + 1, markerIndex)
          .some((step) => step.target === 'Review Sale (Invoice)')
      ).toBe(true)
    }
  })

  it('keeps proof-like JS markers unresolved when earlier steps are only routine edits', () => {
    const recording: NormalizedRecording = {
      title: 'Detached proof',
      rawStepCount: 4,
      steps: [
        createJsFillStep('js-step-1', 'Customer Name', 'Acme'),
        {
          id: 'js-step-2',
          action: 'select',
          target: 'Workflow Type',
          value: 'NORMAL',
          originalType: 'selectOptions',
          source: 'js',
        },
        createJsClickStep('js-step-3', 'Customer Reference'),
        createJsMarkerStep({
          id: 'js-step-4',
          target: 'Saved successfully',
          proofSubject: 'visible-message',
          role: 'status',
        }),
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.semanticMarkerLinks).toEqual([])
    expect(result.unresolvedSemanticMarkers).toEqual([
      expect.objectContaining({
        stepId: 'js-step-4',
        reason: 'missing-anchor',
        proofSubject: 'visible-message',
      }),
    ])
    expect(getStepById(result.steps, 'js-step-4').semanticMarkerCandidate).toMatchObject({
      status: 'unresolved',
    })
    expect(result.diagnostics).toMatchObject({
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 1,
      removedDoubleClickNoise: 0,
    })
  })

  it('keeps JSON dblClick cleanup behavior unchanged and marker-free', () => {
    const recording: NormalizedRecording = {
      title: 'JSON cleanup',
      rawStepCount: 3,
      steps: [
        { action: 'click', target: '#save', originalType: 'click', source: 'json' },
        { action: 'click', target: '#save', originalType: 'doubleClick', source: 'json' },
        { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.steps).toHaveLength(2)
    expect(result.semanticMarkerLinks).toEqual([])
    expect(result.unresolvedSemanticMarkers).toEqual([])
    expect(result.diagnostics).toEqual({
      removedRedundantClicks: 0,
      removedDoubleClickNoise: 1,
      removedCursorWander: 0,
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 0,
      rawStepCount: 3,
      filteredStepCount: 2,
      intentGroupCount: 1,
    })
  })
})

describe('inferIntentGroups', () => {
  it('ignores JS environment sync assertions when grouping recorder intent', () => {
    const analyzed = analyzeRecording({
      title: 'Recorder flow',
      rawStepCount: 4,
      steps: [
        {
          action: 'assert',
          target: 'location.href',
          value: 'http://localhost:3000/example',
          originalType: 'toBe',
          source: 'js',
          metadata: {
            assertion: { kind: 'location' },
            sync: true,
          },
        },
        {
          action: 'assert',
          target: 'document.title',
          value: 'DigiTax',
          originalType: 'toBe',
          source: 'js',
          metadata: {
            assertion: { kind: 'document-title' },
            sync: true,
          },
        },
        {
          action: 'click',
          target: 'Open Example Flow',
          originalType: 'click',
          source: 'js',
        },
        {
          action: 'assert',
          target: 'Open Example Flow',
          originalType: 'getByRole',
          source: 'js',
        },
      ],
    })

    expect(analyzed.intentGroups).toHaveLength(1)
    expect(analyzed.intentGroups[0]?.name).toBe('shows Open Example Flow')
    expect(analyzed.intentGroups[0]?.steps).toHaveLength(2)
  })

  it('splits a cleaned recording into deterministic intent groups', () => {
    const steps: NormalizedStep[] = [
      {
        action: 'navigate',
        target: 'http://localhost:3000/example',
        originalType: 'navigate',
        source: 'json',
      },
      {
        action: 'click',
        target: 'Open Example Flow',
        originalType: 'click',
        source: 'json',
      },
      {
        action: 'assert',
        target: 'Open Example Flow',
        originalType: 'assertElementVisible',
        source: 'json',
      },
      {
        action: 'fill',
        target: 'Customer Name',
        value: 'Acme',
        originalType: 'fill',
        source: 'json',
      },
      {
        action: 'fill',
        target: 'Amount',
        value: '1200',
        originalType: 'fill',
        source: 'json',
      },
      {
        action: 'click',
        target: 'Submit Example Flow',
        originalType: 'click',
        source: 'json',
      },
      {
        action: 'assert',
        target: 'Example flow created',
        originalType: 'assertElementVisible',
        source: 'json',
      },
    ]

    const groups = inferIntentGroups(steps)

    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.name)).toEqual([
      'navigate to http://localhost:3000/example',
      'shows Open Example Flow',
      'shows Example flow created',
    ])
    expect(groups[2]?.steps).toHaveLength(4)
  })

  it('keeps noisy click bursts collapsed before intent naming', () => {
    const recording: NormalizedRecording = {
      title: 'Dialog flow',
      rawStepCount: 5,
      steps: [
        { action: 'click', target: 'Open', originalType: 'click', source: 'json' },
        { action: 'click', target: 'Open', originalType: 'doubleClick', source: 'json' },
        { action: 'assert', target: 'Dialog', originalType: 'assertElementVisible', source: 'json' },
        { action: 'fill', target: 'Name', value: 'Acme', originalType: 'fill', source: 'json' },
        { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
      ],
    }

    const analyzed = analyzeRecording(recording)

    expect(analyzed.diagnostics.intentGroupCount).toBe(2)
    expect(analyzed.intentGroups.map((group) => group.name)).toEqual([
      'shows Dialog',
      'shows Saved',
    ])
  })

  it('marks dialog-like intent groups for visual capture', () => {
    const analyzed = analyzeRecording({
      title: 'Dialog flow',
      rawStepCount: 4,
      steps: [
        { action: 'click', target: 'Open Dialog', originalType: 'click', source: 'json' },
        {
          action: 'assert',
          target: 'Confirmation Dialog',
          originalType: 'assertElementVisible',
          source: 'json',
        },
        { action: 'fill', target: 'Customer Name', value: 'Acme', originalType: 'fill', source: 'json' },
        {
          action: 'assert',
          target: 'Saved',
          originalType: 'assertElementVisible',
          source: 'json',
        },
      ],
    })

    expect(findVisualCaptureCandidates(analyzed)).toEqual([
      {
        groupName: 'shows Confirmation Dialog',
        reason: 'dialog-state',
        selector: 'Open Dialog',
      },
    ])
  })

  it('prefers a non-navigation selector for dialog capture candidates', () => {
    const analyzed = analyzeRecording({
      title: 'Dialog flow',
      rawStepCount: 3,
      steps: [
        {
          action: 'navigate',
          target: 'http://localhost:3000/checkout',
          originalType: 'navigate',
          source: 'json',
        },
        {
          action: 'click',
          target: '.checkout-dialog',
          originalType: 'click',
          source: 'json',
        },
        {
          action: 'assert',
          target: 'Checkout Dialog',
          originalType: 'assertElementVisible',
          source: 'json',
        },
      ],
    })

    expect(findVisualCaptureCandidates(analyzed)).toEqual([
      {
        groupName: 'shows Checkout Dialog',
        reason: 'dialog-state',
        selector: '.checkout-dialog',
      },
    ])
  })

  it('keeps representative JSON fixtures behaviorally stable after cleanup and grouping', async () => {
    const [basicPath, dialogPath] = await Promise.all([
      createRecordingFile('basic', sampleJsonBasicRecording),
      createRecordingFile('dialog', sampleJsonDialogRecording),
    ])

    const [basic, dialog] = await Promise.all([
      parseRecording(basicPath),
      parseRecording(dialogPath),
    ])

    const analyzedBasic = analyzeRecording(basic)
    const analyzedDialog = analyzeRecording(dialog)

    expect(analyzedBasic.intentGroups.map((group) => group.name)).toEqual([
      'navigate to http://localhost:3000/sales',
      'shows Add Sale',
      'shows Sale created',
    ])
    expect(analyzedDialog.diagnostics).toMatchObject({
      removedDoubleClickNoise: 1,
      removedRedundantClicks: 0,
      intentGroupCount: 2,
    })
    expect(analyzedDialog.intentGroups.map((group) => group.name)).toEqual([
      'shows Add Sale dialog',
      'shows Draft saved',
    ])
    expect(findVisualCaptureCandidates(analyzedDialog)).toEqual([
      {
        groupName: 'shows Add Sale dialog',
        reason: 'dialog-state',
        selector: 'Open Add Sale dialog',
      },
    ])
  })
})
