import { describe, expect, it } from 'vitest'

import { evaluateQualityGates } from '#scorer/quality-gates.ts'

describe('evaluateQualityGates', () => {
  it('returns a zero score with a structure error when the code does not parse', () => {
    const result = evaluateQualityGates(`
      describe('broken', () => {
        it('fails', () => {
          expect(true).toBe(true)
    `)

    expect(result).toEqual({
      overall: 0,
      criteria: { structure: 0, queries: 0, matchers: 0, noFragility: 0 },
      issues: [
        expect.objectContaining({
          type: 'structure',
          severity: 'error',
          message: 'Failed to parse code - syntax error',
        }),
      ],
      passed: false,
    })
  })

  it('flags missing describe, missing test blocks, and missing expect statements', () => {
    const result = evaluateQualityGates(`
      import { screen } from '@testing-library/react'

      const helper = () => {
        screen.getByRole('button')
      }
    `)

    expect(result.passed).toBe(false)
    expect(result.criteria.structure).toBe(0)
    expect(result.criteria.matchers).toBe(0)
    expect(result.criteria.queries).toBeGreaterThan(50)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'structure',
          message: 'Missing describe block',
        }),
        expect.objectContaining({
          type: 'structure',
          message: 'Missing test case (it/test)',
        }),
        expect.objectContaining({
          type: 'matchers',
          message: 'No expect statements found',
        }),
      ])
    )
  })

  it('penalizes fragile queries and CSS selector patterns when robust queries are absent', () => {
    const result = evaluateQualityGates(`
      describe('legacy selectors', () => {
        it('uses test ids', () => {
          const node = document.querySelector('.dialog [data-testid="save-button"]')
          expect(node).toBeTruthy()
        })
      })
    `)

    expect(result.criteria.queries).toBe(30)
    expect(result.criteria.noFragility).toBeLessThan(100)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'queries',
          message: 'Using fragile queries (getByTestId, querySelector)',
        }),
        expect.objectContaining({
          type: 'fragility',
          message: expect.stringContaining('Found'),
        }),
        expect.objectContaining({
          type: 'fragility',
          message: expect.stringContaining('test ID'),
        }),
      ])
    )
  })

  it('scores explicit matchers higher than raw expect calls', () => {
    const rawExpect = evaluateQualityGates(`
      describe('raw expect', () => {
        it('asserts loosely', () => {
          expect(value)
        })
      })
    `)
    const matcherExpect = evaluateQualityGates(`
      describe('matcher expect', () => {
        it('asserts clearly', () => {
          expect(value).toEqual('ok')
          expect(other).toContain('x')
        })
      })
    `)

    expect(rawExpect.criteria.matchers).toBe(90)
    expect(matcherExpect.criteria.matchers).toBeGreaterThan(rawExpect.criteria.matchers)
  })

  it('flags repo-disallowed matcher and fragility patterns', () => {
    const result = evaluateQualityGates(`
      import { render, screen, cleanup } from '@testing-library/react'
      import { beforeEach, afterEach, describe, expect, it, vi, waitFor } from 'vitest'

      const mockState = { shouldError: false }
      const save = vi.fn()

      const setup = async () => {
        render(<div>Saved</div>)
        expect(await screen.findByText('Saved')).toBeDefined()
      }

      beforeEach(() => {
        mockState.shouldError = false
      })

      afterEach(() => {
        cleanup()
        document.body.removeAttribute('style')
      })

      describe('Stock modal', () => {
        it('saves values', async () => {
          await setup()
          await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
          expect(save).toHaveBeenCalledWith({ symbol: expect.any(String) })
          expect(screen.getByText(/saved/i)).toBeInTheDocument()
        })
      })
    `)

    expect(result.passed).toBe(true)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'matchers',
          message: 'RTL query results are wrapped in .toBeDefined()',
        }),
        expect.objectContaining({
          type: 'matchers',
          message: 'Mutation payload assertions use loose expect.any/expect.anything matchers',
        }),
        expect.objectContaining({
          type: 'matchers',
          message: 'Mock call count and payload assertions are split across an async boundary',
        }),
        expect.objectContaining({
          type: 'fragility',
          message: 'Setup helper contains assertions',
        }),
        expect.objectContaining({
          type: 'fragility',
          message: 'Shared mutable state is controlling mock behavior',
        }),
        expect.objectContaining({
          type: 'fragility',
          message: 'Teardown compensates for leaked document.body side effects',
        }),
        expect.objectContaining({
          type: 'fragility',
          message: 'Regex text matcher detected for rendered output',
        }),
      ])
    )
  })

  it('applies standalone test-id and helper-shape penalties without CSS selectors', () => {
    const result = evaluateQualityGates(`
      import { describe, expect, it } from 'vitest'

      function setupModal() {
        expect(true).toBe(true)
      }

      describe('details view', () => {
        it('keeps a stable shell', () => {
          const markup = '<div data-testid="details"></div>'
          const tree = { child: { ready: true } }
          expect(tree).toEqual({ child: { ready: true } })
          expect(screen.getByTestId('details')).toBeTruthy()
          foo?.()
          setupModal()
        })
      })
    `)

    expect(result.criteria.queries).toBe(30)
    expect(result.criteria.noFragility).toBeLessThan(100)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'fragility',
          message: expect.stringContaining('test ID'),
        }),
        expect.objectContaining({
          type: 'fragility',
          message: 'Setup helper contains assertions',
        }),
      ])
    )
  })
})
