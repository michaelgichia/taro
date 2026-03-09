import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseJsRecording, classifyQuery, segmentIntoItGroups } from './js-parser.js'

describe('classifyQuery', () => {
  it('rates getByRole as excellent', () => {
    expect(classifyQuery('getByRole')).toBe('excellent')
  })
  it('rates getByLabelText as excellent', () => {
    expect(classifyQuery('getByLabelText')).toBe('excellent')
  })
  it('rates getByText as good', () => {
    expect(classifyQuery('getByText')).toBe('good')
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
      { action: 'click', target: 'Add Sale', value: undefined, originalType: 'click' },
      { action: 'assert', target: 'Add Sale', value: undefined, originalType: 'waitForElement' },
      { action: 'fill', target: 'Customer', value: 'Acme', originalType: 'change' },
    ]
    const groups = segmentIntoItGroups(steps as any)
    expect(groups).toHaveLength(2)
    expect(groups[1].name).toContain('Add Sale')
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
  })

  it('recovers the real sample recorder fixture without fake action targets', async () => {
    const sample = await readFile(
      resolve(process.cwd(), 'sample/sample-rest-recordingextension-output.js'),
      'utf-8'
    )

    const recording = await parseJsRecording(sample)

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
        metadata: expect.objectContaining({
          query: expect.objectContaining({
            method: 'getByRole',
            name: 'Add Sale (Invoice)',
            role: 'heading',
          }),
        }),
      }),
    ])
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
})
