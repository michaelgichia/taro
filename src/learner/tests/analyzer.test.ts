import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  analyzeTestFile,
  extractConventions,
} from '#learner/analyzer.ts'
import { createEmptyConvention } from '#learner/types.ts'

const sandboxRoots: string[] = []

afterEach(() => {
  sandboxRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
  vi.restoreAllMocks()
})

function createSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'taro-learner-analyzer-'))
  sandboxRoots.push(root)
  return root
}

describe('analyzeTestFile', () => {
  it('extracts naming, structure, query, matcher, and import conventions from a valid test file', () => {
    const root = createSandbox()
    const filePath = join(root, 'order-flow.test.tsx')

    writeFileSync(filePath, `
      import { render, screen } from '@testing-library/react'
      import { beforeEach, describe, expect, it } from 'vitest'
      import helper from '@app/testing/utils'

      function makeSubject() {
        return render(<button data-testid="save-button">Save</button>)
      }

      describe('order-flow modal', () => {
        beforeEach(() => {
          helper()
        })

        it('renders save action', () => {
          makeSubject()
          expect(screen.getByRole('button')).toBeInTheDocument()
          expect(screen.getByTestId('save-button')).toBeVisible()
          expect(document.querySelector('.legacy')).not.toContain('hidden')
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    expect(result.naming).toEqual({
      pattern: 'kebab-case',
      describePrefix: 'order-flow modal',
      itTemplate: 'renders {description}',
    })
    expect(result.structure).toEqual({
      describePerComponent: false,
      helpersInDescribe: false,
      setupLocation: 'inside-describe',
    })
    expect(result.queries).toEqual({
      preferred: ['getByRole'],
      avoided: ['querySelector', 'getByTestId'],
    })
    expect(result.matchers?.common).toEqual([])
    expect(result.imports?.common).toEqual(
      expect.arrayContaining(['@testing-library/react', 'vitest', '@app/testing'])
    )
  })

  it('returns an empty partial and warns when the file cannot be parsed', () => {
    const root = createSandbox()
    const filePath = join(root, 'broken.test.tsx')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    writeFileSync(filePath, `
      import { render } from '@testing-library/react'

      it('breaks parsing', () => {
        render(<div>)
      })
    `)

    expect(analyzeTestFile(filePath)).toEqual({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to parse ${filePath}:`),
      expect.anything()
    )
  })

  it('captures snake_case prefixes, negated matchers, and top-level setup patterns', () => {
    const root = createSandbox()
    const filePath = join(root, 'account_detail.test.ts')

    writeFileSync(filePath, `
      import { beforeEach, describe, expect, it } from 'vitest'
      import localHelper from './local-helper'

      beforeEach(() => {
        localHelper()
      })

      function topLevelHelper() {
        return true
      }

      describe('account_detail modal', () => {
        it('should validate fields', () => {
          expect(value).not.toBe('bad')
          expect(screen.getByLabelText('Name')).toBeRequired()
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    expect(result.naming).toEqual({
      pattern: 'snake_case',
      describePrefix: 'account_detail modal',
      itTemplate: 'should {description}',
    })
    expect(result.queries).toEqual({
      preferred: ['getByLabelText'],
      avoided: [],
    })
    expect(result.structure).toEqual({
      describePerComponent: false,
      helpersInDescribe: false,
      setupLocation: 'inside-describe',
    })
  })

  it('detects camelCase describe patterns and import filtering for package names', () => {
    const root = createSandbox()
    const filePath = join(root, 'camel-case.test.ts')

    writeFileSync(filePath, `
      import { describe, expect, test } from 'vitest'
      import { render } from '@testing-library/react'
      import runtime from '/virtual/runtime'
      import localHelper from './local-helper'

      describe('accountDetails', () => {
        test('custom flow wording', () => {
          expect(render).toHaveBeenCalled()
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    expect(result.naming?.pattern).toBe('camelCase')
    expect(result.imports?.common).toEqual(
      expect.arrayContaining(['vitest', '@testing-library/react'])
    )
    expect(result.imports?.common).not.toContain('.')
  })
})

describe('extractConventions', () => {
  it('merges conventions across nested test files in a directory tree', () => {
    const root = createSandbox()
    const nested = join(root, 'nested')
    mkdirSync(nested, { recursive: true })

    writeFileSync(join(root, 'cart-item-list.test.tsx'), `
      import { render, screen } from '@testing-library/react'
      import { describe, expect, it } from 'vitest'

      describe('cart-item', () => {
        it('shows items', () => {
          render(<div>Cart</div>)
          expect(screen.getByText('Cart')).toBeVisible()
        })
      })
    `)

    writeFileSync(join(nested, 'cart-item-detail.spec.ts'), `
      import { screen } from '@testing-library/react'
      import { describe, expect, test } from 'vitest'

      describe('cart-item', () => {
        test('returns details', () => {
          expect(screen.getByTestId('details')).toBeTruthy()
        })
      })
    `)

    const result = extractConventions(root)

    expect(result.naming.pattern).toBe('kebab-case')
    expect(result.naming.describePrefix).toBe('cart-item')
    expect(result.naming.itTemplate).toBe('returns {description}')
    expect(result.structure).toEqual({
      describePerComponent: true,
      helpersInDescribe: false,
      setupLocation: 'inside-describe',
    })
    expect(result.queries.preferred).toEqual(expect.arrayContaining(['getByText']))
    expect(result.queries.avoided).toEqual(expect.arrayContaining(['getByTestId']))
    expect(result.matchers.common).toEqual([])
    expect(result.imports.common).toEqual(
      expect.arrayContaining(['@testing-library/react', 'vitest'])
    )
  })

  it('returns the default convention and warns when a directory has no test files', () => {
    const root = createSandbox()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(extractConventions(root)).toEqual(createEmptyConvention())
    expect(warnSpy).toHaveBeenCalledWith(`No test files found in ${root}`)
  })

  it('covers default naming/query fallbacks and outside-describe setup detection', () => {
    const root = createSandbox()

    writeFileSync(join(root, 'account.test.tsx'), `
      import helper from './helper'
      import { beforeEach, expect, it } from 'vitest'

      beforeEach(() => {
        helper()
      })

      function topLevelHelper() {
        return helper()
      }

      it('works', () => {
        expect(value).toHaveValue('ok')
      })
    `)

    writeFileSync(join(root, 'account_detail.spec.tsx'), `
      import { describe, expect, test } from 'vitest'

      describe('account_detail', () => {
        test('custom wording', () => {
          expect(value).toBeDisabled()
        })
      })
    `)

    const result = extractConventions(root)

    expect(result.naming.pattern).toBe('camelCase')
    expect(result.naming.describePrefix).toBe('account_detail')
    expect(result.naming.itTemplate).toBe('should {description}')
    expect(result.structure.describePerComponent).toBe(true)
    expect(result.structure.setupLocation).toBe('inside-describe')
    expect(result.queries.preferred).toEqual([])
    expect(result.imports.common).toEqual(expect.arrayContaining(['vitest']))
  })
})
