import { afterEach, describe, expect, it, vi } from 'vitest'

import { emitQuerySummary } from '#core/generator.query-summary.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emitQuerySummary', () => {
  it('does not write anything when no query results were collected', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    emitQuerySummary([])

    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('groups query methods and includes fragile line references', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    emitQuerySummary([
      { method: 'getByTestId', query: "screen.getByTestId('save')", quality: 'fragile', line: 3 },
      { method: 'getByTestId', query: "screen.getByTestId('cancel')", quality: 'fragile', line: 7 },
      { method: 'getByRole', query: "screen.getByRole('button')", quality: 'excellent' },
    ])

    expect(writeSpy.mock.calls).toEqual([
      [expect.stringContaining('2 getByTestId (fragile')],
      [expect.stringContaining('1 getByRole (excellent)')],
    ])
    expect(writeSpy.mock.calls[0]?.[0]).toContain('see lines 3, 7')
    expect(writeSpy.mock.calls[1]?.[0]).not.toContain('see line')
  })
})
