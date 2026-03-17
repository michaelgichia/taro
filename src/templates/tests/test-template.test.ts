import { describe, expect, it } from 'vitest'

import {
  describeBlock,
  describeBlockMultiIt,
  helperBlock,
  importBlock,
  markerAssertionTemplate,
  markerAssertionTemplateSync,
  stepTemplate,
  waitForAssertionBlock,
} from '#templates/test-template.ts'

describe('importBlock', () => {
  it('renders ESM imports with optional helpers, waitFor, and within', () => {
    const result = importBlock(true, 'esm', {
      renderTarget: {
        symbol: 'CheckoutForm',
        importPath: '#components/checkout.tsx',
      },
      renderHelper: {
        name: 'renderWithProviders',
        importPath: '#test/render.ts',
        importKind: 'named',
      },
      needsWaitFor: true,
      needsWithin: true,
      jestDomImportPath: '@testing-library/jest-dom/vitest',
    })

    expect(result).toContain("import { screen, waitFor, within } from '@testing-library/react'")
    expect(result).toContain("import '@testing-library/jest-dom/vitest'")
    expect(result).toContain("import userEvent from '@testing-library/user-event'")
    expect(result).toContain("import CheckoutForm from '#components/checkout.tsx'")
    expect(result).toContain("import { renderWithProviders } from '#test/render.ts'")
    expect(result).not.toContain('import { render,')
  })

  it('renders CommonJS imports with default helper import and render fallback', () => {
    const result = importBlock(false, 'cjs', {
      renderTarget: {
        symbol: 'App',
        importPath: '#app.tsx',
      },
      renderHelper: {
        name: 'renderApp',
        importPath: '#test/render-app.ts',
        importKind: 'default',
      },
    })

    expect(result).toContain("const { screen } = require('@testing-library/react')")
    expect(result).toContain("require('@testing-library/jest-dom')")
    expect(result).toContain("const App = require('#app.tsx').default")
    expect(result).toContain("const renderApp = require('#test/render-app.ts').default")
    expect(result).not.toContain('userEvent')
  })

  it('renders CommonJS userEvent imports and named helpers, plus ESM default helpers', () => {
    const cjs = importBlock(true, 'cjs', {
      renderHelper: {
        name: 'renderCheckout',
        importPath: '#test/render-checkout.ts',
        importKind: 'named',
      },
    })

    expect(cjs).toContain("const userEvent = require('@testing-library/user-event')")
    expect(cjs).toContain("const renderCheckout = require('#test/render-checkout.ts').renderCheckout")

    const esm = importBlock(false, 'esm', {
      renderHelper: {
        name: 'renderCheckout',
        importPath: '#test/render-checkout.ts',
        importKind: 'default',
      },
    })

    expect(esm).toContain("import renderCheckout from '#test/render-checkout.ts'")
  })
})

describe('stepTemplate', () => {
  it('renders action-specific templates and checkpoint comments', () => {
    expect(stepTemplate({
      action: 'click',
      query: "screen.getByRole('button')",
    })).toBe("await user.click(screen.getByRole('button'))")

    expect(stepTemplate({
      action: 'fill',
      query: "screen.getByLabelText('Name')",
      value: "O'Brian",
    })).toBe([
      "await user.clear(screen.getByLabelText('Name'))",
      "await user.type(screen.getByLabelText('Name'), 'O\\'Brian')",
    ].join('\n'))

    expect(stepTemplate({
      action: 'select',
      query: "screen.getByRole('combobox')",
      value: 'admin',
    })).toBe("await user.selectOptions(screen.getByRole('combobox'), 'admin')")

    expect(stepTemplate({
      action: 'scroll',
      query: 'container',
    })).toBe('container.scrollIntoView()')

    expect(stepTemplate({
      action: 'assert',
      query: "screen.findByText('Saved')",
    })).toBe("expect(await screen.findByText('Saved')).toBeInTheDocument()")

    expect(stepTemplate({
      action: 'assert',
      query: "screen.getByText('Saved')",
      matcher: '.toBeVisible',
    })).toBe("expect(screen.getByText('Saved')).toBeVisible")

    expect(stepTemplate({
      action: 'navigate',
      query: 'window.location',
      value: '/orders',
    })).toBe('// navigate: /orders')

    expect(stepTemplate({
      action: 'keyDown',
      query: 'ignored',
      value: '{Escape}',
    })).toBe("await user.keyboard('{Escape}')")

    expect(stepTemplate({
      action: 'unknown',
      query: '.legacy-selector',
    })).toBe('// TODO: unsupported step — original selector: .legacy-selector')

    expect(stepTemplate({
      action: 'click',
      query: 'ignored',
      checkpoint: {
        selector: '  .dialog   [data-testid="save"] ',
        reason: ' missing   semantic   query ',
      },
    })).toContain('taro-query-checkpoint')
  })
})

describe('assertion helpers', () => {
  it('normalizes async and sync marker assertion matchers and wraps waitFor blocks', () => {
    expect(markerAssertionTemplate({
      queryExpression: "screen.findByText('Done')",
    })).toBe("expect(await screen.findByText('Done')).toBeVisible()")

    expect(markerAssertionTemplate({
      queryExpression: "screen.findByText('Done')",
      matcher: '.toHaveTextContent',
    })).toBe("expect(await screen.findByText('Done')).toHaveTextContent()")

    expect(markerAssertionTemplateSync({
      queryExpression: "within(panel).findAllByRole('row')",
      matcher: 'toHaveLength(2)',
    })).toBe("expect(within(panel).getAllByRole('row')).toHaveLength(2)")

    expect(waitForAssertionBlock([
      "expect(a).toBe('x')",
      "expect(b).toBe('y')",
    ])).toBe([
      'await waitFor(() => {',
      "  expect(a).toBe('x')",
      "  expect(b).toBe('y')",
      '})',
    ].join('\n'))
  })
})

describe('block builders', () => {
  it('renders describe, helper, and multi-it blocks with escaping and setup', () => {
    expect(helperBlock({
      name: 'openDialog',
      stepLines: [
        "await user.click(screen.getByRole('button'))",
        "expect(screen.getByText('Ready')).toBeVisible()",
      ],
    })).toBe([
      'const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {',
      "  await user.click(screen.getByRole('button'))",
      "  expect(screen.getByText('Ready')).toBeVisible()",
      '}',
    ].join('\n'))

    expect(describeBlock("save user's item", [
      "render(<App />)",
      "expect(screen.getByText('Saved')).toBeVisible()",
    ], true)).toContain("it('save user\\'s item', async () => {")

    const multi = describeBlockMultiIt('checkout flow', [
      {
        name: 'submits order',
        hasUserEvents: true,
        stepLines: [
          'await openDialog(user)',
          "expect(screen.getByText('Done')).toBeVisible()",
        ],
      },
      {
        name: 'shows defaults',
        hasUserEvents: false,
        stepLines: [
          "expect(screen.getByText('Draft')).toBeVisible()",
        ],
      },
    ], {
      renderExpression: '<Checkout />',
      renderFunctionName: 'renderWithProviders',
      helpers: [
        {
          name: 'openDialog',
          stepLines: ["await user.click(screen.getByRole('button'))"],
        },
      ],
    })

    expect(multi).toContain("describe('checkout flow', () => {")
    expect(multi).toContain('const setup = () => {')
    expect(multi).toContain('const user = userEvent.setup()')
    expect(multi).toContain('const renderResult = renderWithProviders(<Checkout />)')
    expect(multi).toContain('const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {')
    expect(multi).toContain('const { user } = setup()')
    expect(multi).toContain('setup()')
  })
})
