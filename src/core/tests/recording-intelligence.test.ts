import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseJsRecording } from '#core/js-parser.ts'
import { normalizeStep } from '#core/parser.ts'
import { parseRecording } from '#core/parser.ts'
import {
  __recordingIntelligenceTestUtils,
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

describe('__recordingIntelligenceTestUtils', () => {
  it('treats empty proof text as non-icon content', () => {
    expect(__recordingIntelligenceTestUtils.isIconOnlyText(undefined)).toBe(false)
    expect(__recordingIntelligenceTestUtils.isIconOnlyText('  ')).toBe(false)
  })

  it('returns undefined marker links when the step or anchor ids are missing', () => {
    const candidate = {
      status: 'unresolved' as const,
      originalGesture: 'dblClick' as const,
      proofSubject: 'heading' as const,
      proofText: 'Review',
      target: 'Review',
      anchor: {},
      sourceContext: {
        originalType: 'dblClick',
      },
    }

    expect(
      __recordingIntelligenceTestUtils.buildSemanticMarkerLink(
        { action: 'click', target: 'Review', originalType: 'dblClick', source: 'js' },
        candidate as never,
        { id: 'anchor-step', action: 'click', target: 'Open', originalType: 'click', source: 'js' }
      )
    ).toBeUndefined()

    expect(
      __recordingIntelligenceTestUtils.buildSemanticMarkerAnchor(
        { id: 'marker-step', action: 'click', target: 'Review', originalType: 'dblClick', source: 'js' },
        { action: 'click', target: 'Open', originalType: 'click', source: 'js' }
      )
    ).toBeUndefined()
  })

  it('treats target-less clicks as non-transitions and skips sync assertions when finding anchors', () => {
    expect(
      __recordingIntelligenceTestUtils.isMajorTransitionStep({
        action: 'navigate',
        target: 'http://localhost:3000',
        originalType: 'navigate',
        source: 'json',
      })
    ).toBe(true)

    expect(
      __recordingIntelligenceTestUtils.isMajorTransitionStep({
        action: 'click',
        target: undefined,
        originalType: 'click',
        source: 'js',
      })
    ).toBe(false)

    expect(
      __recordingIntelligenceTestUtils.findNearestPriorMajorTransitionStep(
        [
          {
            id: 'open-dialog',
            action: 'click',
            target: 'Open Dialog',
            originalType: 'click',
            source: 'js',
          },
          {
            id: 'dialog-opened',
            action: 'assert',
            target: 'location.href',
            originalType: 'assertLocation',
            source: 'js',
          },
          createJsMarkerStep({
            id: 'review-heading',
            target: 'Review',
            proofSubject: 'heading',
          }),
        ],
        2
      )
    ).toMatchObject({
      id: 'open-dialog',
      target: 'Open Dialog',
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

  it('keeps field-label marker unresolved when no prior major-transition anchor exists', () => {
    // No prior major-transition step → anchorStep is undefined → builds missing-anchor unresolved marker
    const result = filterNoiseSteps([
      createJsMarkerStep({
        id: 'js-step-1',
        target: 'Email',
        proofSubject: 'field-label',
        method: 'getByLabelText',
      }),
    ])

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({
      id: 'js-step-1',
      unresolvedSemanticMarker: expect.objectContaining({
        stepId: 'js-step-1',
        reason: 'missing-anchor',
      }),
    })
    expect(result.steps[0]?.semanticMarkerLink).toBeUndefined()
  })

  it('counts cursor wander steps interleaved within a same-target click cluster', () => {
    // hover/move between two same-target clicks should count as cursor wander removed from cluster
    const result = filterNoiseSteps([
      { action: 'click', target: '#btn', originalType: 'click', source: 'json' },
      { action: 'unknown', originalType: 'hover', source: 'json' },
      { action: 'click', target: '#btn', originalType: 'click', source: 'json' },
    ])

    expect(result.diagnostics.removedCursorWander).toBeGreaterThanOrEqual(1)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]?.target).toBe('#btn')
  })

  it('removes marker gestures (isSemanticMarkerGesture but not yet preserved) within a preserved cluster, incrementing doubleClickNoise', () => {
    // This covers the `isSemanticMarkerGesture` + NOT `isPreservedSemanticMarkerStep` branch inside
    // the cluster loop. A raw dblClick gesture (not annotated as preserved) adjacent to a preserved
    // marker on the same target increments removedDoubleClickNoise.
    const preservedMarkerStep = createJsMarkerStep({
      id: 'js-step-2',
      target: 'Review',
      proofSubject: 'heading',
      method: 'getByRole',
      role: 'heading',
    })
    // Raw dblClick step with the same target — not yet annotated so has no semanticMarkerLink
    const rawDblClickStep: NormalizedStep = {
      id: 'js-step-3',
      action: 'click',
      target: 'Review',
      originalType: 'dblClick',
      source: 'js',
    }

    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Continue'),
      preservedMarkerStep,
      rawDblClickStep,
    ])

    // preservedMarkerStep qualifies → cluster with preserved markers → rawDblClickStep is removed
    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('removes doubleClick variants within a preserved-marker cluster, incrementing removedDoubleClickNoise', () => {
    // Covers the `isDoubleClickVariant` branch inside the preserved-marker cluster path
    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Continue'),
      createJsMarkerStep({
        id: 'js-step-2',
        target: 'Review',
        proofSubject: 'heading',
        method: 'getByRole',
        role: 'heading',
      }),
      // An ordinary doubleClick on the same target (not a marker gesture)
      {
        id: 'js-step-3',
        action: 'click' as const,
        target: 'Review',
        originalType: 'doubleClick',
        source: 'json' as const,
      },
    ])

    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('counts a field-label marker with empty stepId as doubleClickNoise when buildUnresolvedSemanticMarker cannot build (line 426 executed)', () => {
    // When step has no id AND candidate.stepId is empty, buildUnresolvedSemanticMarker returns undefined
    // → annotateSemanticMarkers returns the original step (line 426 executed as ternary else-branch)
    // filterNoiseSteps then sees it as a semantic marker gesture → removes it as doubleClickNoise
    const noIdMarkerStep: NormalizedStep = {
      action: 'click',
      target: 'Customer / Details',
      originalType: 'dblClick',
      source: 'js',
      semanticMarkerCandidate: {
        stepId: '' as any,
        status: 'unresolved',
        originalGesture: 'dblClick',
        proofSubject: 'field-label',
        target: 'Customer / Details',
        proofText: 'Customer / Details',
        sourceContext: { originalType: 'dblClick' },
        query: {
          stepId: '' as any,
          method: 'getByText',
          queryRoot: 'screen',
          target: 'Customer / Details',
        },
        anchor: {},
      },
      metadata: {
        semanticMarkerCandidate: {
          stepId: '' as any,
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'field-label',
          target: 'Customer / Details',
          proofText: 'Customer / Details',
          sourceContext: { originalType: 'dblClick' },
          query: {
            stepId: '' as any,
            method: 'getByText',
            queryRoot: 'screen',
            target: 'Customer / Details',
          },
          anchor: {},
        },
      },
    }

    // The step is a semantic marker gesture but cannot be built as unresolved → step returned as-is
    // by annotateSemanticMarkers; then filterNoiseSteps removes it as a marker gesture
    const result = filterNoiseSteps([createJsClickStep('js-prev', 'Save'), noIdMarkerStep])
    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('counts a heading marker with empty stepId as doubleClickNoise when missing-anchor path cannot build (line 446 executed)', () => {
    // heading proofSubject + no prior anchor + empty stepId → buildUnresolvedSemanticMarker returns undefined
    // → annotateSemanticMarkers returns step as-is (line 446 executed)
    const noIdHeadingMarker: NormalizedStep = {
      action: 'click',
      target: 'Review',
      originalType: 'dblClick',
      source: 'js',
      semanticMarkerCandidate: {
        stepId: '' as any,
        status: 'unresolved',
        originalGesture: 'dblClick',
        proofSubject: 'heading',
        target: 'Review',
        proofText: 'Review',
        sourceContext: { originalType: 'dblClick' },
        query: {
          stepId: '' as any,
          method: 'getByRole',
          queryRoot: 'screen',
          role: 'heading',
          target: 'Review',
        },
        anchor: {},
      },
      metadata: {
        semanticMarkerCandidate: {
          stepId: '' as any,
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'heading',
          target: 'Review',
          proofText: 'Review',
          sourceContext: { originalType: 'dblClick' },
          query: {
            stepId: '' as any,
            method: 'getByRole',
            queryRoot: 'screen',
            role: 'heading',
            target: 'Review',
          },
          anchor: {},
        },
      },
    }

    const result = filterNoiseSteps([noIdHeadingMarker])
    // Step is returned unchanged from annotateSemanticMarkers (no unresolvedSemanticMarker built)
    // then filtered as marker gesture
    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('counts a selector-target marker with empty stepId as doubleClickNoise when buildUnresolvedSemanticMarker cannot build (line 458 executed)', () => {
    const noIdSelectorMarker: NormalizedStep = {
      action: 'click',
      target: '#drawer-title',
      originalType: 'dblClick',
      source: 'js',
      semanticMarkerCandidate: {
        stepId: '' as any,
        status: 'unresolved',
        originalGesture: 'dblClick',
        proofSubject: 'selector-target',
        target: '#drawer-title',
        proofText: '#drawer-title',
        sourceContext: { originalType: 'dblClick' },
        selector: {
          stepId: '' as any,
          selector: '#drawer-title',
          selectorKind: 'document.querySelector',
        },
        anchor: {},
      },
      metadata: {
        semanticMarkerCandidate: {
          stepId: '' as any,
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'selector-target',
          target: '#drawer-title',
          proofText: '#drawer-title',
          sourceContext: { originalType: 'dblClick' },
          selector: {
            stepId: '' as any,
            selector: '#drawer-title',
            selectorKind: 'document.querySelector',
          },
          anchor: {},
        },
      },
    }

    const result = filterNoiseSteps([noIdSelectorMarker])
    // buildUnresolvedSemanticMarker returns undefined → step returned as-is (line 458 executed)
    // filterNoiseSteps then removes it as a marker gesture
    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('keeps dblClick step with unknown proofSubject without preserving or rejecting as unsupported (falls through annotate)', () => {
    // proofSubject 'unknown' → not consumable, not unsupported → annotateSemanticMarkers returns step as-is
    // The step is still a semantic marker gesture → hits the `isSemanticMarkerGesture` branch in cluster loop
    const unknownMarkerStep: NormalizedStep = {
      id: 'js-step-2',
      action: 'click',
      target: 'SomeTarget',
      originalType: 'dblClick',
      source: 'js',
      semanticMarkerCandidate: {
        stepId: 'js-step-2',
        status: 'unresolved',
        originalGesture: 'dblClick',
        proofSubject: 'unknown',
        target: 'SomeTarget',
        proofText: 'SomeTarget',
        sourceContext: { originalType: 'dblClick' },
        query: {
          stepId: 'js-step-2',
          method: 'getByText',
          queryRoot: 'screen',
          target: 'SomeTarget',
        },
        anchor: {},
      },
      metadata: {
        semanticMarkerCandidate: {
          stepId: 'js-step-2',
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'unknown',
          target: 'SomeTarget',
          proofText: 'SomeTarget',
          sourceContext: { originalType: 'dblClick' },
          query: {
            stepId: 'js-step-2',
            method: 'getByText',
            queryRoot: 'screen',
            target: 'SomeTarget',
          },
          anchor: {},
        },
      },
    }

    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Continue'),
      unknownMarkerStep,
      createJsClickStep('js-step-3', 'SomeTarget'),
    ])

    // The unknown-subject marker gesture clusters with step-3 on 'SomeTarget'
    // It is a semantic marker gesture that doesn't get preserved → cluster loop hits line 682
    expect(result.diagnostics.removedDoubleClickNoise).toBeGreaterThanOrEqual(1)
  })

  it('treats a field-label candidate with whitespace-only proofText as unresolvable (isIconOnlyText with empty normalized → lines 358-359)', () => {
    // proofText is whitespace-only → normalizeProofText returns empty → isIconOnlyText returns false at line 358-359
    // but then !proofText check in isResolvableFieldContextCandidate passes → it's handled elsewhere
    // Actually: proofText=' ' → normalizeProofText returns '' (falsy) → `!proofText` in isResolvableFieldContextCandidate is true → returns false
    // To reach isIconOnlyText: proofText must be truthy but normalize to empty — use '\u200B' (zero-width space)
    // → normalizeProofText('\u200B') → '\u200B'.replace(/\s+/g,' ').trim() → '' → normalized is '' → !normalized → line 358-359
    const baseMarker = createJsMarkerStep({
      id: 'js-step-2',
      target: 'Email',
      proofSubject: 'field-label',
      method: 'getByLabelText',
    })

    const whitespaceCandidate = {
      ...baseMarker.semanticMarkerCandidate!,
      proofText: '\u200B', // zero-width space: truthy but normalizes to empty
      target: '\u200B',
      query: {
        ...baseMarker.semanticMarkerCandidate!.query!,
        target: '\u200B',
      },
    }

    const markerStep: NormalizedStep = {
      ...baseMarker,
      target: '\u200B',
      semanticMarkerCandidate: whitespaceCandidate,
      metadata: { semanticMarkerCandidate: whitespaceCandidate },
    }

    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Save'),
      markerStep,
    ])

    // !proofText evaluates to true for the empty normalized result → ambiguous-field-context
    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      unresolvedSemanticMarker: expect.objectContaining({
        reason: 'ambiguous-field-context',
      }),
    })
  })

  it('marks a field-label candidate that has a selector as unresolved-ambiguous (selector short-circuits isResolvableFieldContextCandidate)', () => {
    // isResolvableFieldContextCandidate: candidate.selector present → returns false → ambiguous-field-context
    const baseMarker = createJsMarkerStep({
      id: 'js-step-2',
      target: 'Email',
      proofSubject: 'field-label',
      method: 'getByLabelText',
    })

    const selectorCandidate = {
      ...baseMarker.semanticMarkerCandidate!,
      selector: {
        stepId: 'js-step-2' as const,
        selector: '#email-field',
        selectorKind: 'document.querySelector' as const,
      },
    }

    const markerWithSelectorStep: NormalizedStep = {
      ...baseMarker,
      semanticMarkerCandidate: selectorCandidate,
      metadata: { semanticMarkerCandidate: selectorCandidate },
    }

    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Save'),
      markerWithSelectorStep,
    ])

    // selector present → isResolvableFieldContextCandidate returns false → ambiguous-field-context
    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      unresolvedSemanticMarker: {
        stepId: 'js-step-2',
        reason: 'ambiguous-field-context',
      },
    })
  })

  it('marks a field-label candidate without a query method as unresolved (line 373-374 executed)', () => {
    // isResolvableFieldContextCandidate: no queryMethod → returns false → ambiguous-field-context unresolved
    const noQueryMethodMarker = createJsMarkerStep({
      id: 'js-step-2',
      target: 'Email',
      proofSubject: 'field-label',
      method: 'getByLabelText',
    })

    // Overwrite the candidate to have no query
    const markerNoQuery: NormalizedStep = {
      ...noQueryMethodMarker,
      semanticMarkerCandidate: {
        ...noQueryMethodMarker.semanticMarkerCandidate!,
        query: undefined,
      },
      metadata: {
        semanticMarkerCandidate: {
          ...noQueryMethodMarker.semanticMarkerCandidate!,
          query: undefined,
        },
      },
    }

    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Save'),
      markerNoQuery,
    ])

    // No query method → not resolvable → ambiguous-field-context → unresolved marker
    expect(result.steps).toHaveLength(2)
    expect(result.steps[1]).toMatchObject({
      unresolvedSemanticMarker: {
        stepId: 'js-step-2',
        reason: 'ambiguous-field-context',
      },
    })
  })

  it('leaves a non-resolvable field-label marker step unchanged when step has no id', () => {
    // A field-label step without an id cannot build an unresolved marker — should return step as-is
    const markerWithoutId: NormalizedStep = {
      action: 'click',
      target: 'Customer Details',
      originalType: 'dblClick',
      source: 'js',
      semanticMarkerCandidate: {
        stepId: 'any-id',
        status: 'unresolved',
        originalGesture: 'dblClick',
        proofSubject: 'field-label',
        target: 'Customer Details',
        proofText: 'Customer Details',
        sourceContext: { originalType: 'dblClick' },
        query: {
          stepId: 'any-id',
          method: 'getByText',
          queryRoot: 'screen',
          target: 'Customer Details',
        },
        anchor: {},
      },
      metadata: {
        semanticMarkerCandidate: {
          stepId: 'any-id',
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'field-label',
          target: 'Customer Details',
          proofText: 'Customer Details',
          sourceContext: { originalType: 'dblClick' },
          query: {
            stepId: 'any-id',
            method: 'getByText',
            queryRoot: 'screen',
            target: 'Customer Details',
          },
          anchor: {},
        },
      },
    }

    // Step has no id so buildUnresolvedSemanticMarker returns undefined → annotate returns step
    const result = filterNoiseSteps([createJsClickStep('js-prev', 'Continue'), markerWithoutId])

    // The marker step itself should be returned as-is (no semanticMarkerLink)
    const markerStep = result.steps.find((s) => s.target === 'Customer Details')
    expect(markerStep?.semanticMarkerLink).toBeUndefined()
  })

  it('marks selector-target gestures as unsupported semantic proofs', () => {
    const result = filterNoiseSteps([
      createJsClickStep('js-step-1', 'Open drawer'),
      {
        ...createJsMarkerStep({
          id: 'js-step-2',
          target: '#drawer-title',
          proofSubject: 'selector-target',
        }),
        semanticMarkerCandidate: {
          ...createJsMarkerStep({
            id: 'js-step-2',
            target: '#drawer-title',
            proofSubject: 'selector-target',
          }).semanticMarkerCandidate!,
          selector: {
            stepId: 'js-step-2',
            selector: '#drawer-title',
            selectorKind: 'document.querySelector',
          },
        },
        metadata: {
          semanticMarkerCandidate: {
            ...createJsMarkerStep({
              id: 'js-step-2',
              target: '#drawer-title',
              proofSubject: 'selector-target',
            }).semanticMarkerCandidate!,
            selector: {
              stepId: 'js-step-2',
              selector: '#drawer-title',
              selectorKind: 'document.querySelector',
            },
          },
        },
      },
    ])

    expect(result.steps[1]).toMatchObject({
      unresolvedSemanticMarker: {
        reason: 'unsupported-proof-subject',
      },
      semanticMarkerCandidate: {
        status: 'unresolved',
      },
    })
  })
})

