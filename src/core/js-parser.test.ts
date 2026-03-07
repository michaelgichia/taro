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

  it('tags parsed steps with JS source metadata', async () => {
    const recording = await parseJsRecording(`
      /**
       * My Flow
       * @jest-environment-options {"url":"http://localhost:3000"}
       */
      page.goto('http://localhost:3000')
      userEvent.click('Save')
      screen.getByText('Saved')
    `)

    expect(recording.steps).toEqual([
      expect.objectContaining({
        action: 'navigate',
        source: 'js',
        line: expect.any(Number),
      }),
      expect.objectContaining({
        action: 'click',
        source: 'js',
        line: expect.any(Number),
      }),
      expect.objectContaining({
        action: 'assert',
        source: 'js',
        line: expect.any(Number),
      }),
    ])
  })
})
