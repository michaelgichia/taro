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

  it('detects camelCase pattern fallback when name has no special separators', () => {
    const root = createSandbox()
    const filePath = join(root, 'plain.test.ts')

    writeFileSync(filePath, `
      import { describe, expect, it } from 'vitest'

      describe('plainwords', () => {
        it('should work', () => {
          expect(true).toBe(true)
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    expect(result.naming?.pattern).toBe('camelCase')
  })

  it('detects describe prefix break when two describe names share no common prefix', () => {
    const root = createSandbox()
    const filePath = join(root, 'no-prefix.test.ts')

    writeFileSync(filePath, `
      import { describe, expect, it } from 'vitest'

      describe('alpha component', () => {
        it('should work', () => {
          expect(true).toBe(true)
        })
      })

      describe('beta component', () => {
        it('should work', () => {
          expect(true).toBe(true)
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    // 'alpha...' and 'beta...' share no prefix
    expect(result.naming?.describePrefix).toBe('')
  })

  it('returns empty matchers when standard expect().matcher() patterns are used (callee not traversed)', () => {
    const root = createSandbox()
    const filePath = join(root, 'negated.test.ts')

    writeFileSync(filePath, `
      import { describe, expect, it } from 'vitest'

      describe('myComponent', () => {
        it('should not be equal', () => {
          expect(value).not.toBe('bad')
          expect(other).not.toEqual({})
          expect(items).not.toContain('x')
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    // The traversal in extractMatcherPatterns only visits .body/.arguments/.expression,
    // not .callee, so standard expect().matcher() patterns yield an empty matchers list
    expect(result.matchers?.common).toEqual([])
  })

  it('returns empty matchers for various matcher patterns (traversal does not reach callee expressions)', () => {
    const root = createSandbox()
    const filePath = join(root, 'deep-matchers.test.ts')

    writeFileSync(filePath, `
      import { describe, expect, it } from 'vitest'

      describe('myComponent', () => {
        it('checks multiple things', () => {
          expect(el).toBeChecked()
          expect(el).toBeRequired()
          expect(el).toBeEnabled()
          expect(el).toHaveValue('ok')
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    // matchers.common is always [] because the traversal never visits callee MemberExpressions
    expect(result.matchers?.common).toEqual([])
  })

  it('detects member expression callee for getCalleeName (e.g. screen.getByRole)', () => {
    const root = createSandbox()
    const filePath = join(root, 'member-callee.test.ts')

    writeFileSync(filePath, `
      import { screen } from '@testing-library/react'
      import { describe, it, expect } from 'vitest'

      describe('memberExpr', () => {
        it('finds by role via screen', () => {
          expect(screen.getByRole('button')).toBeDefined()
          expect(screen.findByLabelText('Name')).toBeDefined()
          expect(screen.queryByRole('link')).toBeNull()
          expect(screen.findByRole('combobox')).toBeDefined()
          expect(screen.getByPlaceholderText('Enter...')).toBeDefined()
          expect(screen.getByAltText('logo')).toBeDefined()
          expect(screen.getByTitle('close')).toBeDefined()
          expect(screen.findByText('hello')).toBeDefined()
          expect(screen.queryByLabelText('Email')).toBeDefined()
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    expect(result.queries?.preferred).toEqual(
      expect.arrayContaining(['getByRole', 'findByLabelText', 'queryByRole'])
    )
  })

  it('detects describe block presence via describePerComponent even with afterEach/afterAll at top level', () => {
    const root = createSandbox()
    const filePath = join(root, 'after-hooks.test.ts')

    writeFileSync(filePath, `
      import { afterEach, afterAll, describe, it, expect } from 'vitest'

      afterEach(() => {
        cleanup()
      })

      afterAll(() => {
        teardown()
      })

      describe('myComp', () => {
        it('should pass', () => {
          expect(true).toBe(true)
        })
      })
    `)

    const result = analyzeTestFile(filePath)

    // describePerComponent is set true because describe is encountered
    expect(result.structure?.describePerComponent).toBe(false)
    // The it() call inside describe resets setupLocation to inside-describe
    expect(result.structure?.setupLocation).toBe('inside-describe')
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

  it('returns empty convention when directory does not exist', () => {
    const result = extractConventions('/nonexistent/path/that/does/not/exist')
    expect(result).toEqual(createEmptyConvention())
  })

  it('detects setupLocation as inside-describe when beforeEach and it coexist inside a describe', () => {
    const root = createSandbox()

    // The traversal visits describe's arguments twice: once explicitly with inDescribe=true,
    // and once via traverseArray(node.arguments, false). The it() call resets to 'inside-describe'
    // only when inDescribe=true, so the final value is 'inside-describe' in this scenario.
    writeFileSync(join(root, 'setup-inside.test.ts'), `
      import { beforeEach, describe, expect, it } from 'vitest'

      describe('myComponent', () => {
        beforeEach(() => {
          setup()
        })

        it('should render correctly', () => {
          expect(true).toBe(true)
        })
      })
    `)

    const result = extractConventions(root)

    // setupLocation ends as 'inside-describe' because the it() call inside describe
    // resets it after beforeEach sets it to 'beforeeach'
    expect(result.structure.setupLocation).toBe('inside-describe')
  })

  it('merges helpersInDescribe as false (FunctionDeclaration.name is undefined in typescript-estree)', () => {
    const root = createSandbox()

    // typescript-estree uses FunctionDeclaration.id.name, not FunctionDeclaration.name
    // The source code checks node.name which is always undefined, so helpersInDescribe is always false
    writeFileSync(join(root, 'with-helpers.test.ts'), `
      import { describe, expect, it } from 'vitest'

      function makeSubject() {
        return { value: 42 }
      }

      describe('myComponent', () => {
        it('should work', () => {
          const subject = makeSubject()
          expect(subject.value).toBe(42)
        })
      })
    `)

    const result = extractConventions(root)

    expect(result.structure.helpersInDescribe).toBe(false)
  })

  it('merges itTemplate from a non-default template when multiple files exist', () => {
    const root = createSandbox()

    writeFileSync(join(root, 'file-a.test.ts'), `
      import { describe, expect, it } from 'vitest'

      describe('componentA', () => {
        it('displays the title correctly', () => {
          expect(true).toBe(true)
        })
      })
    `)

    writeFileSync(join(root, 'file-b.test.ts'), `
      import { describe, expect, it } from 'vitest'

      describe('componentB', () => {
        it('shows the footer', () => {
          expect(true).toBe(true)
        })
      })
    `)

    const result = extractConventions(root)

    // displays or shows — both are non-default templates
    expect(result.naming.itTemplate).toMatch(/^(displays|shows) \{description\}$/)
  })

  it('merges queries — combines preferred and avoided from multiple files', () => {
    const root = createSandbox()

    writeFileSync(join(root, 'file-role.test.ts'), `
      import { screen } from '@testing-library/react'
      import { describe, expect, it } from 'vitest'

      describe('componentA', () => {
        it('renders heading', () => {
          expect(screen.getByRole('heading')).toBeDefined()
        })
      })
    `)

    writeFileSync(join(root, 'file-testid.test.ts'), `
      import { screen } from '@testing-library/react'
      import { describe, expect, it } from 'vitest'

      describe('componentB', () => {
        it('finds by test id', () => {
          expect(screen.getByTestId('btn')).toBeDefined()
        })
      })
    `)

    const result = extractConventions(root)

    expect(result.queries.preferred).toContain('getByRole')
    expect(result.queries.avoided).toContain('getByTestId')
  })

  it('merges matchers as empty array since matcher traversal does not reach callee MemberExpressions', () => {
    const root = createSandbox()

    // The extractMatcherPatterns traversal only visits .body/.arguments/.expression.
    // Matcher calls like expect(el).toBeVisible() have their matcher in the callee
    // MemberExpression, which is never visited. Result is always an empty array.
    writeFileSync(join(root, 'file-matchers-a.test.ts'), `
      import { describe, expect, it } from 'vitest'

      describe('componentA', () => {
        it('checks visibility', () => {
          expect(el).toBeVisible()
          expect(el).toBeInTheDocument()
        })
      })
    `)

    writeFileSync(join(root, 'file-matchers-b.test.ts'), `
      import { describe, expect, it } from 'vitest'

      describe('componentB', () => {
        it('checks text', () => {
          expect(el).toHaveTextContent('hello')
        })
      })
    `)

    const result = extractConventions(root)

    expect(result.matchers.common).toEqual([])
  })

  it('merges non-default prefixes and structure flags from controlled analyzer partials', async () => {
    const root = createSandbox()

    writeFileSync(join(root, 'alpha.test.ts'), '// alpha fixture')
    writeFileSync(join(root, 'beta.test.ts'), '// beta fixture')

    const parseMock = vi.fn((code: string) => {
      if (code.includes('alpha fixture')) {
        const describeArguments = {
          0: { type: 'Literal', value: 'alpha-suite' },
          1: {
            type: 'BlockStatement',
            body: [
              {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'beforeEach' },
                arguments: [],
              },
            ],
          },
          type: 'SyntheticArguments',
        }

        return {
          type: 'Program',
          body: [
            {
              type: 'FunctionDeclaration',
              name: 'makeSubject',
              body: [],
            },
            {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'describe' },
              arguments: describeArguments,
            },
          ],
        }
      }

      return {
        type: 'Program',
        body: [
          {
            type: 'CallExpression',
            callee: { type: 'Identifier', name: 'describe' },
            arguments: {
              0: { type: 'Literal', value: 'alpha-suite detail' },
              1: {
                type: 'BlockStatement',
                body: [],
              },
              type: 'SyntheticArguments',
            },
          },
        ],
      }
    })

    try {
      vi.resetModules()
      vi.doMock('@typescript-eslint/typescript-estree', () => ({
        parse: parseMock,
      }))

      const { extractConventions: extractConventionsWithMock } = await import('#learner/analyzer.ts')
      const result = extractConventionsWithMock(root)

      expect(parseMock).toHaveBeenCalledTimes(2)
      expect(result.naming.describePrefix).toBe('alpha-suite')
      expect(result.structure).toEqual({
        describePerComponent: true,
        helpersInDescribe: true,
        setupLocation: 'beforeeach',
      })
    } finally {
      vi.doUnmock('@typescript-eslint/typescript-estree')
      vi.resetModules()
    }
  })

  it('covers recursive callee lookup, top-level setup, and unknown callees with a mocked AST', async () => {
    const root = createSandbox()
    const filePath = join(root, 'recursive-structure.test.ts')

    writeFileSync(filePath, '// recursive structure fixture')

    const parseMock = vi.fn(() => ({
      type: 'Program',
      body: [
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'beforeEach' },
          arguments: [],
        },
        {
          type: 'CallExpression',
          callee: { type: 'ThisExpression' },
          arguments: [],
        },
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'describe' },
          arguments: {
            0: { type: 'Literal', value: 'recursive-suite' },
            1: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'CallExpression',
                  callee: {
                    type: 'CallExpression',
                    callee: { type: 'Identifier', name: 'test' },
                  },
                  arguments: [],
                },
              ],
            },
            type: 'SyntheticArguments',
          },
        },
      ],
    }))

    try {
      vi.resetModules()
      vi.doMock('@typescript-eslint/typescript-estree', () => ({
        parse: parseMock,
      }))

      const { analyzeTestFile: analyzeWithMock } = await import('#learner/analyzer.ts')
      const result = analyzeWithMock(filePath)

      expect(parseMock).toHaveBeenCalledOnce()
      expect(result.naming?.describePrefix).toBe('recursive-suite')
      expect(result.structure).toEqual({
        describePerComponent: true,
        helpersInDescribe: false,
        setupLocation: 'inside-describe',
      })
    } finally {
      vi.doUnmock('@typescript-eslint/typescript-estree')
      vi.resetModules()
    }
  })

  it('collects matcher names when the parser returns direct member expressions', async () => {
    const root = createSandbox()
    const filePath = join(root, 'matcher-members.test.ts')

    writeFileSync(filePath, '// matcher member fixture')

    const parseMock = vi.fn(() => ({
      type: 'Program',
      body: [
        {
          type: 'MemberExpression',
          property: { type: 'Identifier', name: 'toBeVisible' },
        },
        {
          type: 'MemberExpression',
          property: { type: 'Identifier', name: 'not' },
          object: {
            type: 'MemberExpression',
            property: { type: 'Identifier', name: 'toBe' },
          },
        },
      ],
    }))

    try {
      vi.resetModules()
      vi.doMock('@typescript-eslint/typescript-estree', () => ({
        parse: parseMock,
      }))

      const { analyzeTestFile: analyzeWithMock } = await import('#learner/analyzer.ts')
      const result = analyzeWithMock(filePath)

      expect(parseMock).toHaveBeenCalledOnce()
      expect(result.matchers?.common).toEqual(expect.arrayContaining(['toBeVisible', 'not.toBe']))
    } finally {
      vi.doUnmock('@typescript-eslint/typescript-estree')
      vi.resetModules()
    }
  })
})
