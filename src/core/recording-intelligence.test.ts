import { describe, expect, it } from 'vitest'
import { normalizeStep } from './parser.js'
import { analyzeRecording, filterNoiseSteps } from './recording-intelligence.js'
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
    expect(result.intentGroups[0]?.name).toBe('interact with #save')
  })
})
