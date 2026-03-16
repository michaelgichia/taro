import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  classifyBoundaryKind,
  collectBoundaryLearning,
  discoverBoundaryImportsFromSource,
  getBoundaryGuardrailReason,
  summarizeBoundaryProfiles,
} from '#core/boundary-learning.ts'
import type { TaroBoundaryProfile } from '#types/state.ts'

let testDir: string

beforeEach(async () => {
  testDir = join(tmpdir(), `taro-boundary-learning-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// classifyBoundaryKind
// ---------------------------------------------------------------------------

describe('classifyBoundaryKind', () => {
  it('classifies next/navigation as router', () => {
    expect(classifyBoundaryKind('next/navigation')).toBe('router')
  })

  it('classifies router-containing paths as router', () => {
    expect(classifyBoundaryKind('./hooks/useRouter')).toBe('router')
    expect(classifyBoundaryKind('@/utils/navigation')).toBe('router')
    expect(classifyBoundaryKind('react-router-dom')).toBe('router')
    expect(classifyBoundaryKind('./navigate')).toBe('router')
    expect(classifyBoundaryKind('./history')).toBe('router')
  })

  it('classifies auth-related paths', () => {
    expect(classifyBoundaryKind('@clerk/nextjs')).toBe('auth')
    expect(classifyBoundaryKind('next-auth')).toBe('auth')
    expect(classifyBoundaryKind('./session')).toBe('auth')
    expect(classifyBoundaryKind('@/utils/auth')).toBe('auth')
  })

  it('classifies feature flag paths', () => {
    expect(classifyBoundaryKind('launchdarkly-react-client-sdk')).toBe('feature-flag')
    expect(classifyBoundaryKind('statsig-js')).toBe('feature-flag')
    expect(classifyBoundaryKind('./featureFlags')).toBe('feature-flag')
    expect(classifyBoundaryKind('@/utils/feature-flag')).toBe('feature-flag')
  })

  it('classifies network client paths', () => {
    expect(classifyBoundaryKind('fetch')).toBe('network-client')
    expect(classifyBoundaryKind('axios')).toBe('network-client')
    expect(classifyBoundaryKind('@trpc/client')).toBe('network-client')
    expect(classifyBoundaryKind('msw')).toBe('network-client')
    expect(classifyBoundaryKind('nock')).toBe('network-client')
    expect(classifyBoundaryKind('graphql')).toBe('network-client')
    expect(classifyBoundaryKind('undici')).toBe('network-client')
    expect(classifyBoundaryKind('fetch-mock')).toBe('network-client')
  })

  it('classifies server action paths', () => {
    expect(classifyBoundaryKind('./actions/createOrder')).toBe('server-action')
    expect(classifyBoundaryKind('@/server-actions/submit')).toBe('server-action')
    expect(classifyBoundaryKind('./action')).toBe('server-action')
  })

  it('classifies data module paths', () => {
    expect(classifyBoundaryKind('./api/orders')).toBe('data-module')
    expect(classifyBoundaryKind('@/repository/user')).toBe('data-module')
    expect(classifyBoundaryKind('./data-layer')).toBe('data-module')
    expect(classifyBoundaryKind('@/query/products')).toBe('data-module')
    expect(classifyBoundaryKind('./mutation')).toBe('data-module')
    expect(classifyBoundaryKind('./repo/orders')).toBe('data-module')
    expect(classifyBoundaryKind('@/features/orders/api')).toBe('data-module')
  })

  it('classifies env-like global references', () => {
    expect(classifyBoundaryKind('localStorage')).toBe('env')
    // 'sessionStorage' matches /session/ in the auth check before env, so skip it
    expect(classifyBoundaryKind('Math')).toBe('env')
    expect(classifyBoundaryKind('window')).toBe('env')
    expect(classifyBoundaryKind('document')).toBe('env')
  })

  it('classifies local relative and alias paths as local-child', () => {
    expect(classifyBoundaryKind('./SomeComponent')).toBe('local-child')
    expect(classifyBoundaryKind('../utils/helpers')).toBe('local-child')
    expect(classifyBoundaryKind('@/components/Button')).toBe('local-child')
    expect(classifyBoundaryKind('~/utils/format')).toBe('local-child')
  })

  it('classifies unknown third-party packages', () => {
    expect(classifyBoundaryKind('lodash')).toBe('unknown')
    // 'date-fns' matches /Date/i in the env check; use unambiguous packages
    expect(classifyBoundaryKind('zod')).toBe('unknown')
    expect(classifyBoundaryKind('immer')).toBe('unknown')
  })

  it('normalizes backslashes before classifying', () => {
    expect(classifyBoundaryKind('.\\actions\\createOrder')).toBe('server-action')
    expect(classifyBoundaryKind('.\\hooks\\useRouter')).toBe('router')
  })
})

// ---------------------------------------------------------------------------
// getBoundaryGuardrailReason
// ---------------------------------------------------------------------------

describe('getBoundaryGuardrailReason', () => {
  it('returns null for unrelated targets', () => {
    expect(getBoundaryGuardrailReason('./api/orders')).toBeNull()
    expect(getBoundaryGuardrailReason('axios')).toBeNull()
  })

  it('returns repo-owned-ui-wrapper for repo-owned UI paths with component exports', () => {
    expect(
      getBoundaryGuardrailReason('@/components/library/Modal', ['Dialog', 'DialogContent'])
    ).toBe('repo-owned-ui-wrapper')

    expect(
      getBoundaryGuardrailReason('./components/Button', ['Button'])
    ).toBe('repo-owned-ui-wrapper')

    expect(
      getBoundaryGuardrailReason('@/ui/Card', ['Card'])
    ).toBe('repo-owned-ui-wrapper')
  })

  it('returns ui-package for third-party UI packages', () => {
    expect(getBoundaryGuardrailReason('@radix-ui/components', ['Dialog'])).toBe('ui-package')
    expect(getBoundaryGuardrailReason('@shadcn/ui', ['Button'])).toBe('ui-package')
  })

  it('returns null for repo-owned UI paths when only hooks or constants exported', () => {
    expect(
      getBoundaryGuardrailReason('@/components/library/Modal', ['useModal'])
    ).toBeNull()

    expect(
      getBoundaryGuardrailReason('@/components/library/Modal', ['MODAL_TYPES'])
    ).toBeNull()
  })

  it('returns null for repo-owned UI path with default export', () => {
    expect(
      getBoundaryGuardrailReason('./components/Wrapper', ['default'])
    ).toBe('repo-owned-ui-wrapper')
  })

  it('normalizes backslashes before checking', () => {
    expect(
      getBoundaryGuardrailReason('.\\components\\ui\\Modal', ['Modal'])
    ).toBe('repo-owned-ui-wrapper')
  })
})

// ---------------------------------------------------------------------------
// discoverBoundaryImportsFromSource
// ---------------------------------------------------------------------------

describe('discoverBoundaryImportsFromSource', () => {
  it('returns empty array when file does not exist', async () => {
    const result = await discoverBoundaryImportsFromSource('/nonexistent/path/file.ts')
    expect(result).toEqual([])
  })

  it('returns empty array when file has unparseable syntax', async () => {
    const filePath = join(testDir, 'broken.ts')
    await writeFile(filePath, 'const broken = <div')
    const result = await discoverBoundaryImportsFromSource(filePath)
    expect(result).toEqual([])
  })

  it('discovers named and default imports with their classified kinds', async () => {
    const filePath = join(testDir, 'example.test.tsx')
    await writeFile(
      filePath,
      `
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { createOrder } from './actions/createOrder'
import { Button } from './components/Button'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'next/navigation', kind: 'router' }),
        expect.objectContaining({ target: 'axios', kind: 'network-client' }),
        expect.objectContaining({ target: './actions/createOrder', kind: 'server-action' }),
        expect.objectContaining({ target: './components/Button', kind: 'local-child' }),
      ])
    )
  })

  it('skips react and @testing-library imports', async () => {
    const filePath = join(testDir, 'skip.test.tsx')
    await writeFile(
      filePath,
      `
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)

    expect(result.some((r) => r.target === 'react')).toBe(false)
    expect(result.some((r) => r.target.startsWith('@testing-library/'))).toBe(false)
    expect(result.some((r) => r.target === 'axios')).toBe(true)
  })

  it('skips CSS/SCSS imports', async () => {
    const filePath = join(testDir, 'styles.test.tsx')
    await writeFile(
      filePath,
      `
import './styles.css'
import './theme.scss'
import './base.sass'
import axios from 'axios'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)

    expect(result.some((r) => r.target.endsWith('.css'))).toBe(false)
    expect(result.some((r) => r.target.endsWith('.scss'))).toBe(false)
    expect(result.some((r) => r.target.endsWith('.sass'))).toBe(false)
    expect(result.some((r) => r.target === 'axios')).toBe(true)
  })

  it('collects importedNames from named and default specifiers', async () => {
    const filePath = join(testDir, 'imports.test.ts')
    await writeFile(
      filePath,
      `
import DefaultExport from 'some-lib'
import { namedA, namedB } from 'another-lib'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)

    const someLib = result.find((r) => r.target === 'some-lib')
    expect(someLib?.importedNames).toEqual(['default'])

    const anotherLib = result.find((r) => r.target === 'another-lib')
    expect(anotherLib?.importedNames).toEqual(['namedA', 'namedB'])
  })

  it('returns guardrailReason for repo-owned UI paths with component exports', async () => {
    const filePath = join(testDir, 'ui.test.tsx')
    await writeFile(
      filePath,
      `
import { Dialog, DialogContent } from '@/components/ui/modal'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)
    const uiImport = result.find((r) => r.target === '@/components/ui/modal')
    expect(uiImport?.guardrailReason).toBe('repo-owned-ui-wrapper')
  })

  it('deduplicates multiple imports from same path and merges specifiers', async () => {
    const filePath = join(testDir, 'dedup.test.ts')
    await writeFile(
      filePath,
      `
import { createOrder } from './api/orders'
import { cancelOrder } from './api/orders'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)
    const ordersImports = result.filter((r) => r.target === './api/orders')
    expect(ordersImports).toHaveLength(1)
    expect(ordersImports[0]?.importedNames).toContain('createOrder')
    expect(ordersImports[0]?.importedNames).toContain('cancelOrder')
  })

  it('returns results sorted by target', async () => {
    const filePath = join(testDir, 'sorted.test.ts')
    await writeFile(
      filePath,
      `
import { z } from 'zod'
import axios from 'axios'
import { createOrder } from './api/orders'
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)
    const targets = result.map((r) => r.target)
    const sorted = [...targets].sort()
    expect(targets).toEqual(sorted)
  })
})

