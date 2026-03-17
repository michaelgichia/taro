import { describe, expect, it } from 'vitest'

import { preWriteAudit } from '#scorer/pre-audit.ts'

describe('preWriteAudit', () => {
  it('returns blocking issues from quality errors and structural checks', () => {
    const result = preWriteAudit(`
      const helper = () => {
        querySelector('.legacy')
      }
    `)

    expect(result.valid).toBe(false)
    expect(result.blocking).toEqual(
      expect.arrayContaining([
        'Missing describe block',
        'Missing test case (it/test)',
        'No expect statements found',
        'Missing @testing-library/react import or render() call',
        'Missing describe block - tests must be organized in describe()',
        'Missing test case - need it() or test() blocks',
        'Missing expect statements - tests must have assertions',
      ])
    )
    expect(result.warnings).toContain('Using querySelector - consider Testing Library queries')
    expect(result.qualityScore).toBeUndefined()
  })

  it('returns quality score details and warnings for valid but fragile code', () => {
    const code = `
      import { render, screen } from '@testing-library/react'
      import { describe, expect, it } from 'vitest'

      describe('checkout form', () => {
        it('renders saved state', async () => {
          render(<div data-testid="status">Saved</div>)
          expect(screen.getByTestId('status')).toBeInTheDocument()
        })
      })
    `

    const result = preWriteAudit(code)

    expect(result.valid).toBe(true)
    expect(result.blocking).toEqual([])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Using getByTestId - consider semantic queries',
      ])
    )
    expect(result.qualityScore).toEqual(
      expect.objectContaining({
        overall: expect.any(Number),
        criteria: expect.objectContaining({
          structure: expect.any(Number),
          queries: expect.any(Number),
          matchers: expect.any(Number),
          noFragility: expect.any(Number),
        }),
        issues: expect.arrayContaining([
          expect.objectContaining({
            type: 'fragility',
          }),
        ]),
      })
    )
  })

  it('warns when async code lacks findBy queries or specific matchers', () => {
    const result = preWriteAudit(`
      import { render, screen } from '@testing-library/react'
      import { describe, expect, it } from 'vitest'

      describe('checkout form', () => {
        it('renders saved state', async () => {
          render(<div>Saved</div>)
          expect(await screen.getByText('Saved'))
        })
      })
    `)

    expect(result.valid).toBe(true)
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Consider using more specific matchers (toBe, toEqual, toContain)',
        'Async operations detected - consider using findBy* queries for async elements',
      ])
    )
  })
})
