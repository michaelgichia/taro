import { describe, expect, it } from 'vitest'

import {
  generateDialogTestCode,
  transformDialogFlows,
} from '#generator/transforms/dialog-transform.ts'
import type { DialogFlow } from '#parser/steps/dialog-detector.ts'
import type { RecordingStep } from '#types/recording.ts'

function createStep(
  overrides: Partial<RecordingStep> = {}
): RecordingStep {
  return {
    id: 'json-step-1',
    type: 'click',
    action: 'click',
    target: 'button',
    ...overrides,
  }
}

function createFlow(
  overrides: Partial<DialogFlow> = {}
): DialogFlow {
  return {
    id: 'flow-1',
    type: 'modal',
    triggerStep: createStep({
      selector: '#open-settings',
      target: '#open-settings',
    }),
    contentSteps: [],
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('transformDialogFlows', () => {
  it('returns an empty list when no dialog flows are provided', () => {
    expect(transformDialogFlows([])).toEqual([])
  })

  it('builds modal, drawer, popover, confirm, and fallback dialog templates', () => {
    const templates = transformDialogFlows([
      createFlow({
        id: 'modal-flow',
        type: 'modal',
        triggerStep: createStep({
          selector: '#open-settings',
          target: '#open-settings',
        }),
        contentSteps: [
          createStep({
            id: 'json-step-2',
            type: 'fill',
            action: 'fill',
            selector: '[data-testid="name-input"]',
            value: 'Alice',
          }),
        ],
        closeStep: createStep({
          id: 'json-step-3',
          selector: '[aria-label="Close"]',
        }),
        assertionStep: createStep({
          id: 'json-step-4',
          type: 'assert',
          action: 'assert',
          selector: '[data-testid="success-banner"]',
        }),
      }),
      createFlow({
        id: 'drawer-flow',
        type: 'drawer',
        triggerStep: createStep({
          id: 'json-step-5',
          selector: '[data-testid="open-drawer"]',
        }),
        contentSteps: [
          createStep({
            id: 'json-step-6',
            type: 'select',
            action: 'select',
            selector: '[aria-label="Role"]',
            value: 'admin',
          }),
        ],
        assertionStep: createStep({
          id: 'json-step-7',
          type: 'waitForSelector',
          action: 'waitForSelector',
          selector: '[role="complementary"]',
        }),
      }),
      createFlow({
        id: 'popover-flow',
        type: 'popover',
        triggerStep: createStep({
          id: 'json-step-8',
          selector: 'button menu-trigger',
          target: 'button menu-trigger',
        }),
        contentSteps: [
          createStep({
            id: 'json-step-9',
            type: 'fill',
            action: 'fill',
            selector: '[name="email"]',
            value: 'user@example.com',
          }),
        ],
        assertionStep: createStep({
          id: 'json-step-10',
          type: 'assert',
          action: 'assert',
          selector: 'text status message',
        }),
      }),
      createFlow({
        id: 'confirm-flow',
        type: 'confirm',
        triggerStep: createStep({
          id: 'json-step-11',
          selector: '[data-testid="open-confirm"]',
        }),
        contentSteps: [
          createStep({
            id: 'json-step-12',
            type: 'fill',
            action: 'fill',
            selector: 'label:Notes',
            value: 'Ship now',
          }),
        ],
      }),
      createFlow({
        id: 'fallback-flow',
        type: 'form' as DialogFlow['type'],
        triggerStep: createStep({
          id: 'json-step-13',
          selector: '',
          target: 'Launch Dialog',
        }),
        contentSteps: [
          createStep({
            id: 'json-step-14',
            type: 'fill',
            action: 'fill',
            selector: '',
            value: 'fallback text',
          }),
          createStep({
            id: 'json-step-15',
            type: 'click',
            action: 'click',
            selector: '[data-testid="noop"]',
          }),
        ],
        assertionStep: createStep({
          id: 'json-step-16',
          type: 'click',
          action: 'click',
          selector: '',
        }),
      }),
    ])

    expect(templates).toHaveLength(5)

    expect(templates[0].helpers[0].code).toContain("screen.getByRole('button', { name: /open-settings/i })")
    expect(templates[0].helpers[0].code).toContain("screen.getByRole('dialog')")
    expect(templates[0].testSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'await openDialog();',
        }),
        expect.objectContaining({
          code: "await userEvent.type(screen.getByTestId(\"name-input\"), 'Alice');",
        }),
        expect.objectContaining({
          code: "await userEvent.click(screen.getByRole('button', { name: /submit/i }));",
        }),
        expect.objectContaining({
          code: 'await waitFor(() => expect(screen.getByTestId("success-banner")).toBeInTheDocument());',
        }),
      ])
    )
    expect(templates[0].cleanup).toEqual([
      expect.objectContaining({
        code: "await userEvent.keyboard('{Escape}');",
      }),
    ])

    expect(templates[1].helpers[0].code).toContain("screen.getByTestId(\"open-drawer\")")
    expect(templates[1].helpers[0].code).toContain("screen.getByTestId('drawer')")
    expect(templates[1].testSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "await userEvent.selectOptions(screen.getByLabelText(/Role/i), 'admin');",
        }),
        expect.objectContaining({
          code: "await waitFor(() => expect(screen.getByRole('complementary')).toBeInTheDocument());",
        }),
      ])
    )

    expect(templates[2].helpers[0].code).toContain("screen.getByRole('button', { name: /menu-trigger/i })")
    expect(templates[2].helpers[0].code).toContain("screen.getByRole('tooltip')")
    expect(templates[2].testSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'user@example.com');",
        }),
        expect.objectContaining({
          code: "await waitFor(() => expect(screen.getByText(/.+/)).toBeInTheDocument());",
        }),
      ])
    )

    expect(templates[3].helpers[0].code).toContain("screen.getByRole('alertdialog')")
    expect(templates[3].testSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "await userEvent.type(screen.getByLabelText(/Notes/i), 'Ship now');",
        }),
      ])
    )

    expect(templates[4].helpers[0].code).toContain("screen.getByRole('button', { name: /Dialog/i })")
    expect(templates[4].helpers[0].code).toContain("screen.getByRole('dialog')")
    expect(templates[4].testSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "await userEvent.type(screen.getByRole('textbox'), 'fallback text');",
        }),
        expect.objectContaining({
          code: '',
          description: 'Verify dialog state',
        }),
      ])
    )
    expect(templates[4].testSteps).toHaveLength(3)
  })
})

describe('generateDialogTestCode', () => {
  it('renders helpers, steps, and cleanup blocks in order', () => {
    const code = generateDialogTestCode({
      helpers: [
        {
          type: 'helper',
          code: 'const openDialog = async () => {};',
          description: 'helper',
        },
      ],
      testSteps: [
        {
          type: 'action',
          code: 'await openDialog();',
          description: 'open',
        },
        {
          type: 'assertion',
          code: 'expect(true).toBe(true);',
          description: 'assert',
        },
      ],
      cleanup: [
        {
          type: 'action',
          code: "await userEvent.keyboard('{Escape}');",
          description: 'cleanup',
        },
      ],
    })

    expect(code).toBe([
      'const openDialog = async () => {};',
      '',
      'await openDialog();',
      'expect(true).toBe(true);',
      '',
      "await userEvent.keyboard('{Escape}');",
    ].join('\n'))
  })

})
