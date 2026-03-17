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
  it('fails fast when the file does not exist', () => {
    const filePath = join(tmpdir(), `missing-${Date.now()}.test.tsx`)

    const result = postWriteVerification(filePath)

    expect(result).toEqual({
      valid: false,
      errors: [`File does not exist: ${filePath}`],
      warnings: [],
      filePath,
      parsed: false,
    })
  })

  it('reports unreadable file paths when readFileSync throws', () => {
    const root = mkdtempSync(join(tmpdir(), 'taro-post-verify-dir-'))
    sandboxRoots.push(root)

    const result = postWriteVerification(root)

    expect(result.valid).toBe(false)
    expect(result.parsed).toBe(false)
    expect(result.errors[0]).toContain('Failed to read file:')
  })

  it('reports syntax parse errors with line information when TypeScript parsing fails', () => {
    const filePath = writeTestFile(`
      import { render } from '@testing-library/react'

      it('breaks syntax', () => {
        render(<div>)
      })
    `)

    const result = postWriteVerification(filePath)

    expect(result.valid).toBe(false)
    expect(result.parsed).toBe(false)
    expect(result.errors[0]).toContain('Syntax parse error')
  })

  it('flags missing imports, empty tests, and common hygiene warnings', () => {
    const filePath = writeTestFile(`
      it.skip('skipped case', () => {
        console.log('skip me')
      })

      test.only('only case', () => {
        screen.debug()
      })

it('empty test', () => {})

      // TODO: finish this test
    `)

    const result = postWriteVerification(filePath)

    expect(result.valid).toBe(false)
    expect(result.parsed).toBe(true)
    expect(result.errors).toContain('Missing required import: @testing-library/react')
    expect(result.warnings).toContain(
      'No describe import detected - ensure describe is available globally or imported'
    )
    expect(result.warnings).toContain(
      'No expect import detected - ensure expect is available globally or imported'
    )
    expect(result.warnings).toContain(
      'No render() call detected - tests should use Testing Library render'
    )
    expect(result.warnings).toContain(
      'screen.debug() found - remove before committing to production'
    )
    expect(result.warnings).toContain(
      'Found 1 skipped test(s) - consider removing .skip or adding reason'
    )
    expect(result.warnings).toContain(
      'Found 1 .only test(s) - remove .only before committing'
    )
    expect(result.warnings).toContain(
      'Found 1 console.log statement(s) - consider removing for cleaner test output'
    )
    expect(result.warnings).toContain(
      'Found TODO comment(s) - ensure tests are complete before finishing'
    )
  })

  it('accepts vitest globals references without import warnings', () => {
    const filePath = writeTestFile(`
      /// <reference types="vitest" />
      import { render } from '@testing-library/react'

      test('renders with globals', () => {
        render(<div>Ready</div>)
        expect(true).toBe(true)
      })
    `)

    const result = postWriteVerification(filePath)

    expect(result.valid).toBe(true)
    expect(result.warnings).not.toContain(
      'No describe import detected - ensure describe is available globally or imported'
    )
    expect(result.warnings).not.toContain(
      'No it/test import detected - ensure test functions are available globally or imported'
    )
    expect(result.warnings).not.toContain(
      'No expect import detected - ensure expect is available globally or imported'
    )
  })

  it('warns when test functions are neither imported nor globally referenced', () => {
    const filePath = writeTestFile(`
      import { describe, expect } from 'vitest'
      import { render } from '@testing-library/react'

      describe('renders with globals', () => {
        render(<div>Ready</div>)
        expect(true).toBe(true)
      })
    `)

    const result = postWriteVerification(filePath)

    expect(result.warnings).toContain(
      'No it/test import detected - ensure test functions are available globally or imported'
    )
  })

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
