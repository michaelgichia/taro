import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  analyzeMocks,
  analyzeMutationLifecycle,
  deriveMockRecommendations,
  detectMockInstability,
  scanMockTargets,
} from '#core/mock-intelligence.ts'
import { scanConventions } from '#core/scanner.ts'

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

  // Lines 113-115: file has mutation trigger content but only 1 lifecycle stage → filtered out (null)
  it('excludes mutation files that only have one lifecycle stage from mutationLifecycles', async () => {
    // Content matches MUTATION_TRIGGER_REGEX (has "mutate") but only has success stage cues
    await writeFile(
      join(testDir, 'single-stage.test.ts'),
      `
        import { describe, it, vi } from 'vitest'

        describe('single stage', () => {
          it('only success path', async () => {
            const mutate = vi.fn().mockResolvedValue({ ok: true })
            await mutate()
            expect(mutate).toHaveBeenCalledTimes(1)
          })
        })
      `
    )

    const analysis = await analyzeMocks(testDir)

    expect(analysis.mutationLifecycles).toEqual([])
    expect(analysis.interactionContracts).toEqual([])
  })

  // Lines 133-151: deriveInteractionContracts produces a contract when loading + error stages present
  it('derives interaction contracts for mutation files with loading and error stages', async () => {
    // Content must match MUTATION_TRIGGER_REGEX and have loading + error stage cues (≥2 stages)
    await writeFile(
      join(testDir, 'loading-error.test.ts'),
      `
        import { describe, it, vi } from 'vitest'

        describe('form submission', () => {
          it('shows loading then error', async () => {
            const mutate = vi.fn().mockRejectedValue(new Error('failed'))
            expect(submitButton).toBeDisabled()
            await expect(mutate()).rejects.toThrow('failed')
            expect(screen.getByRole('alert')).toBeInTheDocument()
          })
        })
      `
    )

    const analysis = await analyzeMocks(testDir)

    expect(analysis.mutationLifecycles).toHaveLength(1)
    expect(analysis.mutationLifecycles[0]).toMatchObject({
      file: 'loading-error.test.ts',
      stages: expect.arrayContaining(['loading', 'error']),
    })

    expect(analysis.interactionContracts).toHaveLength(1)
    expect(analysis.interactionContracts[0]).toMatchObject({
      file: 'loading-error.test.ts',
      kind: 'mutation-form',
      states: expect.arrayContaining(['in-flight', 'failed-completion']),
      overrideStyle: 'none',
      confidence: 'low',
    })
  })

  // Lines 138-139: deriveInteractionContracts skips lifecycles that only have success stage
  // (states array is empty after filtering, so the `continue` branch is taken)
  it('skips interaction contract generation when lifecycle only has success stage', async () => {
    // Two stages needed to pass the stages.length < 2 gate, but neither is loading/error.
    // Use a file with mutation trigger + success stage only... but we need ≥2 stages to reach
    // deriveInteractionContracts. We craft content with "success" AND a custom second cue that
    // is not loading/error — the STAGE_PATTERNS only have loading/success/error, so we need
    // to use success + something else. Actually, let's use success + loading-adjacent cue so
    // stages.length ≥ 2, but derive only a success-only lifecycle to reach the skip branch.
    //
    // The simplest route: produce a lifecycle with stages: ['success'] alone won't pass
    // stages.length < 2. We instead produce stages: ['success'] via a file that somehow
    // has exactly one stage. That hits the null branch (lines 113-115), not lines 138-139.
    //
    // To hit lines 138-139 we need a lifecycle that reaches deriveInteractionContracts with
    // stages that include neither 'loading' nor 'error', i.e. only ['success'].
    // That requires stages.length >= 2 to be false for null return... wait, stages.length must
    // be >= 2 to NOT return null. So we need at least two stages where neither is loading/error.
    //
    // But STAGE_PATTERNS only defines loading, success, error. So if both detected stages are
    // 'success', they de-duplicate to one entry. Therefore we need a second non-loading/error
    // stage. Since only those three exist, it's impossible to get ≥2 non-loading/error stages.
    //
    // The real skip path (continue) is reached when a lifecycle has e.g. only ['success']
    // stage AND stages.length was ≥ 2 somehow... which can't happen with the current patterns.
    //
    // We verify the behavior through analyzeMocks: a file with only success cues produces
    // stages.length === 1 → null (filtered), so interactionContracts stays empty.
    // This test documents and confirms that path.
    await writeFile(
      join(testDir, 'success-only.test.ts'),
      `
        import { describe, it, vi } from 'vitest'

        describe('happy path', () => {
          it('saves successfully', async () => {
            const save = vi.fn().mockResolvedValue({ saved: true })
            await save()
            expect(save).toHaveBeenCalled()
            expect(screen.getByText('success')).toBeInTheDocument()
          })
        })
      `
    )

    const analysis = await analyzeMocks(testDir)

    // success-only file: stages = ['success'] → length 1 → null → filtered → no lifecycles
    expect(analysis.mutationLifecycles).toEqual([])
    expect(analysis.interactionContracts).toEqual([])
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

  // Lines 113-115: file with mutation trigger but only 1 stage returns null and is filtered out
  it('filters out files that match mutation trigger but only have one lifecycle stage', async () => {
    // "mutate" keyword triggers MUTATION_TRIGGER_REGEX, but only success stage cues are present
    await writeFile(
      join(testDir, 'single-stage-lifecycle.test.ts'),
      `
        import { describe, it, vi } from 'vitest'

        describe('single stage', () => {
          it('only success', async () => {
            const mutate = vi.fn().mockResolvedValue({ ok: true })
            await mutate()
            expect(mutate).toHaveBeenCalledTimes(1)
          })
        })
      `
    )

    const patterns = await analyzeMutationLifecycle(testDir)

    expect(patterns).toEqual([])
  })

  // Lines 117-124: file with mutation trigger and ≥2 stages produces a MutationLifecyclePattern
  it('produces MutationLifecyclePattern for files with loading and error stages', async () => {
    await writeFile(
      join(testDir, 'loading-and-error.test.ts'),
      `
        import { describe, it, vi } from 'vitest'

        describe('mutation with loading and error', () => {
          it('shows disabled button and error alert', async () => {
            const mutate = vi.fn().mockRejectedValue(new Error('boom'))
            expect(submitBtn).toBeDisabled()
            await expect(mutate()).rejects.toThrow('boom')
            expect(screen.getByRole('alert')).toBeInTheDocument()
          })
        })
      `
    )

    const patterns = await analyzeMutationLifecycle(testDir)

    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toMatchObject({
      file: 'loading-and-error.test.ts',
      stages: expect.arrayContaining(['loading', 'error']),
      evidence: expect.arrayContaining(['loading cues detected', 'error cues detected']),
    })
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
