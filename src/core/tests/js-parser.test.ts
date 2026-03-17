import { describe, expect, it } from 'vitest'

import {
  __jsParserTestUtils,
  classifyQuery,
  parseJsRecording,
  segmentIntoItGroups,
} from '#core/js-parser.ts'
import { sampleRestRecordingJs } from '#tests/fixtures/sample-fixtures.ts'

describe('classifyQuery', () => {
  it('rates getByRole as excellent', () => {
    expect(classifyQuery('getByRole')).toBe('excellent')
  })
  it('rates findByRole and getAllByRole using the same family quality', () => {
    expect(classifyQuery('findByRole')).toBe('excellent')
    expect(classifyQuery('getAllByRole')).toBe('excellent')
  })
  it('rates getByLabelText as excellent', () => {
    expect(classifyQuery('getByLabelText')).toBe('excellent')
  })
  it('rates getByText as good', () => {
    expect(classifyQuery('getByText')).toBe('good')
  })
  it('rates queryByTitle as acceptable', () => {
    expect(classifyQuery('queryByTitle')).toBe('acceptable')
  })
  it('rates getByPlaceholderText as acceptable', () => {
    expect(classifyQuery('getByPlaceholderText')).toBe('acceptable')
  })
  it('rates getByTestId as fragile', () => {
    expect(classifyQuery('getByTestId')).toBe('fragile')
  })
})

describe('segmentIntoItGroups', () => {
  it('returns single group when no modal boundary exists', () => {
    const steps = [
      { action: 'click', target: 'button', value: undefined, originalType: 'click' },
      { action: 'fill', target: 'input', value: 'hello', originalType: 'change' },
    ]
    const groups = segmentIntoItGroups(steps as any)
    expect(groups).toHaveLength(1)
  })

  it('splits into two groups at modal boundary (click button + heading same name)', () => {
    const steps = [
      { action: 'navigate', target: 'http://localhost:3000', value: undefined, originalType: 'navigate' },
      { action: 'click', target: 'Open Example Flow', value: undefined, originalType: 'click' },
      { action: 'assert', target: 'Open Example Flow', value: undefined, originalType: 'waitForElement' },
      { action: 'fill', target: 'Customer', value: 'Acme', originalType: 'change' },
    ]
    const groups = segmentIntoItGroups(steps as any)
    expect(groups).toHaveLength(2)
    expect(groups[1].name).toContain('Open Example Flow')
  })
})