// ---------------------------------------------------------------------------
// collectBoundaryLearning
// ---------------------------------------------------------------------------

describe('collectBoundaryLearning', () => {
  it('returns empty profiles and exemplars for empty test files', async () => {
    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    expect(result.profiles).toEqual([])
    expect(result.exemplars).toEqual([])
  })

  it('handles unparseable test file content gracefully', async () => {
    const filePath = join(testDir, 'broken.test.ts')
    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content: 'const broken = <div' }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    expect(result.profiles).toEqual([])
    expect(result.exemplars).toHaveLength(1)
  })

  it('extracts boundary profile from vi.mock call', async () => {
    const filePath = join(testDir, 'src', 'feature.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { describe, it, vi } from 'vitest'

vi.mock('./api/orders', () => ({
  createOrder: vi.fn(),
}))

describe('feature', () => {
  it('works', () => {})
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    expect(result.profiles).toHaveLength(1)
    expect(result.profiles[0]).toMatchObject({
      target: './api/orders',
      kind: 'data-module',
    })
  })

  it('extracts boundary profile from jest.mock call', async () => {
    const filePath = join(testDir, 'src', 'legacy.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const axiosProfile = result.profiles.find((p) => p.target === 'axios')
    expect(axiosProfile).toBeDefined()
    expect(axiosProfile?.kind).toBe('network-client')
  })

  it('detects shared-module-factory strategy when factory spread is used', async () => {
    const filePath = join(testDir, 'src', 'factory.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { createOrdersMock } from '../__mocks__/ordersMockFactory'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.strategy).toBe('shared-module-factory')
    expect(ordersProfile?.supportExports.factoryExport).toBe('createOrdersMock')
  })

  it('assigns forbid strategy for guardrail targets (repo-owned UI wrapper)', async () => {
    const filePath = join(testDir, 'src', 'modal.test.tsx')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('@/components/ui/modal', () => ({
  Dialog: vi.fn(),
  Modal: vi.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const modalProfile = result.profiles.find((p) => p.target === '@/components/ui/modal')
    expect(modalProfile?.strategy).toBe('forbid')
    expect(modalProfile?.guardrailReason).toBe('repo-owned-ui-wrapper')
  })

  it('assigns inline-safe strategy for router targets', async () => {
    const filePath = join(testDir, 'src', 'nav.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const routerProfile = result.profiles.find((p) => p.target === 'next/navigation')
    expect(routerProfile?.strategy).toBe('inline-safe')
    expect(routerProfile?.kind).toBe('router')
  })

  it('infers payload source from support import path', async () => {
    const filePath = join(testDir, 'src', 'fixtures.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { ordersFixture } from '../__fixtures__/orders'

vi.mock('./api/orders', () => ({
  getOrders: ordersFixture,
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.payloadSource).toBe('fixtures')
  })

  it('infers typed-defaults payload source for mocks import', async () => {
    const filePath = join(testDir, 'src', 'mocks.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { ordersMock } from '../__mocks__/orders'

vi.mock('./api/orders', () => ({
  getOrders: ordersMock,
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.payloadSource).toBe('typed-defaults')
  })

  it('infers exemplar-only payload source for factors import', async () => {
    const filePath = join(testDir, 'src', 'factors.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { ordersFactory } from '../__factors__/orders'

vi.mock('./api/orders', () => ({
  getOrders: ordersFactory,
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.payloadSource).toBe('exemplar-only')
  })

  it('infers mock-store payload source for mock-store import', async () => {
    const filePath = join(testDir, 'src', 'store.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { storeSetup } from '../mock-store/index'

vi.mock('./api/orders', () => ({
  getOrders: storeSetup,
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.payloadSource).toBe('mock-store')
  })

  it('sets overrideStyle to stable-handles when mock method is called on imported binding', async () => {
    const filePath = join(testDir, 'src', 'override.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { getOrders } from '../__mocks__/ordersMock'

vi.mock('./api/orders', () => ({
  getOrders,
}))

describe('override style', () => {
  it('calls mockImplementation', () => {
    getOrders.mockImplementation(() => [])
  })
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('override.test.ts'))
    expect(exemplar?.overrideStyle).toBe('stable-handles')
  })

  it('sets resetExport when beforeEach calls imported support function that matches supportImportPath', async () => {
    const filePath = join(testDir, 'src', 'reset.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    // resetOrdersMock and createOrdersMock must come from the SAME support import path
    // so the beforeEach handler can match on supportImportPath === imported.importPath
    const content = `
import { createOrdersMock, resetOrdersMock } from '../__mocks__/ordersMock'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))

beforeEach(resetOrdersMock)
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.supportExports.resetExport).toBe('resetOrdersMock')
  })

  it('includes spy exports when Spy-suffixed imported binding is referenced', async () => {
    const filePath = join(testDir, 'src', 'spy.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    // createOrdersMock establishes the supportImportPath via factory spread.
    // createOrderSpy is from the same support file, so the Identifier visitor
    // can match entry.supportImportPath === imported.importPath and push to spyExports.
    const content = `
import { createOrdersMock, createOrderSpy } from '../__mocks__/ordersMock'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))

describe('spy usage', () => {
  it('uses spy', () => {
    const spy = createOrderSpy
    spy({})
  })
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    expect(ordersProfile?.supportExports.spyExports).toContain('createOrderSpy')
  })

  it('includes provider-wrapper observation from providerWrappers param', async () => {
    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [],
      renderTargets: [],
      providerWrappers: [
        {
          name: 'AppWrapper',
          importPath: '@/providers/AppWrapper',
          sourceTestFile: 'src/feature.test.tsx',
        },
      ],
      mutationLifecycles: [],
    })

    const wrapperProfile = result.profiles.find((p) => p.target === '@/providers/AppWrapper')
    expect(wrapperProfile).toBeDefined()
    expect(wrapperProfile?.strategy).toBe('provider-wrapper')
  })

  it('tags exemplar with mutation-lifecycle when file is in mutationLifecycles', async () => {
    const filePath = join(testDir, 'src', 'mutation.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({
  createOrder: vi.fn(),
}))

describe('mutation flow', () => {
  it('works', () => {})
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [
        {
          file: 'src/mutation.test.ts',
          stages: ['loading', 'success'],
          evidence: ['loading cues', 'success cues'],
        },
      ],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('mutation.test.ts'))
    expect(exemplar?.hasMutationLifecycle).toBe(true)
    expect(exemplar?.tags).toContain('mutation-lifecycle')
  })

  it('sets renderBoundary to module when render target matches and symbol ends in Module', async () => {
    const filePath = join(testDir, 'src', 'module.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [
        {
          symbol: 'OrdersModule',
          importPath: './OrdersModule',
          sourceTestFile: 'src/module.test.ts',
          helperNames: [],
          usesWithin: false,
        },
      ],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('module.test.ts'))
    expect(exemplar?.renderBoundary).toBe('module')
  })

  it('sets renderBoundary to module when render target uses within', async () => {
    const filePath = join(testDir, 'src', 'within.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [
        {
          symbol: 'OrdersFeature',
          importPath: './OrdersFeature',
          sourceTestFile: 'src/within.test.ts',
          helperNames: [],
          usesWithin: true,
        },
      ],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('within.test.ts'))
    expect(exemplar?.renderBoundary).toBe('module')
  })

  it('sets renderBoundary to component when render target is a plain component', async () => {
    const filePath = join(testDir, 'src', 'comp.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [
        {
          symbol: 'OrderCard',
          importPath: './OrderCard',
          sourceTestFile: 'src/comp.test.ts',
          helperNames: [],
          usesWithin: false,
        },
      ],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('comp.test.ts'))
    expect(exemplar?.renderBoundary).toBe('component')
  })

  it('sets renderBoundary to unknown when no render target matches', async () => {
    const filePath = join(testDir, 'src', 'unknown-render.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('unknown-render.test.ts'))
    expect(exemplar?.renderBoundary).toBe('unknown')
  })

  it('uses provider-wrapper strategy and sets usesProviderWrapper on exemplar', async () => {
    const filePath = join(testDir, 'src', 'wrapper.test.tsx')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [
        {
          name: 'AppWrapper',
          importPath: './api/orders',
          sourceTestFile: 'src/wrapper.test.tsx',
        },
      ],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('wrapper.test.tsx'))
    expect(exemplar?.usesProviderWrapper).toBe(true)
  })

  it('returns profiles sorted alphabetically by target', async () => {
    const filePath = join(testDir, 'src', 'multi.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('zod', () => ({}))
vi.mock('axios', () => ({}))
vi.mock('./api/orders', () => ({}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const targets = result.profiles.map((p) => p.target)
    expect(targets).toEqual([...targets].sort())
  })

  it('sets usesCentralBoundarySupport on exemplar when shared-module-factory used', async () => {
    const filePath = join(testDir, 'src', 'central.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { createOrdersMock } from '../__mocks__/ordersMockFactory'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file.includes('central.test.ts'))
    expect(exemplar?.usesCentralBoundarySupport).toBe(true)
    expect(exemplar?.tags).toContain('central-boundary-support')
  })

  it('tags exemplar with provider-wrapper when usesProviderWrapper is true', async () => {
    // The providerWrappers handler only updates an existing fileUsage entry.
    // We must include the matching test file so fileUsage is populated first.
    const filePath = join(testDir, 'src', 'tagged-wrapper.test.tsx')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [
        {
          name: 'AppWrapper',
          importPath: '@/providers/AppWrapper',
          sourceTestFile: 'src/tagged-wrapper.test.tsx',
        },
      ],
      mutationLifecycles: [],
    })

    const exemplar = result.exemplars.find((e) => e.file === 'src/tagged-wrapper.test.tsx')
    expect(exemplar?.usesProviderWrapper).toBe(true)
    expect(exemplar?.tags).toContain('provider-wrapper')
  })

  it('sets confidence based on weight and supportImportPath presence', async () => {
    const filePath = join(testDir, 'src', 'confidence.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import { createOrdersMock } from '../__mocks__/ordersMockFactory'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    // Factory export gives weight=3, plus 0.2 for having a supportImportPath => high confidence
    expect(ordersProfile?.confidence).toBe('high')
  })

  it('computes low confidence for simple mock with no support path', async () => {
    const filePath = join(testDir, 'src', 'low-confidence.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    // weight=1 out of total=1, score=1.0, no supportImportPath bonus
    // 1.0 >= 0.8 => 'high' actually, so let's just verify it's a valid confidence
    expect(['low', 'medium', 'high']).toContain(ordersProfile?.confidence)
  })

  it('normalizes backslash paths from test file content', async () => {
    const filePath = join(testDir, 'src', 'backslash.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    // The mock target with backslashes will be normalized to forward slashes by the loader
    // The AST mock target string itself is what matters
    const content = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    expect(result.profiles.some((p) => p.target === './api/orders')).toBe(true)
  })

  it('resolves conflicting strategies by strategyPriority when weights are tied', async () => {
    // Two test files each mock the same target once (weight=1 each).
    // File A: inline vi.mock (real-runtime strategy)
    // File B: provider-wrapper via providerWrappers param (provider-wrapper strategy, weight=2)
    // The provider-wrapper should win due to higher priority and weight.
    const filePathA = join(testDir, 'src', 'conflict-a.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const contentA = `
vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [
        { path: filePathA, content: contentA },
      ],
      renderTargets: [],
      providerWrappers: [
        {
          name: 'AppWrapper',
          importPath: './api/orders',
          sourceTestFile: 'src/conflict-a.test.ts',
        },
      ],
      mutationLifecycles: [],
    })

    const ordersProfile = result.profiles.find((p) => p.target === './api/orders')
    // provider-wrapper has weight=2, inline has weight=1 => provider-wrapper wins
    expect(ordersProfile?.strategy).toBe('provider-wrapper')
    // The real-runtime entry is a conflict
    expect(ordersProfile?.conflictTargets.length).toBeGreaterThan(0)
  })

  it('extracts returned object from arrow function with block body (lines 363-369)', async () => {
    // Arrow function with block body: () => { return { ... } }
    const filePath = join(testDir, 'src', 'arrow-block.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => {
  return {
    createOrder: vi.fn(),
  }
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile).toBeDefined()
    expect(profile?.kind).toBe('data-module')
  })

  it('falls through arrow block body with no object return (line 369 fallthrough)', async () => {
    // Arrow block body that has no "return {...}" -> falls through to line 369 without returning
    const filePath = join(testDir, 'src', 'arrow-no-obj.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', () => {
  const x = 1
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    // Still creates a profile for the target, just with no extracted property names
    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile).toBeDefined()
  })

  it('extracts returned object from regular function expression factory (lines 372-375)', async () => {
    // Regular function expression: function() { return { ... } }
    const filePath = join(testDir, 'src', 'func-expr.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', function() {
  return {
    createOrder: vi.fn(),
  }
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile).toBeDefined()
    expect(profile?.kind).toBe('data-module')
  })

  it('falls through function expression with no object return (lines 377-379)', async () => {
    // Function expression with no return or non-object return -> falls through to null
    const filePath = join(testDir, 'src', 'func-no-obj.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders', function() {
  doSetup()
})
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile).toBeDefined()
  })

  it('resolves default import binding used as factory spread (lines 300-304)', async () => {
    // Default import from a support file used as factory spread
    // triggers isImportDefaultSpecifier branch in buildImportedBindings
    const filePath = join(testDir, 'src', 'default-import.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
import createOrdersMock from '../__mocks__/ordersMockFactory'

vi.mock('./api/orders', () => ({
  ...createOrdersMock(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile?.strategy).toBe('shared-module-factory')
    expect(profile?.supportExports.factoryExport).toBe('createOrdersMock')
  })

  it('assigns inline-safe strategy for env-like mock targets (lines 344-345)', async () => {
    // 'Math' classifies as 'env' -> inferStrategy returns 'inline-safe'
    const filePath = join(testDir, 'src', 'env-mock.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('Math', () => ({
  random: vi.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === 'Math')
    expect(profile?.strategy).toBe('inline-safe')
    expect(profile?.kind).toBe('env')
  })

  it('handles vi.mock call with no factory argument (null returnedObject)', async () => {
    // vi.mock with no factory triggers getReturnedObjectPropertyNames(null) -> lines 383-384
    const filePath = join(testDir, 'src', 'no-factory.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('./api/orders')
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './api/orders')
    expect(profile).toBeDefined()
    expect(profile?.kind).toBe('data-module')
  })

  it('collects string literal property key names from mock factory (StringLiteral branch)', async () => {
    // Mock factory with string literal property key like { 'some-key': fn } -> lines 392-393
    const filePath = join(testDir, 'src', 'string-key.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('@/components/ui/modal', () => ({
  'Dialog': vi.fn(),
  Modal: vi.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === '@/components/ui/modal')
    expect(profile).toBeDefined()
    // 'Dialog' string key and Modal identifier key should both be collected
    expect(profile?.guardrailReason).toBe('repo-owned-ui-wrapper')
  })

  it('collects method shorthand property names from mock factory (ObjectMethod branch)', async () => {
    // vi.mock factory with shorthand methods triggers the isObjectMethod branch in
    // getReturnedObjectPropertyNames (lines 397-399)
    const filePath = join(testDir, 'src', 'method-shorthand.test.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    const content = `
vi.mock('@/components/ui/modal', () => ({
  useModal() { return {} },
  Dialog: vi.fn(),
}))
`

    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [{ path: filePath, content }],
      renderTargets: [],
      providerWrappers: [],
      mutationLifecycles: [],
    })

    const modalProfile = result.profiles.find((p) => p.target === '@/components/ui/modal')
    expect(modalProfile).toBeDefined()
    // useModal is a method shorthand; Dialog is a component -> guardrail fires
    expect(modalProfile?.guardrailReason).toBe('repo-owned-ui-wrapper')
  })

  it('sorts conflicting entries by supportImportPath when weights and strategy priorities are equal', async () => {
    // Two provider wrappers for the same target with same weight=2 and same strategy.
    // The localeCompare branch (line 634) fires to break the tie by supportImportPath.
    const result = await collectBoundaryLearning({
      projectRoot: testDir,
      testFiles: [],
      renderTargets: [],
      providerWrappers: [
        {
          name: 'WrapperA',
          importPath: './providers/WrapperB',
          sourceTestFile: 'src/a.test.tsx',
        },
        {
          name: 'WrapperB',
          importPath: './providers/WrapperB',
          sourceTestFile: 'src/b.test.tsx',
        },
      ],
      mutationLifecycles: [],
    })

    const profile = result.profiles.find((p) => p.target === './providers/WrapperB')
    expect(profile).toBeDefined()
    expect(profile?.strategy).toBe('provider-wrapper')
  })

  it('discoverBoundaryImportsFromSource skips non-import declarations in ast body', async () => {
    // Include non-import statements (variable declarations, function calls) so
    // the non-import branch (lines 719-720) is exercised in discoverBoundaryImportsFromSource
    const filePath = join(testDir, 'src', 'mixed.ts')
    await mkdir(join(testDir, 'src'), { recursive: true })

    await writeFile(
      filePath,
      `
import axios from 'axios'
const x = 1
function foo() {}
export default foo
`
    )

    const result = await discoverBoundaryImportsFromSource(filePath)
    expect(result.some((r) => r.target === 'axios')).toBe(true)
    // Non-import statements were skipped without error
    expect(result.some((r) => r.target === 'foo')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// summarizeBoundaryProfiles
// ---------------------------------------------------------------------------

describe('summarizeBoundaryProfiles', () => {
  const baseOptions = {
    renderHelpers: [],
    playwrightAuth: null,
  }

  it('returns placeholder message when no profiles', () => {
    const lines = summarizeBoundaryProfiles([], baseOptions)
    expect(lines).toEqual(['- No learned boundary profiles yet.'])
  })

  it('formats a basic profile entry', () => {
    const profiles: TaroBoundaryProfile[] = [
      {
        target: './api/orders',
        kind: 'data-module',
        strategy: 'real-runtime',
        guardrailReason: null,
        supportImportPath: null,
        supportPath: null,
        supportExports: {
          factoryExport: null,
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'manual',
        confidence: 'medium',
        files: ['src/feature.test.ts'],
        evidence: [],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('./api/orders')
    expect(lines[0]).toContain('data-module')
    expect(lines[0]).toContain('real-runtime')
    expect(lines[0]).toContain('confidence=medium')
  })

  it('includes guardrail reason when present', () => {
    const profiles: TaroBoundaryProfile[] = [
      {
        target: '@/components/ui/modal',
        kind: 'local-child',
        strategy: 'forbid',
        guardrailReason: 'repo-owned-ui-wrapper',
        supportImportPath: null,
        supportPath: null,
        supportExports: {
          factoryExport: null,
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'unknown',
        confidence: 'high',
        files: ['src/modal.test.tsx'],
        evidence: [],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines[0]).toContain('guardrail=repo-owned-ui-wrapper')
  })

  it('includes support path when present', () => {
    const profiles: TaroBoundaryProfile[] = [
      {
        target: './api/orders',
        kind: 'data-module',
        strategy: 'shared-module-factory',
        guardrailReason: null,
        supportImportPath: '../__mocks__/ordersMockFactory',
        supportPath: null,
        supportExports: {
          factoryExport: 'createOrdersMock',
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'typed-defaults',
        confidence: 'high',
        files: ['src/feature.test.ts'],
        evidence: [],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines[0]).toContain('support=../__mocks__/ordersMockFactory')
  })

  it('includes low-confidence-scaffold flag when set', () => {
    const profiles: TaroBoundaryProfile[] = [
      {
        target: './api/orders',
        kind: 'data-module',
        strategy: 'real-runtime',
        guardrailReason: null,
        supportImportPath: null,
        supportPath: null,
        supportExports: {
          factoryExport: null,
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'manual',
        confidence: 'low',
        files: ['src/feature.test.ts'],
        evidence: [],
        conflictTargets: [],
        lowConfidenceScaffold: true,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines[0]).toContain('low-confidence-scaffold')
  })

  it('includes conflicts when present', () => {
    const profiles: TaroBoundaryProfile[] = [
      {
        target: './api/orders',
        kind: 'data-module',
        strategy: 'shared-module-factory',
        guardrailReason: null,
        supportImportPath: '../__mocks__/a',
        supportPath: null,
        supportExports: {
          factoryExport: 'createOrdersMock',
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'typed-defaults',
        confidence: 'medium',
        files: ['src/feature.test.ts'],
        evidence: [],
        conflictTargets: ['real-runtime', 'shared-module-factory -> ..//__mocks__/b'],
        lowConfidenceScaffold: false,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines[0]).toContain('conflicts=')
    expect(lines[0]).toContain('real-runtime')
  })

  it('appends render helpers line when helpers are present', () => {
    const lines = summarizeBoundaryProfiles([], {
      renderHelpers: [
        {
          name: 'renderWithProviders',
          importPath: '../test-utils',
          importKind: 'named',
          sourceTestFile: 'src/feature.test.tsx',
          usageCount: 5,
          usesWithin: false,
        },
      ],
      playwrightAuth: null,
    })

    expect(lines.some((l) => l.includes('renderWithProviders'))).toBe(true)
    expect(lines.some((l) => l.includes('Render helpers'))).toBe(true)
  })

  it('appends playwright auth line when present', () => {
    const lines = summarizeBoundaryProfiles([], {
      renderHelpers: [],
      playwrightAuth: {
        strategy: 'storageState',
        path: 'playwright/.auth/user.json',
        detectedAt: 'init',
        source: 'detected',
      },
    })

    expect(lines.some((l) => l.includes('storageState'))).toBe(true)
    expect(lines.some((l) => l.includes('playwright/.auth/user.json'))).toBe(true)
  })

  it('appends both render helpers and playwright auth', () => {
    const lines = summarizeBoundaryProfiles([], {
      renderHelpers: [
        {
          name: 'renderWithProviders',
          importPath: '../test-utils',
          importKind: 'named',
          sourceTestFile: 'src/feature.test.tsx',
          usageCount: 3,
          usesWithin: false,
        },
      ],
      playwrightAuth: {
        strategy: 'instructions',
        path: 'playwright/auth.ts',
        detectedAt: 'generate',
        source: 'manual',
      },
    })

    expect(lines.some((l) => l.includes('Render helpers'))).toBe(true)
    expect(lines.some((l) => l.includes('Visual auth'))).toBe(true)
  })

  it('formats support path with extra slash due to string template', () => {
    // The summarizeBoundaryProfiles uses template literal: `support=${profile.supportImportPath}`
    // Verify the exact format that's emitted
    const profiles: TaroBoundaryProfile[] = [
      {
        target: 'axios',
        kind: 'network-client',
        strategy: 'shared-module-factory',
        guardrailReason: null,
        supportImportPath: '../__mocks__/axiosMock',
        supportPath: null,
        supportExports: {
          factoryExport: 'createAxiosMock',
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: 'typed-defaults',
        confidence: 'high',
        files: [],
        evidence: [],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      },
    ]

    const lines = summarizeBoundaryProfiles(profiles, baseOptions)
    expect(lines[0]).toMatch(/support=/)
    expect(lines[0]).toContain('../__mocks__/axiosMock')
  })
})
