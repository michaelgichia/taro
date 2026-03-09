import { describe, expect, it } from 'vitest'
import { normalizeStep } from './parser.js'
import {
  analyzeRecording,
  findVisualCaptureCandidates,
  filterNoiseSteps,
  inferIntentGroups,
} from './recording-intelligence.js'
import type { ChromeStep, NormalizedRecording, NormalizedStep } from '../types/recording.js'

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
      rawStepCount: 3,
      filteredStepCount: 2,
      intentGroupCount: 1,
    })
    expect(result.intentGroups[0]?.name).toBe('submit #save')
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
          value: 'http://localhost:3000/sales',
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
          target: 'Add Sale',
          originalType: 'click',
          source: 'js',
        },
        {
          action: 'assert',
          target: 'Add Sale',
          originalType: 'getByRole',
          source: 'js',
        },
      ],
    })

    expect(analyzed.intentGroups).toHaveLength(1)
    expect(analyzed.intentGroups[0]?.name).toBe('confirm Add Sale')
    expect(analyzed.intentGroups[0]?.steps).toHaveLength(2)
  })

  it('splits a cleaned recording into deterministic intent groups', () => {
    const steps: NormalizedStep[] = [
      {
        action: 'navigate',
        target: 'http://localhost:3000/sales',
        originalType: 'navigate',
        source: 'json',
      },
      {
        action: 'click',
        target: 'Add Sale',
        originalType: 'click',
        source: 'json',
      },
      {
        action: 'assert',
        target: 'Add Sale',
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
        target: 'Submit Sale',
        originalType: 'click',
        source: 'json',
      },
      {
        action: 'assert',
        target: 'Sale created',
        originalType: 'assertElementVisible',
        source: 'json',
      },
    ]

    const groups = inferIntentGroups(steps)

    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.name)).toEqual([
      'navigate to http://localhost:3000/sales',
      'confirm Add Sale',
      'submit Submit Sale',
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
      'confirm Open',
      'edit Name',
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
        groupName: 'confirm Open Dialog',
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
        groupName: 'confirm .checkout-dialog',
        reason: 'dialog-state',
        selector: '.checkout-dialog',
      },
    ])
  })
})
