import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  analyzeMocks,
  analyzeMutationLifecycle,
  detectMockInstability,
  deriveMockRecommendations,
  scanMockTargets,
} from './mock-intelligence.js'
import { scanConventions } from './scanner.js'

let testDir: string

beforeEach(async () => {
  testDir = join(tmpdir(), `taro-mock-intel-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('scanMockTargets', () => {
  it('detects repeated mock targets across discovered tests', async () => {
    await writeFile(
      join(testDir, 'alpha.test.ts'),
      `vi.mock('./api/orders')\nvi.mock('./api/users')`
    )
    await writeFile(
      join(testDir, 'beta.test.ts'),
      `jest.mock('./api/orders')`
    )

    const targets = await scanMockTargets(testDir)

    expect(targets).toEqual([
      {
        target: './api/orders',
        files: ['alpha.test.ts', 'beta.test.ts'],
        count: 2,
      },
      {
        target: './api/users',
        files: ['alpha.test.ts'],
        count: 1,
      },
    ])
  })
})

describe('deriveMockRecommendations', () => {
  it('recommends extract for repeated targets and inline for one-off targets', () => {
    const recommendations = deriveMockRecommendations([
      { target: './api/orders', files: ['a.test.ts', 'b.test.ts'], count: 2 },
      { target: './api/users', files: ['a.test.ts'], count: 1 },
    ])

    expect(recommendations).toEqual([
      {
        target: './api/orders',
        files: ['a.test.ts', 'b.test.ts'],
        count: 2,
        kind: 'extract',
        reason: 'Mock target appears in multiple tests and should be shared',
      },
      {
        target: './api/users',
        files: ['a.test.ts'],
        count: 1,
        kind: 'inline',
        reason: 'Mock target appears in one place and can stay local to the test',
      },
    ])
  })
})

describe('analyzeMocks', () => {
  it('combines conventions and repeated-target analysis', async () => {
    await writeFile(
      join(testDir, 'alpha.test.ts'),
      `import { describe, it } from 'vitest'\nvi.mock('./api/orders')\ndescribe('x', () => { it('y', () => {}) })`
    )
    await writeFile(
      join(testDir, 'beta.test.ts'),
      `import { describe, it } from 'vitest'\nvi.mock('./api/orders')\nvi.mock('./api/users')\ndescribe('x', () => { it('y', () => {}) })`
    )
    await scanConventions(testDir)

    const analysis = await analyzeMocks(testDir)

    expect(analysis.conventions?.mockPattern).toBe('vi.mock')
    expect(analysis.source).toBe('repo-scan')
    expect(analysis.repeatedTargets).toEqual([
      {
        target: './api/orders',
        files: ['alpha.test.ts', 'beta.test.ts'],
        count: 2,
      },
    ])
    expect(analysis.recommendations[0]).toEqual(
      expect.objectContaining({
        target: './api/orders',
        kind: 'extract',
      })
    )
    expect(analysis.mutationLifecycles).toEqual([])
    expect(analysis.interactionContracts).toEqual([])
    expect(analysis.instabilityWarnings).toEqual([])
    expect(analysis.sharedMockFactories).toEqual([])
    expect(analysis.preferredSharedMocks).toEqual({})
    expect(analysis.forbidMocks).toEqual([])
    expect(analysis.companionPolicy).toBe('heuristic')
    expect(analysis.enabledContractFamilies).toEqual(['mutation-form'])
  })

  it('uses the resolved package profile when provided', async () => {
    const analysis = await analyzeMocks(testDir, {
      packageProfile: {
        packagePath: 'packages/example-app',
        packageName: '@repo/example-app',
        scannedAt: new Date().toISOString(),
        testFileCount: 2,
        conventions: {
          scannedAt: new Date().toISOString(),
          projectRoot: '.',
          importStyle: 'esm',
          mockPattern: 'vi.mock',
          testFiles: [],
          folderPattern: 'colocated',
          fileExtension: 'ts',
        },
        importStyle: { value: 'esm', confidence: 'high', evidence: [] },
        runner: { value: 'vitest', confidence: 'high', evidence: [] },
        mockPattern: { value: 'vi.mock', confidence: 'high', evidence: [] },
        folderPattern: { value: 'colocated', confidence: 'high', evidence: [] },
        fileExtension: { value: 'ts', confidence: 'high', evidence: [] },
        renderHelpers: [],
        providerWrappers: [],
        renderTargets: [],
        repeatedMockTargets: [
          {
            target: '@/modules/orders/api',
            files: ['packages/example-app/src/a.test.tsx', 'packages/example-app/src/b.test.tsx'],
            count: 2,
          },
          {
            target: '@repo/ui-kit',
            files: ['packages/example-app/src/a.test.tsx'],
            count: 1,
          },
        ],
        sharedMockFactories: [
          {
            target: 'mockOrdersApi',
            importPath: '@/tests/mocks/orders',
            files: ['packages/example-app/src/a.test.tsx'],
            count: 1,
          },
        ],
        inlineSafeMockTargets: ['next/navigation'],
        interactionContracts: [],
        mutationLifecycles: [],
        instabilityWarnings: [],
        mockRecommendations: [
          {
            target: '@/modules/orders/api',
            kind: 'extract',
            reason: 'Mock target appears in multiple tests and should be shared',
            files: ['packages/example-app/src/a.test.tsx', 'packages/example-app/src/b.test.tsx'],
            count: 2,
          },
        ],
        fixtureRoots: [],
        exemplars: [],
        warnings: [],
        appliedOverrides: ['preferredSharedMocks', 'forbidMocks'],
        effectiveRunner: 'vitest',
        effectiveRenderHelper: null,
        forbidMocks: ['@repo/ui-kit'],
        preferredSharedMocks: {
          '@/modules/orders/api': '@/tests/mocks/orders',
        },
        boundaryPolicies: {},
        preferredBoundaryImplementations: {},
        forbidBoundaryTargets: [],
        effectiveQueryHookPolicy: 'avoid',
        effectiveCompanionPolicy: 'heuristic',
        enabledContractFamilies: ['mutation-form'],
      },
    })

    expect(analysis.source).toBe('package-profile')
    expect(analysis.packagePath).toBe('packages/example-app')
    expect(analysis.repeatedTargets).toEqual([
      {
        target: '@/modules/orders/api',
        files: ['packages/example-app/src/a.test.tsx', 'packages/example-app/src/b.test.tsx'],
        count: 2,
      },
    ])
    expect(analysis.recommendations[0]).toEqual(
      expect.objectContaining({
        target: '@/modules/orders/api',
        kind: 'extract',
        reason: 'Shared mock preference pinned to @/tests/mocks/orders',
      })
    )
    expect(analysis.forbidMocks).toEqual(['@repo/ui-kit'])
    expect(analysis.preferredSharedMocks).toEqual({
      '@/modules/orders/api': '@/tests/mocks/orders',
    })
    expect(analysis.companionPolicy).toBe('heuristic')
    expect(analysis.enabledContractFamilies).toEqual(['mutation-form'])
  })
})

describe('analyzeMutationLifecycle', () => {
  it('detects loading success and error cues in mutation-heavy tests', async () => {
    await writeFile(
      join(testDir, 'mutation-flow.test.ts'),
      `
        import { beforeEach, describe, expect, it, vi } from 'vitest'

        describe('mutation flow', () => {
          it('handles success and error states', async () => {
            const submitOrder = vi.fn().mockResolvedValue({ ok: true })
            const submitOrderWithError = vi.fn().mockRejectedValue(new Error('boom'))

            expect({ isLoading: true }).toBeTruthy()
            await submitOrder()
            expect(submitOrder).toHaveBeenCalled()
            expect(screen.getByText('Saved')).toBeInTheDocument()

            await expect(submitOrderWithError()).rejects.toThrow('boom')
            expect(screen.getByRole('alert')).toBeInTheDocument()
          })
        })
      `
    )

    const patterns = await analyzeMutationLifecycle(testDir)

    expect(patterns).toEqual([
      {
        file: 'mutation-flow.test.ts',
        stages: ['loading', 'success', 'error'],
        evidence: [
          'loading cues detected',
          'success cues detected',
          'error cues detected',
        ],
      },
    ])
  })
})

describe('detectMockInstability', () => {
  it('warns on test-scoped factories and repeated reset churn', async () => {
    await writeFile(
      join(testDir, 'unstable-mocks.test.ts'),
      `
        import { beforeEach, describe, it, vi } from 'vitest'

        const api = vi.fn()

        beforeEach(() => {
          vi.resetAllMocks()
        })

        describe('unstable mocks', () => {
          it('recreates factories', () => {
            vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
            api.mockResolvedValue({ ok: true })
          })

          it('reconfigures the same mock again', () => {
            vi.mock('./api/orders', () => ({ createOrder: vi.fn() }))
            api.mockRejectedValue(new Error('boom'))
          })
        })
      `
    )

    const warnings = await detectMockInstability(testDir)

    expect(warnings).toEqual([
      {
        file: 'unstable-mocks.test.ts',
        kind: 'per-test-churn',
        reason: 'Mock configuration is reset and redefined repeatedly across tests',
        evidence: [
          '1 resetAll/clearAll/restoreAll call(s)',
          '2 mock configuration call(s)',
        ],
      },
      {
        file: 'unstable-mocks.test.ts',
        kind: 'recreated-factory',
        reason: 'Mocks are declared inside test bodies and may recreate factories per test run',
        evidence: ['2 test block(s) declare vi.mock/jest.mock'],
      },
    ])
  })
})
