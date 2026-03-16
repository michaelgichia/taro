import { describe, expect, it } from 'vitest'

import {
  analyzeBoundaryIsolation,
  calculateBoundaryIsolationScore,
} from '#core/boundary-intelligence.ts'
import { generateTestFromGroups } from '#core/generator.ts'
import {
  boundarySafeSample,
  boundaryUnsafeSample,
} from '#tests/fixtures/sample-fixtures.ts'

describe('analyzeBoundaryIsolation', () => {
  it('flags boundary anti-patterns in the generated AddSaleForm sample', async () => {
    const code = boundaryUnsafeSample

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'leaf-render-boundary' }),
        expect.objectContaining({ kind: 'inline-hook-mock' }),
        expect.objectContaining({ kind: 'helper-embedded-assertion' }),
        expect.objectContaining({ kind: 'positional-control-selection' }),
      ])
    )
    expect(calculateBoundaryIsolationScore(code)).toBeLessThan(40)
  })

  it('treats the gold-standard repo-aware module sample as boundary-safe', async () => {
    const code = boundarySafeSample

    expect(analyzeBoundaryIsolation(code)).toEqual([])
    expect(calculateBoundaryIsolationScore(code)).toBe(100)
  })

  it('treats repo-aware generated module output as boundary-safe', () => {
    const generated = generateTestFromGroups(
      'Example Flow',
      [
        {
          name: 'complete example flow',
          steps: [
            {
              action: 'click',
              target: 'Open Example Flow',
              originalType: 'click',
              source: 'js',
            },
            {
              action: 'click',
              target: 'Continue',
              originalType: 'click',
              source: 'js',
            },
            {
              action: 'assert',
              target: 'Review Example Flow',
              originalType: 'getByText',
              source: 'js',
            },
          ],
        },
      ],
      {
        helpers: [
          {
            name: 'planOpenExampleDialog',
            sourceGroup: 'open example dialog',
            purpose: 'Navigate to the example dialog.',
            assertionPolicy: 'sync-only',
            steps: [
              {
                action: 'click',
                target: 'Open Example Flow',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'click',
                target: 'Continue',
                originalType: 'click',
                source: 'js',
              },
            ],
          },
        ],
        scenarios: [
          {
            name: 'complete example flow',
            goal: 'flow',
            steps: [
              {
                action: 'click',
                target: 'Open Example Flow',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'click',
                target: 'Continue',
                originalType: 'click',
                source: 'js',
              },
              {
                action: 'assert',
                target: 'Review Example Flow',
                originalType: 'getByText',
                source: 'js',
              },
            ],
            helperRefs: ['planOpenExampleDialog'],
            requiresFreshRender: true,
          },
        ],
        renderTarget: {
          symbol: 'FeatureModule',
          importPath: './FeatureModule',
          sourceTestFile: 'sample/sample-add-sale-test.tsx',
          helperNames: ['openExampleDialog'],
          usesWithin: true,
        },
      }
    )

    expect(analyzeBoundaryIsolation(generated.code)).toEqual([])
    expect(calculateBoundaryIsolationScore(generated.code)).toBe(100)
  })

  it('flags mocked repo-owned UI wrapper boundaries', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'
      import type { ReactNode } from 'react'

      vi.mock('@/components/library/Modal', () => ({
        Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        DialogContent: ({ children }: { children: ReactNode }) => (
          <div role="dialog">{children}</div>
        ),
      }))

      describe('example', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'protected-ui-boundary-mock' }),
      ])
    )
    expect(calculateBoundaryIsolationScore(code)).toBeLessThan(100)
  })

  it('detects helper-embedded-assertion from an arrow function helper with expect', () => {
    const code = `
      import { describe, expect, it } from 'vitest'

      const checkValid = () => {
        expect(true).toBe(true)
      }

      describe('suite', () => {
        it('runs', () => {
          checkValid()
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'helper-embedded-assertion' }),
      ])
    )
  })

  it('detects positional-control-selection from direct inline getAllByRole(...)[n] indexing', () => {
    const code = `
      import { describe, expect, it } from 'vitest'
      import { render, screen } from '@testing-library/react'

      describe('suite', () => {
        it('selects by index inline', () => {
          render(<div />)
          expect(screen.getAllByRole('button')[0]).toBeDefined()
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'positional-control-selection' }),
      ])
    )
  })

  it('detects inline-hook-mock when hook name is a string literal key', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./api/orders', () => ({
        'useOrdersQuery': vi.fn(),
      }))

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'inline-hook-mock' }),
      ])
    )
  })

  it('handles vi.mock call with no factory argument (no objectExpression)', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./some-module')

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    // No factory arg means objectExpression is undefined — no hook mock issues
    const issues = analyzeBoundaryIsolation(code)
    expect(issues.every((issue) => issue.kind !== 'inline-hook-mock')).toBe(true)
  })

  it('handles computed member expression callees without crashing (covers getCalleeName fallthrough)', () => {
    // Code with computed member expression calls like window['alert']() or arr[0]()
    // causes getCalleeName to return undefined (the final fallthrough branch)
    const code = `
      import { describe, expect, it } from 'vitest'

      describe('suite', () => {
        it('runs', () => {
          const arr = [() => {}]
          arr[0]()
          window['dispatchEvent'](new Event('click'))
          expect(true).toBe(true)
        })
      })
    `

    const issues = analyzeBoundaryIsolation(code)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('skips FunctionDeclaration helpers that contain no expect calls', () => {
    const code = `
      import { describe, expect, it } from 'vitest'
      import { render, screen } from '@testing-library/react'

      function setup() {
        render(<div />)
      }

      describe('suite', () => {
        it('renders', () => {
          setup()
          expect(screen.getByRole('button')).toBeDefined()
        })
      })
    `

    // The 'setup' FunctionDeclaration has no expect — it should NOT be flagged as helper-embedded-assertion
    const issues = analyzeBoundaryIsolation(code)
    expect(issues.every((issue) => issue.kind !== 'helper-embedded-assertion')).toBe(true)
  })

  it('handles vi.mock with an arrow function factory that returns a non-object (no issues from factory)', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./some-module', () => 'not an object')

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    const issues = analyzeBoundaryIsolation(code)
    expect(issues.every((issue) => issue.kind !== 'inline-hook-mock')).toBe(true)
  })

  it('detects inline-hook-mock when factory is an arrow function with block body returning an object', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./api/orders', () => {
        return {
          useOrdersQuery: vi.fn(),
        }
      })

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'inline-hook-mock' }),
      ])
    )
  })

  it('handles vi.mock with a function expression factory that returns nothing', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./some-module', function() {
        const x = 1
      })

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    const issues = analyzeBoundaryIsolation(code)
    expect(issues.every((issue) => issue.kind !== 'inline-hook-mock')).toBe(true)
  })

  it('handles vi.mock with a direct object literal as factory argument', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      vi.mock('./api/data', { useDataQuery: vi.fn() })

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    // Direct object literal — no hook mock issues since it's not a valid module factory
    const issues = analyzeBoundaryIsolation(code)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('collects rendered component names from JSXElement with children (nested JSX)', () => {
    const code = `
      import { describe, expect, it } from 'vitest'
      import { render, screen } from '@testing-library/react'

      describe('suite', () => {
        it('renders nested', () => {
          render(
            <ParentModal>
              <ChildForm />
            </ParentModal>
          )
          expect(screen.getByRole('button')).toBeDefined()
          expect(screen.getByRole('heading')).toBeDefined()
        })
      })
    `

    // ParentModal matches LEAF_RENDER_SUFFIX? No. But ChildForm does not either.
    // Test that render with parent JSXElement with children doesn't crash and processes children.
    const issues = analyzeBoundaryIsolation(code)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('triggers leaf-render-boundary when a Form component is rendered inside a JSXFragment', () => {
    const code = `
      import { describe, expect, it } from 'vitest'
      import { render, screen } from '@testing-library/react'

      describe('suite', () => {
        it('renders form in fragment', () => {
          render(
            <>
              <AddSaleForm />
            </>
          )
          expect(screen.getByRole('button')).toBeDefined()
          expect(screen.getByRole('heading')).toBeDefined()
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'leaf-render-boundary' }),
      ])
    )
  })

  it('handles template-literal vi.mock target with interpolated expressions (produces null target)', () => {
    const code = `
      import { describe, expect, it, vi } from 'vitest'

      const moduleName = 'orders'
      vi.mock(\`./api/\${moduleName}\`, () => ({
        useOrdersQuery: vi.fn(),
      }))

      describe('suite', () => {
        it('renders', () => {
          expect(true).toBe(true)
        })
      })
    `

    // Template literal with expression → target resolves to null, no guardrail/hook issues
    const issues = analyzeBoundaryIsolation(code)
    expect(Array.isArray(issues)).toBe(true)
  })

  it('handles parse failures and detects template-literal mocks, fragments, and indexed getAllByRole usage', () => {
    expect(analyzeBoundaryIsolation('const broken = <div')).toEqual([])

    const code = `
      import { describe, expect, it, vi } from 'vitest'
      import LeafDialog from './LeafDialog'

      function prepareDialog() {
        expect(true).toBe(true)
      }

      const renderSubject = () => render(<><LeafDialog /></>)

      vi.mock(\`@/components/ui/modal\`, function () {
        return {
          Dialog: vi.fn(),
          useOrdersQuery() {
            return {}
          },
          useSaveMutation: vi.fn(),
        }
      })

      describe('dialog', () => {
        it('indexes buttons', () => {
          prepareDialog()
          renderSubject()
          const buttons = screen.getAllByRole('button')
          expect(buttons[0]).toBeDefined()
          expect(screen.getByRole('heading')).toBeVisible()
        })
      })
    `

    expect(analyzeBoundaryIsolation(code)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'leaf-render-boundary' }),
        expect.objectContaining({ kind: 'inline-hook-mock' }),
        expect.objectContaining({ kind: 'helper-embedded-assertion' }),
        expect.objectContaining({ kind: 'protected-ui-boundary-mock' }),
        expect.objectContaining({ kind: 'positional-control-selection' }),
      ])
    )
  })
})