describe('parseJsRecording', () => {
  it('throws on non-JS input', async () => {
    await expect(parseJsRecording('{ "steps": [] }')).rejects.toThrow()
  })

  it('recovers nested userEvent targets and expect assertions structurally', async () => {
    const recording = await parseJsRecording(`
      /**
       * My Flow
       * @jest-environment${'-options'} {"url":"http://localhost:3000"}
       */
      test('Recorder Flow', async () => {
        expect(location.href).toBe('http://localhost:3000')
        expect(document.title).toBe('DigiTax')
        await userEvent.click(screen.getByRole('button', {name: 'Save'}))
        await userEvent.type(document.querySelector('#line-items input'), '4')
        screen.getByText('Saved')
      })
    `)

    expect(recording.title).toBe('Recorder Flow')
    expect(recording.environmentUrl).toBe('http://localhost:3000')
    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'assert',
          source: 'js',
          target: 'location.href',
          value: 'http://localhost:3000',
        }),
        expect.objectContaining({
          action: 'assert',
          source: 'js',
          target: 'document.title',
          value: 'DigiTax',
        }),
        expect.objectContaining({
          action: 'click',
          source: 'js',
          target: 'Save',
          line: expect.any(Number),
          metadata: expect.objectContaining({
            query: expect.objectContaining({
              method: 'getByRole',
              name: 'Save',
              queryRoot: 'screen',
              role: 'button',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'fill',
          source: 'js',
          target: '#line-items input',
          value: '4',
          metadata: expect.objectContaining({
            selector: expect.objectContaining({
              selector: '#line-items input',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'assert',
          source: 'js',
          target: 'Saved',
          metadata: expect.objectContaining({
            query: expect.objectContaining({
              method: 'getByText',
              target: 'Saved',
            }),
          }),
        }),
      ])
    )
    expect(recording.querySelectorCalls).toEqual([
      expect.objectContaining({
        selector: '#line-items input',
        stepId: expect.any(String),
      }),
    ])
    expect(recording.semanticMarkerCandidates).toEqual([])
  })

  it('parses supported RTL query variants without collapsing them to getBy-only assumptions', async () => {
    const recording = await parseJsRecording(`
      test('Recorder Flow', async () => {
        await userEvent.click(screen.queryByText('Save'))
        await userEvent.click(await screen.findByRole('button', {name: 'Continue'}))
        screen.getAllByRole('listitem')
      })
    `)

    expect(recording.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'queryByText',
          target: 'Save',
        }),
        expect.objectContaining({
          method: 'findByRole',
          role: 'button',
          name: 'Continue',
        }),
        expect.objectContaining({
          method: 'getAllByRole',
          role: 'listitem',
        }),
      ])
    )
  })

  it('recovers the real sample recorder fixture without fake action targets', async () => {
    const recording = await parseJsRecording(sampleRestRecordingJs)

    expect(recording.title).toBe('Recording-Add-Sale-KE-06/03/2026 at 08:25:15')
    expect(recording.environmentUrl).toBe(
      'http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales'
    )
    expect(recording.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'location',
          target: 'location.href',
        }),
        expect.objectContaining({
          kind: 'document-title',
          target: 'document.title',
        }),
      ])
    )
    expect(recording.steps.slice(0, 4)).toEqual([
      expect.objectContaining({
        action: 'assert',
        source: 'js',
        target: 'location.href',
        value:
          'http://localhost:3001/dashboard/orgs/organisation_01J19WTB4J3DZYD730T2K58KRF/apps/business_01JCK47QRT925ZFTVZGJAVPQE7?tab=sales',
      }),
      expect.objectContaining({
        action: 'assert',
        source: 'js',
        target: 'document.title',
      }),
      expect.objectContaining({
        action: 'click',
        source: 'js',
        target: 'Add Sale (Invoice)',
        metadata: expect.objectContaining({
          query: expect.objectContaining({
            method: 'getByRole',
            name: 'Add Sale (Invoice)',
            role: 'button',
          }),
        }),
      }),
      expect.objectContaining({
        action: 'click',
        source: 'js',
        target: 'Add Sale (Invoice)',
        originalType: 'dblClick',
        semanticMarkerCandidate: expect.objectContaining({
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'heading',
          proofText: 'Add Sale (Invoice)',
        }),
        metadata: expect.objectContaining({
          query: expect.objectContaining({
            method: 'getByRole',
            name: 'Add Sale (Invoice)',
            role: 'heading',
          }),
        }),
      }),
    ])
    expect(recording.semanticMarkerCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'heading',
          proofText: 'Add Sale (Invoice)',
          query: expect.objectContaining({
            method: 'getByRole',
            role: 'heading',
          }),
        }),
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'visible-message',
          proofText: 'Please enter quantity',
          query: expect.objectContaining({
            method: 'getByText',
            target: 'Please enter quantity',
          }),
        }),
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'concrete-value',
          proofText: 'KES 4,800.00',
          query: expect.objectContaining({
            method: 'getByText',
            target: 'KES 4,800.00',
          }),
        }),
      ])
    )
    expect(recording.querySelectorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: 'div.css-19bb58m',
        }),
        expect.objectContaining({
          selector:
            '#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) input',
        }),
      ])
    )
    expect(recording.steps.find((step) => step.target === 'click')).toBeUndefined()
    expect(recording.steps.find((step) => step.target === 'type')).toBeUndefined()
    expect(recording.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'getByRole',
          quality: 'excellent',
          target: 'Add Sale (Invoice)',
        }),
        expect.objectContaining({
          method: 'getByText',
          quality: 'good',
          target: 'KES 4,800.00',
        }),
      ])
    )
    expect(recording.selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: 'div.css-19bb58m',
        }),
      ])
    )
  })

  it('keeps field-label dblClick steps distinguishable as unresolved non-proof candidates', async () => {
    const recording = await parseJsRecording(`
      test('Recorder Flow', async () => {
        await userEvent.dblClick(screen.getByText('Customer Reference'))
      })
    `)

    expect(recording.steps[0]).toEqual(
      expect.objectContaining({
        action: 'click',
        originalType: 'dblClick',
        target: 'Customer Reference',
        semanticMarkerCandidate: expect.objectContaining({
          status: 'unresolved',
          originalGesture: 'dblClick',
          proofSubject: 'field-label',
          proofText: 'Customer Reference',
          query: expect.objectContaining({
            method: 'getByText',
            target: 'Customer Reference',
          }),
        }),
      })
    )
    expect(recording.semanticMarkerCandidates).toEqual([
      expect.objectContaining({
        status: 'unresolved',
        proofSubject: 'field-label',
        proofText: 'Customer Reference',
      }),
    ])
  })

  it('preserves selector-only evidence without inventing accessible queries', async () => {
    const recording = await parseJsRecording(`
      test('Recorder Flow', async () => {
        await userEvent.click(document.querySelector('div.css-19bb58m'))
      })
    `)

    expect(recording.selectors).toEqual([
      expect.objectContaining({
        selector: 'div.css-19bb58m',
        selectorKind: 'document.querySelector',
      }),
    ])
    expect(recording.steps[0]).toEqual(
      expect.objectContaining({
        target: 'div.css-19bb58m',
        metadata: expect.not.objectContaining({
          query: expect.anything(),
        }),
      })
    )
  })

  it('uses the docblock title fallback and captures goto, within queries, selector calls, and custom assertions', async () => {
    const recording = await parseJsRecording(`
      /**
       * Checkout Summary - 16/03/2026 at 08:15:00
       * @jest-environment-options {"mode":"test"}
       */
      async function flow() {
        await page.goto('http://localhost:3000/checkout')
        await userEvent.keyboard('{Escape}')
        await userEvent.clear(screen.getByLabelText('Customer Name'))
        expect(user.profile.name).toEqual('Ada')
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' })
        document.querySelectorAll('.line-item')
      }
    `)

    expect(recording.title).toContain('Checkout Summary')
    expect(recording.title).toContain('16/03/2026')
    expect(recording.environmentUrl).toBeUndefined()
    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'navigate',
          target: 'http://localhost:3000/checkout',
          originalType: 'goto',
        }),
        expect.objectContaining({
          action: 'keyDown',
          target: '{Escape}',
          value: undefined,
          originalType: 'keyboard',
        }),
        expect.objectContaining({
          action: 'fill',
          target: 'Customer Name',
          originalType: 'clear',
          metadata: expect.objectContaining({
            query: expect.objectContaining({
              method: 'getByLabelText',
              queryRoot: 'screen',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'assert',
          target: 'user.profile.name',
          value: 'Ada',
          originalType: 'toEqual',
        }),
        expect.objectContaining({
          action: 'assert',
          target: 'Confirm',
          originalType: 'getByRole',
        }),
      ])
    )
    expect(recording.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'getByRole',
          queryRoot: 'within',
          role: 'button',
          name: 'Confirm',
        }),
      ])
    )
    expect(recording.selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: '.line-item',
          selectorKind: 'document.querySelectorAll',
        }),
      ])
    )
    expect(recording.querySelectorCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: '.line-item',
        }),
      ])
    )
    expect(recording.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'custom',
          target: 'user.profile.name',
        }),
        expect.objectContaining({
          kind: 'query-result',
          queryMethod: 'getByRole',
          target: 'Confirm',
        }),
      ])
    )
  })

  it('captures selector proof subjects, alert/status proofs, display values, and unknown userEvent methods', async () => {
    const recording = await parseJsRecording(`
      it('Semantic coverage', async () => {
        await userEvent.dblClick(document.querySelector('#status'))
        await userEvent.dblClick(screen.getByRole('alert'))
        await userEvent.dblClick(screen.getByDisplayValue('KES 10.00'))
        await userEvent.hover('preview')
        screen.getByRole('status')
      })
    `)

    expect(recording.semanticMarkerCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proofSubject: 'selector-target',
          selector: expect.objectContaining({ selector: '#status' }),
        }),
        expect.objectContaining({
          proofSubject: 'visible-message',
          query: expect.objectContaining({ role: 'alert' }),
        }),
        expect.objectContaining({
          proofSubject: 'concrete-value',
          query: expect.objectContaining({ method: 'getByDisplayValue' }),
        }),
      ])
    )
    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'unknown',
          originalType: 'hover',
          target: 'preview',
        }),
      ])
    )
    expect(recording.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'query-result',
          queryMethod: 'getByRole',
          target: 'status',
        }),
      ])
    )
  })

  it('covers environment parsing fallbacks, literal extraction, and unknown semantic proofs', async () => {
    const recording = await parseJsRecording(`
      /**
       * Fallback Flow
       * @jest-environment-options {"url":
       */
      it('Fallback Flow', async () => {
        await userEvent.click(screen.getByRole('button'))
        await userEvent.type(\`customer-\${1}\`, true)
        await userEvent.dblClick(screen.queryByTitle('Preview'))
        expect(this.formState).toEqual(3)
      })
    `)

    expect(recording.environmentUrl).toBeUndefined()
    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'click',
          target: 'button',
          metadata: expect.objectContaining({
            query: expect.objectContaining({
              role: 'button',
              target: 'button',
            }),
          }),
        }),
        expect.objectContaining({
          action: 'fill',
          target: 'type',
          value: 'true',
        }),
        expect.objectContaining({
          action: 'click',
          originalType: 'dblClick',
          semanticMarkerCandidate: expect.objectContaining({
            proofSubject: 'unknown',
          }),
        }),
        expect.objectContaining({
          action: 'assert',
          target: 'this.formState',
          value: '3',
        }),
      ])
    )
  })

  it('covers document-root queries, template-literal selectors, selector fallbacks, and plain member targets', async () => {
    const recording = await parseJsRecording(`
      test('Document root flow', async () => {
        await userEvent.click(document.getByText('Saved'))
        await userEvent.click(document.querySelector(\`.dialog-title\`))
        await userEvent.click(document.querySelector(selectorVar))
        await userEvent.click(window.checkout.summary)
        await userEvent.dblClick(screen.getByText('Preview'))
      })
    `)

    expect(recording.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queryRoot: 'document',
          method: 'getByText',
          target: 'Saved',
        }),
      ])
    )
    expect(recording.selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: '.dialog-title',
          selectorKind: 'document.querySelector',
        }),
      ])
    )
    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'window.checkout.summary',
        }),
        expect.objectContaining({
          originalType: 'dblClick',
          semanticMarkerCandidate: expect.objectContaining({
            proofSubject: 'field-label',
          }),
        }),
      ])
    )
  })

  it('treats missing semantic proof text as non-concrete and non-message content', () => {
    expect(__jsParserTestUtils.looksLikeConcreteValue(undefined)).toBe(false)
    expect(__jsParserTestUtils.looksLikeVisibleMessage(undefined)).toBe(false)
    expect(__jsParserTestUtils.sliceSource('const ok = true')).toBeUndefined()
    expect(
      __jsParserTestUtils.extractPlainObject({
        type: 'ObjectExpression',
        properties: [
          {
            type: 'ObjectProperty',
            computed: true,
            key: { type: 'Identifier', name: 'dynamicKey' },
            value: { type: 'StringLiteral', value: 'skip-me' },
          },
          {
            type: 'ObjectProperty',
            computed: false,
            key: { type: 'StringLiteral', value: 'name' },
            value: { type: 'Identifier', name: 'dynamicValue' },
          },
        ],
      } as never)
    ).toEqual({})
  })

  it('handles user-event and expect calls that omit their target subject', async () => {
    const recording = await parseJsRecording(`
      test('Recorder Flow', async () => {
        await userEvent.click()
        expect().toBe(true)
      })
    `)

    expect(recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'click',
          target: 'click',
        }),
      ])
    )
    expect(recording.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: undefined,
        }),
      ])
    )
  })

  it('keeps only literal option entries when query option objects mix literal and dynamic values', async () => {
    const recording = await parseJsRecording(`
      test('Recorder Flow', async () => {
        const selected = window.__selected
        screen.getByRole('button', { 'name': 'Save', selected })
      })
    `)

    expect(recording.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'getByRole',
          options: {
            name: 'Save',
          },
        }),
      ])
    )
  })
})
