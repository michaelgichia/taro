import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { postWriteVerification } from '#scorer/post-verify.ts'

const sandboxRoots: string[] = []

afterEach(() => {
  sandboxRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function writeTestFile(code: string): string {
  const root = mkdtempSync(join(tmpdir(), 'taro-post-verify-'))
  sandboxRoots.push(root)
  const filePath = join(root, 'Generated.test.tsx')
  writeFileSync(filePath, code, 'utf8')
  return filePath
}

describe('postWriteVerification', () => {
  it('warns on repo-disallowed RTL and teardown patterns', () => {
    const filePath = writeTestFile(`
      import { cleanup, render, screen } from '@testing-library/react'
      import { afterEach, describe, expect, it, vi, waitFor } from 'vitest'

      const scenario = { shouldFail: false }

      const setup = async () => {
        render(<div>Ready</div>)
        expect(await screen.findByText('Ready')).toBeDefined()
      }

      const save = vi.fn()

      beforeEach(() => {
        resetDataLayerMock()
        save.mockReset()
        scenario.shouldFail = false
      })

      afterEach(() => {
        cleanup()
        document.body.removeAttribute('style')
      })

      describe('Stock modal', () => {
        it('submits values', async () => {
          await setup()
          await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
          expect(save).toHaveBeenCalledWith({
            symbol: expect.any(String),
          })
          expect(screen.getByText(/saved/i)).toBeInTheDocument()
        })
      })
    `)

    const result = postWriteVerification(filePath)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain(
      'Avoid .toBeDefined() on RTL query results - rely on the query throw or use .toBeInTheDocument().'
    )
    expect(result.warnings).toContain(
      'Keep assertions out of setup helpers - shared interaction utilities should prepare state, not assert outcomes.'
    )
    expect(result.warnings).toContain(
      'Avoid loose payload matchers for known user-driven values - assert exact mutation payload fields when the test set them explicitly.'
    )
    expect(result.warnings).toContain(
      'Avoid mutable shared objects to control mock behavior - hoist plain vi.fn() mocks, keep vi.mock factories shape-only, set the default mockImplementation in beforeEach, and override per-test with a complete mockImplementation.'
    )
    expect(result.warnings).toContain(
      'Keep async mock call count and payload assertions inside the same waitFor callback to avoid race conditions.'
    )
    expect(result.warnings).toContain(
      'Avoid teardown that combines cleanup() with manual document.body mutations - fix the component leak at the source instead.'
    )
    expect(result.warnings).toContain(
      'Avoid regex text matchers for exact rendered contracts unless the pattern itself is the behavior under test.'
    )
    expect(result.warnings).toContain(
      'Avoid mixed reset boundaries - use either a shared reset helper or explicit suite-local mock resets, not both.'
    )
  })
})