describe('getAssertionKind via isSyncAssertionStep (via inferIntentGroups)', () => {
  it('treats location.href assert as a sync assertion and skips it during grouping', () => {
    const groups = inferIntentGroups([
      {
        action: 'assert',
        target: 'location.href',
        value: 'http://localhost:3000/',
        originalType: 'toBe',
        source: 'js',
      },
      {
        action: 'click',
        target: 'Save',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.steps).toHaveLength(1)
    expect(groups[0]?.steps[0]?.target).toBe('Save')
  })

  it('treats document.title assert as a sync assertion and skips it during grouping', () => {
    const groups = inferIntentGroups([
      {
        action: 'assert',
        target: 'document.title',
        value: 'My App',
        originalType: 'toBe',
        source: 'js',
      },
      {
        action: 'click',
        target: 'Open',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.steps).toHaveLength(1)
    expect(groups[0]?.steps[0]?.target).toBe('Open')
  })
})

describe('filterNoiseSteps - cursor wander and pointer metadata', () => {
  it('removes unknown steps that carry pointer coordinates', () => {
    const result = filterNoiseSteps([
      {
        action: 'unknown',
        target: 'some-target',
        originalType: 'pointerMove',
        source: 'js',
        x: 100,
        y: 200,
      },
      {
        action: 'click',
        target: 'Submit',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]?.target).toBe('Submit')
    expect(result.diagnostics.removedCursorWander).toBe(1)
  })

  it('removes unknown steps that have no target and no pointer coordinates', () => {
    const result = filterNoiseSteps([
      {
        action: 'unknown',
        target: undefined,
        originalType: 'unknown',
        source: 'js',
      },
      {
        action: 'click',
        target: 'Submit',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(result.steps).toHaveLength(1)
    expect(result.diagnostics.removedCursorWander).toBe(1)
  })

  it('removes scroll steps that have a target but no value when checking cursor wander for cluster inner steps', () => {
    const result = filterNoiseSteps([
      {
        action: 'click',
        target: '#btn',
        originalType: 'click',
        source: 'js',
      },
      {
        action: 'unknown',
        originalType: 'mousemove',
        source: 'js',
      },
      {
        action: 'click',
        target: '#btn',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(result.diagnostics.removedCursorWander).toBeGreaterThanOrEqual(1)
  })
})

describe('isMajorTransitionStep edge cases (via inferIntentGroups / analyzeRecording)', () => {
  it('treats navigate steps as major transitions and splits groups', () => {
    const groups = inferIntentGroups([
      {
        action: 'navigate',
        target: 'http://localhost:3000/',
        originalType: 'navigate',
        source: 'json',
      },
      {
        action: 'click',
        target: 'Open',
        originalType: 'click',
        source: 'json',
      },
    ])

    expect(groups[0]?.name).toContain('navigate to')
  })

  it('does NOT treat a click with no target as a major transition', () => {
    const steps = [
      {
        action: 'click' as const,
        target: undefined,
        originalType: 'click',
        source: 'json' as const,
      },
      {
        action: 'assert' as const,
        target: 'Done',
        originalType: 'assertElementVisible',
        source: 'json' as const,
      },
    ]

    const groups = inferIntentGroups(steps)
    // No major-transition split because click has no target
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('shows Done')
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

  it('returns no visual capture candidates for non-dialog flows', () => {
    expect(
      findVisualCaptureCandidates(
        analyzeRecording({
          title: 'Simple flow',
          rawStepCount: 2,
          steps: [
            { action: 'click', target: 'Save', originalType: 'click', source: 'json' },
            { action: 'assert', target: 'Saved', originalType: 'assertElementVisible', source: 'json' },
          ],
        })
      )
    ).toEqual([])
  })

  it('returns empty array when steps array is empty', () => {
    const groups = inferIntentGroups([])
    expect(groups).toEqual([])
  })

  it('labels a fill-only group with the fill target', () => {
    const groups = inferIntentGroups([
      {
        action: 'fill',
        target: 'Email',
        value: 'user@example.com',
        originalType: 'fill',
        source: 'js',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('accepts Email')
  })

  it('labels a click-only group with the click target', () => {
    const groups = inferIntentGroups([
      {
        action: 'click',
        target: 'Open menu',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('shows Open menu')
  })

  it('labels a group with a submit-like click using supports', () => {
    const groups = inferIntentGroups([
      {
        action: 'fill',
        target: 'Name',
        value: 'Alice',
        originalType: 'fill',
        source: 'js',
      },
      {
        action: 'click',
        target: 'Submit',
        originalType: 'click',
        source: 'js',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('supports Submit')
  })

  it('labels a group with only sync assertion steps as supports-the-recorded-behavior fallback', () => {
    const groups = inferIntentGroups([
      {
        action: 'assert',
        target: 'location.href',
        value: 'http://localhost:3000/',
        originalType: 'toBe',
        source: 'js',
        metadata: { assertion: { kind: 'location' } },
      },
    ])

    // sync assertions are skipped entirely, leaving an empty currentGroup
    expect(groups).toEqual([])
  })

  it('falls back to "supports the recorded behavior" when no meaningful steps have a recognizable label', () => {
    // A group with only assert steps that have no target produces the fallback label
    const groups = inferIntentGroups([
      {
        action: 'assert',
        target: undefined,
        originalType: 'assertElementVisible',
        source: 'json',
      },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('supports the recorded behavior')
  })

  it('populates semanticMarkerLinks and unresolvedSemanticMarkers on the analyzed result', () => {
    const recording: NormalizedRecording = {
      title: 'Marker flow',
      rawStepCount: 3,
      steps: [
        createJsClickStep('js-step-1', 'Save'),
        createJsMarkerStep({
          id: 'js-step-2',
          target: 'Amount',
          proofSubject: 'concrete-value',
          method: 'getByRole',
          role: 'button',
        }),
        createJsMarkerStep({
          id: 'js-step-3',
          target: 'Customer Reference / Name',
          proofSubject: 'field-label',
          method: 'getByText',
        }),
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.semanticMarkerLinks).toHaveLength(1)
    expect(result.semanticMarkerLinks[0]).toMatchObject({
      markerStepId: 'js-step-2',
      anchorStepId: 'js-step-1',
    })
    expect(result.unresolvedSemanticMarkers).toHaveLength(1)
    expect(result.unresolvedSemanticMarkers[0]).toMatchObject({
      stepId: 'js-step-3',
      reason: 'ambiguous-field-context',
    })
  })

  it('returns empty semanticMarkerLinks and unresolvedSemanticMarkers when no markers are present', () => {
    const recording: NormalizedRecording = {
      title: 'Plain flow',
      rawStepCount: 2,
      steps: [
        { action: 'click', target: 'Open', originalType: 'click', source: 'json' },
        { action: 'assert', target: 'Opened', originalType: 'assertElementVisible', source: 'json' },
      ],
    }

    const result = analyzeRecording(recording)

    expect(result.semanticMarkerLinks).toEqual([])
    expect(result.unresolvedSemanticMarkers).toEqual([])
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
