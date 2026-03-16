import { describe, expect, it } from 'vitest'

import {
  groupDialogSteps,
  resetDialogIdCounter,
} from '#parser/steps/dialog-detector.ts'
import type { RecordingStep } from '#types/recording.ts'

function createStep(
  overrides: Partial<RecordingStep> = {}
): RecordingStep {
  return {
    id: 'json-step-1',
    type: 'click',
    action: 'click',
    target: 'button',
    timestamp: 1_000,
    ...overrides,
  }
}

describe('groupDialogSteps', () => {
  it('returns an empty list when no steps are provided', () => {
    expect(groupDialogSteps([])).toEqual([])
  })

  it('groups trigger, content, assertion, and close steps into a dialog flow', () => {
    resetDialogIdCounter()

    const flows = groupDialogSteps([
      createStep({
        id: 'json-step-1',
        selector: '[data-testid="open-drawer"]',
        target: '[data-testid="open-drawer"]',
        timestamp: 1_000,
      }),
      createStep({
        id: 'json-step-2',
        type: 'fill',
        action: 'fill',
        selector: 'input[name="email"]',
        value: 'user@example.com',
        timestamp: 1_010,
      }),
      createStep({
        id: 'json-step-3',
        type: 'select',
        action: 'select',
        selector: 'select[name="role"]',
        value: 'admin',
        timestamp: 1_020,
      }),
      createStep({
        id: 'json-step-4',
        type: 'waitForSelector',
        action: 'waitForSelector',
        selector: '[role="dialog"]',
        timestamp: 1_030,
      }),
      createStep({
        id: 'json-step-5',
        type: 'keyDown',
        action: 'keyDown',
        value: 'Escape',
        selector: 'body',
        target: 'body',
        timestamp: 1_040,
      }),
    ])

    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      id: 'dialog_1',
      type: 'drawer',
      triggerStep: expect.objectContaining({ id: 'json-step-1' }),
      contentSteps: [
        expect.objectContaining({ id: 'json-step-2' }),
        expect.objectContaining({ id: 'json-step-3' }),
      ],
      assertionStep: expect.objectContaining({ id: 'json-step-4' }),
      closeStep: expect.objectContaining({ id: 'json-step-5' }),
      timestamp: 1_000,
    })
  })

  it('starts a new flow when another dialog trigger appears before the current one closes', () => {
    resetDialogIdCounter()

    const flows = groupDialogSteps([
      createStep({
        id: 'json-step-1',
        selector: '[data-testid="open-modal"]',
        timestamp: 1_000,
      }),
      createStep({
        id: 'json-step-2',
        selector: '[data-testid="open-popover"]',
        timestamp: 1_100,
      }),
      createStep({
        id: 'json-step-3',
        type: 'fill',
        action: 'fill',
        selector: 'textarea',
        value: 'hello',
        timestamp: 1_110,
      }),
    ])

    expect(flows).toHaveLength(2)
    expect(flows[0]).toMatchObject({
      id: 'dialog_1',
      type: 'modal',
      triggerStep: expect.objectContaining({ id: 'json-step-1' }),
      contentSteps: [],
    })
    expect(flows[1]).toMatchObject({
      id: 'dialog_2',
      type: 'popover',
      triggerStep: expect.objectContaining({ id: 'json-step-2' }),
      contentSteps: [expect.objectContaining({ id: 'json-step-3' })],
    })
  })

  it('closes an open dialog on overlay clicks and ignores unsupported step types', () => {
    resetDialogIdCounter()

    const flows = groupDialogSteps([
      createStep({
        id: 'json-step-1',
        selector: '[role="dialog"][aria-modal="true"]',
        timestamp: 1_000,
      }),
      createStep({
        id: 'json-step-2',
        type: 'scroll',
        action: 'scroll',
        selector: '[data-testid="ignored"]',
        timestamp: 1_010,
      }),
      createStep({
        id: 'json-step-3',
        type: 'keyDown',
        action: 'keyDown',
        selector: 'input[type="text"]',
        value: 'a',
        timestamp: 1_020,
      }),
      createStep({
        id: 'json-step-4',
        selector: 'body',
        target: 'body',
        timestamp: 1_030,
      }),
    ])

    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      contentSteps: [expect.objectContaining({ id: 'json-step-3' })],
      closeStep: expect.objectContaining({ id: 'json-step-4' }),
    })
  })

  it('discards stale dialogs without meaningful content and closes on non-trigger clicks', () => {
    resetDialogIdCounter()

    const flows = groupDialogSteps([
      createStep({
        id: 'json-step-1',
        selector: '[aria-haspopup="dialog"]',
        timestamp: 1_000,
      }),
      createStep({
        id: 'json-step-2',
        type: 'fill',
        action: 'fill',
        selector: 'input[name="name"]',
        value: 'late',
        timestamp: 40_500,
      }),
      createStep({
        id: 'json-step-3',
        selector: '[data-testid="open-confirm"]',
        timestamp: 41_000,
      }),
      createStep({
        id: 'json-step-4',
        type: 'click',
        action: 'click',
        selector: '.outside-shell',
        target: '.outside-shell',
        timestamp: 41_010,
      }),
    ])

    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      triggerStep: expect.objectContaining({ id: 'json-step-3' }),
      closeStep: expect.objectContaining({ id: 'json-step-4' }),
      contentSteps: [],
    })
  })

})
