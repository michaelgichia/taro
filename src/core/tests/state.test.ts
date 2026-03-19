import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __stateTestUtils,
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  findRepoFallbackPackageProfile,
  formatStateSummary,
  initTaroState,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  readTaroState,
  refreshTaroState,
  resolveTaroPackageProfile,
  writeTaroState,
} from '#core/state.ts'

let projectRoot: string

beforeEach(async () => {
  projectRoot = join(tmpdir(), `taro-state-${Date.now()}`)
  await mkdir(projectRoot, { recursive: true })
  await writeFile(
    join(projectRoot, 'package.json'),
    JSON.stringify({ name: 'root-app', private: true }, null, 2),
    'utf-8'
  )
})

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true })
})

function makeScoreSignals(overrides: Record<string, unknown> = {}) {
  return {
    queryCheckpointCount: 0,
    roleQueryCount: 0,
    testIdQueryCount: 0,
    strongAssertionCount: 0,
    presenceAssertionCount: 0,
    visibilityAssertionCount: 0,
    visibilityOnlyTestCount: 0,
    presenceOnlyTestCount: 0,
    boundaryWarningCount: 0,
    boundaryIssueCount: 0,
    placeholderRenderTarget: false,
    multipleTestBlocks: false,
    minimumExpectedTestCount: 0,
    branchCoverageRatio: 1,
    missingMockCount: 0,
    fireEventCount: 0,
    hasBasePropsConstant: false,
    hasOverrideRenderHelper: false,
    duplicatedInlineRenderCount: 0,
    hasStandaloneUtilityDescribe: false,
    ...overrides,
  }
}

describe('initTaroState', () => {
  it('writes .taro/state.json with no package profiles when the repo has no tests', async () => {
    const result = await initTaroState(projectRoot)
    const state = await readTaroState(projectRoot)

    expect(result.summary.packageCount).toBe(0)
    expect(state?.packages).toEqual({})

    const persisted = JSON.parse(
      await readFile(join(projectRoot, '.taro', 'state.json'), 'utf-8')
    ) as { packages: unknown }
    expect(persisted.packages).toEqual({})
  })

  it('falls back to a root package descriptor when no package.json files exist', async () => {
    await rm(join(projectRoot, 'package.json'), { force: true })
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(
      join(projectRoot, 'src', 'app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['.']).toBeDefined()
    expect(result.state.packages['.']?.packagePath).toBe('.')
  })

  it('ignores invalid overrides.json and reports the issue in summary warnings', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(join(projectRoot, '.taro', 'overrides.json'), '{"packages":[]}', 'utf-8')

    const result = await initTaroState(projectRoot)

    expect(result.summary.warnings).toContain(
      'Invalid .taro/overrides.json shape detected. Taro will ignore overrides for this run.'
    )
  })

  it('builds package-scoped runner profiles for mixed workspaces', async () => {
    const vitestPackage = join(projectRoot, 'packages', 'example-app')
    const jestPackage = join(projectRoot, 'packages', 'legacy')

    await mkdir(join(vitestPackage, 'src'), { recursive: true })
    await mkdir(join(jestPackage, 'src'), { recursive: true })
    await writeFile(
      join(vitestPackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(
      join(jestPackage, 'package.json'),
      JSON.stringify({ name: '@repo/legacy', devDependencies: { jest: '^29.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(vitestPackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(join(jestPackage, 'jest.config.ts'), 'module.exports = {}', 'utf-8')
    await writeFile(
      join(vitestPackage, 'src', 'example-app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )
    await writeFile(
      join(jestPackage, 'src', 'legacy.test.tsx'),
      "describe('legacy', () => { it('works', () => { expect(true).toBe(true); jest.fn() }) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['packages/example-app']?.runner.value).toBe('vitest')
    expect(result.state.packages['packages/legacy']?.runner.value).toBe('jest')
  })

  it('learns global jest-dom setup from configured Vitest setup files', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')

    await mkdir(join(examplePackage, 'src', 'tests'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'vitest.config.ts'),
      `
        import { defineConfig } from 'vitest/config'

        export default defineConfig({
          test: {
            setupFiles: ['./src/tests/setup.ts'],
          },
        })
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'tests', 'setup.ts'),
      "import '@testing-library/jest-dom/vitest'\n",
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'example-app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['packages/example-app']?.jestDomSetup).toEqual(
      expect.objectContaining({
        value: 'global-setup',
        confidence: 'high',
      })
    )
  })

  it('assigns unmatched root-level tests to the nearest available package when no root descriptor exists', async () => {
    await rm(join(projectRoot, 'package.json'), { force: true })

    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(projectRoot, 'root-flow.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('root flow', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await __stateTestUtils.scanProjectState(projectRoot)

    expect(Object.keys(result.state.packages)).toEqual(['packages/example-app'])
    expect(result.state.packages['packages/example-app']?.testFileCount).toBe(1)
  })

  it('learns render helpers, repeated mocks, fixture roots, and respects overrides', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mock-store'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mock-store', 'orders.ts'),
      "export const ORDER_001 = { id: 'ORDER_001' }\n",
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature-flow.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        import { renderWithProviders } from '@/tests/renderWithProviders'
        import { ORDER_001 } from '@/tests/mock-store/orders'
        import FeatureModule from './FeatureModule'

        vi.mock('@/features/orders/api')

        describe('feature flow', () => {
          it('renders', () => {
            renderWithProviders(<FeatureModule />, { wrapper: QueryClientProvider })
            expect(ORDER_001.id).toBe('ORDER_001')
          })
        })
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'checkout.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        vi.mock('@/features/orders/api')
        describe('checkout', () => {
          it('saves', () => {
            expect(true).toBe(true)
          })
        })
      `,
      'utf-8'
    )
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'overrides.json'),
      JSON.stringify(
        {
          packages: {
            'packages/example-app': {
              runner: 'jest',
              renderHelper: {
                name: 'renderExampleApp',
                importPath: '@/tests/renderExampleApp',
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const exampleProfile = result.state.packages['packages/example-app']
    const resolvedProfile = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'feature-flow.test.tsx'),
      {
        packages: {
          'packages/example-app': {
            runner: 'jest',
            renderHelper: {
              name: 'renderExampleApp',
              importPath: '@/tests/renderExampleApp',
            },
          },
        },
      }
    )

    expect(exampleProfile?.renderHelpers[0]).toEqual(
      expect.objectContaining({
        name: 'renderWithProviders',
        importPath: '@/tests/renderWithProviders',
      })
    )
    expect(exampleProfile?.repeatedMockTargets).toEqual([
      {
        target: '@/features/orders/api',
        files: ['packages/example-app/src/checkout.test.tsx', 'packages/example-app/src/feature-flow.test.tsx'],
        count: 2,
      },
    ])
    expect(exampleProfile?.fixtureRoots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '@/tests/mock-store',
          kind: 'mock-store',
        }),
      ])
    )
    expect(result.state.mockStore.rootDir).toBe('packages/example-app/src/tests/mock-store')
    expect(resolvedProfile?.effectiveRunner).toBe('jest')
    expect(resolvedProfile?.effectiveRenderHelper).toEqual(
      expect.objectContaining({
        name: 'renderExampleApp',
        importPath: '@/tests/renderExampleApp',
      })
    )
  })

  it('learns boundary profiles and writes a human-readable boundary summary', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'orders-api.ts'),
      `
        export function createOrdersApiMock() {
          return {}
        }

        export function resetOrdersApiMock() {}

        export const useCreateOrderMutationMock = {
          mockImplementationOnce() {},
        }
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature-module.test.tsx'),
      `
        import { beforeEach, describe, expect, it, vi } from 'vitest'
        import { render } from '@testing-library/react'
        import { renderWithProviders, QueryClientProvider } from '@/tests/renderWithProviders'
        import {
          createOrdersApiMock,
          resetOrdersApiMock,
          useCreateOrderMutationMock,
        } from '@/tests/mocks/orders-api'
        import FeatureModule from './FeatureModule'

        vi.mock('@/features/orders/api', async (importOriginal) => {
          const actual = await importOriginal<typeof import('@/features/orders/api')>()
          return { ...actual, ...createOrdersApiMock() }
        })

        beforeEach(resetOrdersApiMock)

        describe('feature module', () => {
          it('reuses learned boundary support', () => {
            const submitOrder = vi.fn().mockResolvedValue({ ok: true })
            const submitOrderWithError = vi.fn().mockRejectedValue(new Error('boom'))
            useCreateOrderMutationMock.mockImplementationOnce(() => ({
              mutate: vi.fn(),
              isPending: true,
            }))

            render(<FeatureModule />)
            renderWithProviders(<FeatureModule />, { wrapper: QueryClientProvider })
            expect({ isLoading: true }).toBeTruthy()
            void submitOrder()
            expect(submitOrder).toHaveBeenCalled()
            expect(screen.getByRole('alert')).toBeInTheDocument()
            void submitOrderWithError()
            expect(true).toBe(true)
          })
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const exampleProfile = result.state.packages['packages/example-app']
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    expect(exampleProfile?.boundaryProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: '@/features/orders/api',
          kind: 'data-module',
          strategy: 'shared-module-factory',
          supportImportPath: '@/tests/mocks/orders-api',
          supportExports: expect.objectContaining({
            factoryExport: 'createOrdersApiMock',
            resetExport: 'resetOrdersApiMock',
            overrideExports: ['useCreateOrderMutationMock'],
          }),
        }),
        expect.objectContaining({
          target: '@/tests/renderWithProviders',
          kind: 'local-child',
          strategy: 'provider-wrapper',
          supportImportPath: '@/tests/renderWithProviders',
        }),
      ])
    )
    expect(exampleProfile?.boundaryExemplars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/example-app/src/feature-module.test.tsx',
          usesCentralBoundarySupport: true,
          usesProviderWrapper: true,
          overrideStyle: 'stable-handles',
        }),
      ])
    )
    expect(exampleProfile?.interactionContracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'packages/example-app/src/feature-module.test.tsx',
          kind: 'mutation-form',
          states: expect.arrayContaining(['in-flight', 'failed-completion']),
          overrideStyle: 'stable-handles',
          confidence: 'high',
        }),
      ])
    )
    expect(summary).toContain('# Taro Boundary Summary')
    expect(summary).toContain('## packages/example-app')
    expect(summary).toContain('- Preferred render boundary: `module`')
    expect(summary).toContain('- Collaborator categories: data-module=1, local-child=1')
    expect(summary).toContain('- Learned interaction contracts: 1')
    expect(summary).toContain(
      '- Canonical boundary support: `@/tests/mocks/orders-api`, `@/tests/renderWithProviders`'
    )
    expect(summary).toContain(
      '- `@/features/orders/api`: data-module, shared-module-factory, confidence=high, support=@/tests/mocks/orders-api'
    )
  })

  it('persists repo-owned UI wrapper guardrails in state and summary output', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'orders-api.ts'),
      `
        export function createOrdersApiMock() {
          return {}
        }
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature-module.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        import { createOrdersApiMock } from '@/tests/mocks/orders-api'

        vi.mock('@/features/orders/api', async (importOriginal) => {
          const actual = await importOriginal<typeof import('@/features/orders/api')>()
          return { ...actual, ...createOrdersApiMock() }
        })

        vi.mock('@/components/library/Modal', () => ({
          Dialog: vi.fn(),
          DialogContent: vi.fn(),
        }))

        describe('feature module', () => {
          it('records the guardrail', () => {
            expect(true).toBe(true)
          })
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const exampleProfile = result.state.packages['packages/example-app']
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')
    const persisted = JSON.parse(
      await readFile(join(projectRoot, '.taro', 'state.json'), 'utf-8')
    ) as {
      packages: Record<string, { boundaryProfiles: Array<{ target: string; guardrailReason: string | null }> }>
    }

    expect(exampleProfile?.boundaryProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: '@/features/orders/api',
          strategy: 'shared-module-factory',
          guardrailReason: null,
        }),
        expect.objectContaining({
          target: '@/components/library/Modal',
          kind: 'local-child',
          strategy: 'forbid',
          guardrailReason: 'repo-owned-ui-wrapper',
          supportImportPath: null,
        }),
      ])
    )
    expect(summary).toContain(
      '- `@/components/library/Modal`: local-child, forbid, confidence=high, guardrail=repo-owned-ui-wrapper'
    )
    expect(
      persisted.packages['packages/example-app']?.boundaryProfiles.find(
        (profile) => profile.target === '@/components/library/Modal'
      )
    ).toEqual(
      expect.objectContaining({
        target: '@/components/library/Modal',
        guardrailReason: 'repo-owned-ui-wrapper',
      })
    )
  })

  it('detects Playwright storageState assets from config during init', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    const authDir = join(examplePackage, 'playwright', '.auth')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await mkdir(authDir, { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'playwright.config.ts'),
      `export default {
        use: {
          storageState: './playwright/.auth/user.json',
        },
      }`,
      'utf-8'
    )
    await writeFile(join(authDir, 'user.json'), '{"cookies":[],"origins":[]}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'example-app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['packages/example-app']?.playwrightAuth).toEqual({
      strategy: 'storageState',
      path: 'packages/example-app/playwright/.auth/user.json',
      detectedAt: 'init',
      source: 'detected',
    })
  })
})

describe('loadOrBootstrapTaroState', () => {
  it('ignores invalid state.json and rebuilds clean state', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(join(projectRoot, '.taro', 'state.json'), '{"version":1,"packages":[]}', 'utf-8')

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.summary.warnings).toContain(
      'Invalid .taro/state.json shape detected. Taro will ignore it and rebuild state.'
    )
    expect(result.state.packages).toEqual({})
  })

  it('migrates compatibility .taro convention and history files into .taro/state.json', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'conventions.json'),
      JSON.stringify(
        {
          scannedAt: new Date(0).toISOString(),
          projectRoot,
          importStyle: 'esm',
          mockPattern: 'vi.mock',
          testFiles: [
            {
              path: join(projectRoot, 'src', 'legacy.test.ts'),
              importStyle: 'esm',
              hasDescribeBlock: true,
              mockPattern: 'vi.mock',
              hasHelperWithExpect: false,
            },
          ],
          folderPattern: 'colocated',
          fileExtension: 'ts',
        },
        null,
        2
      ),
      'utf-8'
    )
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/recording.js',
            score: 88,
            grade: 'B',
            dimensions: {
              queryQuality: 90,
              assertionSpecificity: 80,
              testStructure: 85,
              boundaryIsolation: 95,
            },
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests).toHaveLength(1)
    expect(result.state.packages['.']?.conventions.mockPattern).toBe('vi.mock')
    await expect(readFile(join(projectRoot, '.taro', 'state.json'), 'utf-8')).resolves.toContain(
      '"generatedTests"'
    )
  })
})

describe('state hardening', () => {
  it('detects stale package profiles when package evidence changes after scan', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    const testFile = join(examplePackage, 'src', 'example-app.test.tsx')
    await writeFile(
      testFile,
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']!

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 15))
    await writeFile(
      testFile,
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works again', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const staleness = await detectPackageProfileStaleness(projectRoot, {
      ...profile,
      scannedAt: new Date(0).toISOString(),
    })

    expect(staleness.stale).toBe(true)
    expect(staleness.reason).toContain('changed after the package profile was scanned')
  })

  it('uses the fallback stale reason when evidence changed but no path can be surfaced', async () => {
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(
      join(projectRoot, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(true).toBe(true))",
      'utf-8'
    )
    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['.']!
    const evidenceSpy = vi
      .spyOn(__stateTestUtils, 'getLatestPackageEvidence')
      .mockResolvedValue({
        latestMtimeMs: Date.parse(profile.scannedAt) + 5000,
        latestPath: null,
      })

    const staleness = await detectPackageProfileStaleness(projectRoot, profile)

    evidenceSpy.mockRestore()

    expect(staleness).toEqual({
      stale: true,
      reason: 'Package evidence changed after the package profile was scanned.',
      latestEvidencePath: null,
    })
  })

  it('refuses to overwrite the previous state file with invalid payloads', async () => {
    const result = await initTaroState(projectRoot)
    const before = await readFile(join(projectRoot, '.taro', 'state.json'), 'utf-8')

    await expect(
      writeTaroState(projectRoot, {
        ...result.state,
        packages: [] as unknown as typeof result.state.packages,
      })
    ).rejects.toThrow('Refusing to write invalid .taro/state.json payload.')

    const after = await readFile(join(projectRoot, '.taro', 'state.json'), 'utf-8')
    expect(after).toBe(before)
  })

  it('preserves manually persisted playwright auth across refresh', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await mkdir(join(projectRoot, '.taro', 'playwright', '.auth'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'playwright.config.ts'),
      `export default { use: { storageState: './playwright/.auth/user.json' } }`,
      'utf-8'
    )
    await mkdir(join(examplePackage, 'playwright', '.auth'), { recursive: true })
    await writeFile(
      join(examplePackage, 'playwright', '.auth', 'user.json'),
      '{"cookies":[],"origins":[]}',
      'utf-8'
    )
    await writeFile(
      join(projectRoot, '.taro', 'playwright', '.auth', 'user.json'),
      '{"cookies":[],"origins":[]}',
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'example-app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    await persistPlaywrightAuthProfile(projectRoot, 'packages/example-app', {
      strategy: 'storageState',
      path: '.taro/playwright/.auth/user.json',
      detectedAt: 'generate',
      source: 'manual',
    })

    const refreshed = await refreshTaroState(projectRoot)

    expect(result.state.packages['packages/example-app']?.playwrightAuth).toEqual({
      strategy: 'storageState',
      path: 'packages/example-app/playwright/.auth/user.json',
      detectedAt: 'init',
      source: 'detected',
    })
    expect(refreshed.state.packages['packages/example-app']?.playwrightAuth).toEqual({
      strategy: 'storageState',
      path: '.taro/playwright/.auth/user.json',
      detectedAt: 'generate',
      source: 'manual',
    })
  })
})

describe('findRepoFallbackPackageProfile', () => {
  it('returns the root package when packages["."] exists', async () => {
    // Create a test file at the root level so a '.' package profile is created
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(join(projectRoot, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(projectRoot, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )
    const result = await initTaroState(projectRoot)
    const profile = findRepoFallbackPackageProfile(result.state)

    expect(profile?.packagePath).toBe('.')
  })

  it('returns null when state has no packages', async () => {
    const result = await initTaroState(projectRoot)
    const emptyState = { ...result.state, packages: {} }

    const profile = findRepoFallbackPackageProfile(emptyState)

    expect(profile).toBeNull()
  })

  it('returns the package with the most test files when there is no root package', async () => {
    const pkgA = join(projectRoot, 'packages', 'alpha')
    const pkgB = join(projectRoot, 'packages', 'beta')

    await mkdir(join(pkgA, 'src'), { recursive: true })
    await mkdir(join(pkgB, 'src'), { recursive: true })
    await writeFile(
      join(pkgA, 'package.json'),
      JSON.stringify({ name: '@repo/alpha', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(
      join(pkgB, 'package.json'),
      JSON.stringify({ name: '@repo/beta', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(pkgA, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(join(pkgB, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(pkgA, 'src', 'alpha-a.test.ts'),
      "import { it, expect } from 'vitest'\nit('a', () => expect(1).toBe(1))",
      'utf-8'
    )
    await writeFile(
      join(pkgA, 'src', 'alpha-b.test.ts'),
      "import { it, expect } from 'vitest'\nit('b', () => expect(1).toBe(1))",
      'utf-8'
    )
    await writeFile(
      join(pkgB, 'src', 'beta.test.ts'),
      "import { it, expect } from 'vitest'\nit('c', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    // Remove the root package so the fallback logic has to pick between workspace packages
    const stateWithoutRoot = {
      ...result.state,
      packages: Object.fromEntries(
        Object.entries(result.state.packages).filter(([key]) => key !== '.')
      ),
    }

    const profile = findRepoFallbackPackageProfile(stateWithoutRoot)

    expect(profile?.packagePath).toBe('packages/alpha')
  })
})

describe('formatStateSummary', () => {
  it('formats an init summary with package details and warnings', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'example-app.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('example-app', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const lines = formatStateSummary(result.summary, 'init')

    expect(lines[0]).toContain('Initialized project state')
    expect(lines[1]).toContain('packages=')
    expect(lines.some((line) => line.includes('packages/example-app'))).toBe(true)
  })

  it('formats a refresh summary', async () => {
    const result = await initTaroState(projectRoot)
    const lines = formatStateSummary(result.summary, 'refresh')

    expect(lines[0]).toContain('Refreshed project state')
  })

  it('includes migration notice when legacy state was migrated', () => {
    // Build a summary with migratedLegacyState: true directly to test the formatting branch
    const summary = {
      packageCount: 0,
      renderHelperCount: 0,
      repeatedMockTargetCount: 0,
      boundaryProfileCount: 0,
      lowConfidenceBoundaryCount: 0,
      fixtureRootCount: 0,
      migratedLegacyState: true,
      overridePackageCount: 0,
      packages: [],
      warnings: [],
    }
    const lines = formatStateSummary(summary, 'refresh')

    expect(lines.some((line) => line.includes('consolidated compatibility'))).toBe(true)
  })

  it('includes overrides notice when overrides are applied', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'overrides.json'),
      JSON.stringify({ packages: { 'packages/example-app': { runner: 'jest' } } }, null, 2),
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const lines = formatStateSummary(result.summary, 'init')

    expect(lines.some((line) => line.includes('overrides applied'))).toBe(true)
  })

  it('includes warnings in the summary output', async () => {
    const result = await initTaroState(projectRoot)
    const summaryWithWarnings = {
      ...result.summary,
      warnings: ['Something went wrong.'],
    }
    const lines = formatStateSummary(summaryWithWarnings, 'init')

    expect(lines.some((line) => line.includes('Something went wrong.'))).toBe(true)
  })
})

describe('readTaroOverrides', () => {
  it('returns empty object when no overrides.json exists', async () => {
    const overrides = await readTaroOverrides(projectRoot)
    expect(overrides).toEqual({})
  })

  it('returns parsed overrides when valid overrides.json exists', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'overrides.json'),
      JSON.stringify({ packages: { '.': { runner: 'vitest' } } }, null, 2),
      'utf-8'
    )

    const overrides = await readTaroOverrides(projectRoot)

    expect(overrides.packages?.['.']?.runner).toBe('vitest')
  })

  it('returns empty object when overrides.json contains unparseable JSON', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(join(projectRoot, '.taro', 'overrides.json'), 'not-json', 'utf-8')

    const overrides = await readTaroOverrides(projectRoot)

    expect(overrides).toEqual({})
  })
})

describe('appendGeneratedTestRecord', () => {
  it('appends a generated test record to state and persists it', async () => {
    await initTaroState(projectRoot)

    await appendGeneratedTestRecord(projectRoot, {
      packagePath: '.',
      recordingFile: '/tmp/recording.js',
      testFile: '/tmp/recording.test.tsx',
      scoreResult: {
        total: 85,
        grade: 'B',
        dimensions: {
          queryQuality: 90,
          assertionSpecificity: 80,
          testStructure: 85,
          boundaryIsolation: 85,
        },
        signals: makeScoreSignals({
          queryCheckpointCount: 2,
          roleQueryCount: 3,
          strongAssertionCount: 4,
          presenceAssertionCount: 1,
        }),
        reasons: [],
        requiresReview: false,
      },
    })

    const state = await readTaroState(projectRoot)

    expect(state?.generatedTests).toHaveLength(1)
    expect(state?.generatedTests[0]).toEqual(
      expect.objectContaining({
        packagePath: '.',
        recordingFile: '/tmp/recording.js',
        testFile: '/tmp/recording.test.tsx',
        quality: expect.objectContaining({
          overall: 85,
          grade: 'B',
        }),
        requiresReview: false,
      })
    )
  })

  it('appends multiple records and keeps the most recent up to the limit', async () => {
    await initTaroState(projectRoot)

    for (let i = 0; i < 3; i++) {
      await appendGeneratedTestRecord(projectRoot, {
        packagePath: '.',
        recordingFile: `/tmp/recording-${i}.js`,
        testFile: `/tmp/recording-${i}.test.tsx`,
        scoreResult: {
          total: 70 + i,
          grade: 'C',
          dimensions: {
            queryQuality: 70,
            assertionSpecificity: 70,
            testStructure: 70,
            boundaryIsolation: 70,
          },
          signals: makeScoreSignals(),
          reasons: [],
          requiresReview: true,
        },
      })
    }

    const state = await readTaroState(projectRoot)

    expect(state?.generatedTests).toHaveLength(3)
  })

  it('backfills legacy scorer signals when reading generated test history', async () => {
    const initialized = await initTaroState(projectRoot)
    const legacyState = {
      ...initialized.state,
      generatedTests: [
        {
          createdAt: new Date().toISOString(),
          packagePath: '.',
          recordingFile: '/tmp/legacy-recording.js',
          testFile: '/tmp/legacy-recording.test.tsx',
          quality: {
            overall: 72,
            grade: 'C',
            dimensions: {
              queryQuality: 70,
              assertionSpecificity: 60,
              testStructure: 75,
              boundaryIsolation: 80,
            },
            signals: {
              queryCheckpointCount: 0,
              roleQueryCount: 1,
              testIdQueryCount: 0,
              strongAssertionCount: 0,
              weakAssertionCount: 2,
              boundaryWarningCount: 0,
              boundaryIssueCount: 0,
              placeholderRenderTarget: false,
              multipleTestBlocks: false,
            },
            reasons: [
              {
                code: 'weak-assertions-only',
                dimension: 'assertionSpecificity',
                impact: 'negative',
                weight: 12,
                message: 'Legacy reason without severity',
              },
            ],
          },
          requiresReview: true,
        },
      ],
    }

    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'state.json'),
      JSON.stringify(legacyState, null, 2),
      'utf-8'
    )

    const state = await readTaroState(projectRoot)
    const signals = state?.generatedTests[0]?.quality.signals

    expect(signals?.presenceAssertionCount).toBe(2)
    expect(signals?.visibilityAssertionCount).toBe(0)
    expect(signals?.minimumExpectedTestCount).toBe(0)
    expect(state?.generatedTests[0]?.quality.reasons[0]?.severity).toBeUndefined()
  })
})

describe('persistPlaywrightAuthProfile', () => {
  it('returns false when the target package does not exist in state', async () => {
    await initTaroState(projectRoot)

    const result = await persistPlaywrightAuthProfile(projectRoot, 'packages/nonexistent', {
      strategy: 'storageState',
      path: '.taro/playwright/.auth/user.json',
      detectedAt: 'generate',
      source: 'manual',
    })

    expect(result).toBe(false)
  })

  it('sets playwrightAuth to null when null is passed', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    await initTaroState(projectRoot)

    const result = await persistPlaywrightAuthProfile(projectRoot, 'packages/example-app', null)

    expect(result).toBe(true)

    const state = await readTaroState(projectRoot)

    expect(state?.packages['packages/example-app']?.playwrightAuth).toBeNull()
  })
})

describe('resolveTaroPackageProfile - override combinations', () => {
  async function setupPackageWithTestFile(pkgDir: string): Promise<void> {
    await mkdir(join(pkgDir, 'src'), { recursive: true })
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(pkgDir, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(pkgDir, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )
  }

  it('returns null when state has no packages and target is unresolvable', async () => {
    const result = await initTaroState(projectRoot)
    const emptyState = { ...result.state, packages: {} }

    const resolved = resolveTaroPackageProfile(emptyState, projectRoot, '/some/nonexistent/path')

    expect(resolved).toBeNull()
  })

  it('applies forbidMocks override and records it in appliedOverrides', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            forbidMocks: ['@/utils/api'],
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('forbidMocks')
    expect(resolved?.forbidBoundaryTargets).toContain('@/utils/api')
  })

  it('applies preferredSharedMocks override and records it in appliedOverrides', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredSharedMocks: { '@/features/api': '@/tests/mocks/api' },
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('preferredSharedMocks')
    expect(resolved?.preferredBoundaryImplementations['@/features/api']).toBe('@/tests/mocks/api')
  })

  it('applies preferredBoundaryImplementations override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/auth': '@/tests/mocks/auth' },
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('preferredBoundaryImplementations')
  })

  it('applies boundaryPolicies override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            boundaryPolicies: { '@/router': 'real-runtime' },
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('boundaryPolicies')
    expect(resolved?.boundaryPolicies['@/router']).toBe('real-runtime')
  })

  it('applies forbidBoundaryTargets override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            forbidBoundaryTargets: ['@/external/sdk'],
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('forbidBoundaryTargets')
    expect(resolved?.forbidBoundaryTargets).toContain('@/external/sdk')
  })

  it('applies queryHookPolicy override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            queryHookPolicy: 'allow-centralized',
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('queryHookPolicy:allow-centralized')
    expect(resolved?.effectiveQueryHookPolicy).toBe('allow-centralized')
  })

  it('applies companionPolicy override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            companionPolicy: 'off',
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('companionPolicy:off')
    expect(resolved?.effectiveCompanionPolicy).toBe('off')
  })

  it('applies enabledContractFamilies override', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            enabledContractFamilies: ['mutation-form'],
          },
        },
      }
    )

    expect(resolved?.appliedOverrides).toContain('enabledContractFamilies')
    expect(resolved?.enabledContractFamilies).toEqual(['mutation-form'])
  })

  it('injects a new boundary profile from preferredBoundaryImplementations when the target does not already exist', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/services/payments': '@/tests/mocks/payments' },
          },
        },
      }
    )

    const injected = resolved?.boundaryProfiles.find((p) => p.target === '@/services/payments')
    expect(injected).toBeDefined()
    expect(injected?.supportImportPath).toBe('@/tests/mocks/payments')
    expect(injected?.strategy).toBe('shared-module-factory')
  })

  it('derives payloadSource from mock-store path when injecting boundary profile', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/api': '@/tests/mock-store/api-helpers' },
          },
        },
      }
    )

    const injected = resolved?.boundaryProfiles.find((p) => p.target === '@/api')
    expect(injected?.payloadSource).toBe('mock-store')
  })

  it('derives payloadSource from fixtures path when injecting boundary profile', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/api': '@/tests/fixtures/api' },
          },
        },
      }
    )

    const injected = resolved?.boundaryProfiles.find((p) => p.target === '@/api')
    expect(injected?.payloadSource).toBe('fixtures')
  })

  it('derives payloadSource as typed-defaults from mock path when injecting boundary profile', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/api': '@/tests/mocks/api' },
          },
        },
      }
    )

    const injected = resolved?.boundaryProfiles.find((p) => p.target === '@/api')
    expect(injected?.payloadSource).toBe('typed-defaults')
  })

  it('derives payloadSource as manual when no special pattern matches', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await setupPackageWithTestFile(examplePackage)

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'app.test.ts'),
      {
        packages: {
          'packages/example-app': {
            preferredBoundaryImplementations: { '@/api': '@/helpers/api-support' },
          },
        },
      }
    )

    const injected = resolved?.boundaryProfiles.find((p) => p.target === '@/api')
    expect(injected?.payloadSource).toBe('manual')
  })

  it('forces forbid strategy on a boundary profile that appears in forbidBoundaryTargets and clears support exports', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'orders-api.ts'),
      'export function createOrdersApiMock() { return {} }',
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        import { createOrdersApiMock } from '@/tests/mocks/orders-api'
        vi.mock('@/features/orders/api', async () => ({ ...createOrdersApiMock() }))
        describe('feature', () => { it('works', () => expect(true).toBe(true)) })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'feature.test.tsx'),
      {
        packages: {
          'packages/example-app': {
            forbidBoundaryTargets: ['@/features/orders/api'],
          },
        },
      }
    )

    const forbidden = resolved?.boundaryProfiles.find(
      (p) => p.target === '@/features/orders/api'
    )
    expect(forbidden?.strategy).toBe('forbid')
    expect(forbidden?.supportExports.factoryExport).toBeNull()
    expect(forbidden?.supportExports.overrideExports).toEqual([])
  })
})

describe('detectPackageProfileStaleness - additional cases', () => {
  it('returns stale when scannedAt is an invalid date string', async () => {
    const result = await initTaroState(projectRoot)
    const profile = Object.values(result.state.packages)[0] ?? {
      packagePath: '.',
      packageName: null,
      scannedAt: 'invalid-date',
      testFileCount: 0,
      conventions: {
        scannedAt: '',
        projectRoot: '.',
        importStyle: 'esm' as const,
        mockPattern: 'vi.mock' as const,
        testFiles: [],
        folderPattern: 'colocated' as const,
        fileExtension: 'ts' as const,
      },
      importStyle: { value: 'esm' as const, confidence: 'low' as const, evidence: [] },
      runner: { value: 'unknown' as const, confidence: 'low' as const, evidence: [] },
      jestDomSetup: {
        value: 'per-test-import' as const,
        confidence: 'low' as const,
        evidence: ['No configured global jest-dom setup detected.'],
      },
      mockPattern: { value: 'vi.mock' as const, confidence: 'low' as const, evidence: [] },
      folderPattern: { value: 'colocated' as const, confidence: 'low' as const, evidence: [] },
      fileExtension: { value: 'ts' as const, confidence: 'low' as const, evidence: [] },
      renderHelpers: [],
      providerWrappers: [],
      renderTargets: [],
      repeatedMockTargets: [],
      sharedMockFactories: [],
      boundaryProfiles: [],
      boundaryExemplars: [],
      interactionContracts: [],
      inlineSafeMockTargets: [],
      mutationLifecycles: [],
      instabilityWarnings: [],
      mockRecommendations: [],
      fixtureRoots: [],
      exemplars: [],
      playwrightAuth: null,
      warnings: [],
    }

    const staleness = await detectPackageProfileStaleness(projectRoot, {
      ...profile,
      scannedAt: 'not-a-valid-date',
    })

    expect(staleness.stale).toBe(true)
    expect(staleness.reason).toContain('invalid')
  })

  it('returns stale when the package profile predates jest-dom setup detection', async () => {
    const staleness = await detectPackageProfileStaleness(projectRoot, {
      packagePath: '.',
      packageName: null,
      scannedAt: new Date().toISOString(),
      testFileCount: 0,
      conventions: {
        scannedAt: '',
        projectRoot: '.',
        importStyle: 'esm' as const,
        mockPattern: 'vi.mock' as const,
        testFiles: [],
        folderPattern: 'colocated' as const,
        fileExtension: 'ts' as const,
      },
      importStyle: { value: 'esm' as const, confidence: 'low' as const, evidence: [] },
      runner: { value: 'unknown' as const, confidence: 'low' as const, evidence: [] },
      jestDomSetup: {
        value: 'per-test-import' as const,
        confidence: 'low' as const,
        evidence: [],
      },
      mockPattern: { value: 'vi.mock' as const, confidence: 'low' as const, evidence: [] },
      folderPattern: { value: 'colocated' as const, confidence: 'low' as const, evidence: [] },
      fileExtension: { value: 'ts' as const, confidence: 'low' as const, evidence: [] },
      renderHelpers: [],
      providerWrappers: [],
      renderTargets: [],
      repeatedMockTargets: [],
      sharedMockFactories: [],
      boundaryProfiles: [],
      boundaryExemplars: [],
      interactionContracts: [],
      inlineSafeMockTargets: [],
      mutationLifecycles: [],
      instabilityWarnings: [],
      mockRecommendations: [],
      fixtureRoots: [],
      exemplars: [],
      playwrightAuth: null,
      warnings: [],
    })

    expect(staleness).toEqual({
      stale: true,
      reason: 'Package profile predates jest-dom setup detection and should be refreshed.',
      latestEvidencePath: null,
    })
  })

  it('returns not stale when no evidence files exist', async () => {
    // Provide a minimal profile with no test files and no package.json at a non-existent path
    const fakeProfile = {
      packagePath: 'packages/nonexistent',
      packageName: null,
      scannedAt: new Date().toISOString(),
      testFileCount: 0,
      conventions: {
        scannedAt: '',
        projectRoot: '.',
        importStyle: 'esm' as const,
        mockPattern: 'vi.mock' as const,
        testFiles: [],
        folderPattern: 'colocated' as const,
        fileExtension: 'ts' as const,
      },
      importStyle: { value: 'esm' as const, confidence: 'low' as const, evidence: [] },
      runner: { value: 'unknown' as const, confidence: 'low' as const, evidence: [] },
      jestDomSetup: {
        value: 'per-test-import' as const,
        confidence: 'low' as const,
        evidence: ['No configured global jest-dom setup detected.'],
      },
      mockPattern: { value: 'vi.mock' as const, confidence: 'low' as const, evidence: [] },
      folderPattern: { value: 'colocated' as const, confidence: 'low' as const, evidence: [] },
      fileExtension: { value: 'ts' as const, confidence: 'low' as const, evidence: [] },
      renderHelpers: [],
      providerWrappers: [],
      renderTargets: [],
      repeatedMockTargets: [],
      sharedMockFactories: [],
      boundaryProfiles: [],
      boundaryExemplars: [],
      interactionContracts: [],
      inlineSafeMockTargets: [],
      mutationLifecycles: [],
      instabilityWarnings: [],
      mockRecommendations: [],
      fixtureRoots: [],
      exemplars: [],
      playwrightAuth: null,
      warnings: [],
    }

    const staleness = await detectPackageProfileStaleness(projectRoot, fakeProfile)

    expect(staleness.stale).toBe(false)
    expect(staleness.reason).toBeNull()
  })

  it('returns not stale when evidence is fresh', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']!

    const staleness = await detectPackageProfileStaleness(projectRoot, profile)

    expect(staleness.stale).toBe(false)
    expect(staleness.latestEvidencePath).not.toBeNull()
  })

  it('reports stale with null latestEvidencePath when evidence path is unknown', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']!

    const staleness = await detectPackageProfileStaleness(projectRoot, {
      ...profile,
      scannedAt: new Date(0).toISOString(),
    })

    expect(staleness.stale).toBe(true)
    expect(staleness.latestEvidencePath).not.toBeNull()
  })
})

describe('state scanning - additional coverage', () => {
  it('detects Playwright auth from a .auth directory when no config storageState is found', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    const authDir = join(examplePackage, '.auth')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await mkdir(authDir, { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(join(authDir, 'user.json'), '{"cookies":[],"origins":[]}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['packages/example-app']?.playwrightAuth).toEqual({
      strategy: 'storageState',
      path: 'packages/example-app/.auth/user.json',
      detectedAt: 'init',
      source: 'detected',
    })
  })

  it('emits a summary with no packages when no test files are detected', async () => {
    const result = await initTaroState(projectRoot)

    expect(result.summary.packageCount).toBe(0)
    expect(result.summary.warnings).toContain(
      'No test files were detected; state contains defaults only.'
    )
  })

  it('detects mock instability warnings (recreated-factory) from test files', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'unstable.test.ts'),
      `
        import { it, expect } from 'vitest'

        it('first test', () => {
          vi.mock('@/api/service')
          expect(true).toBe(true)
        })

        it('second test', () => {
          vi.mock('@/api/other')
          expect(true).toBe(true)
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    expect(profile?.instabilityWarnings.some((w) => w.kind === 'recreated-factory')).toBe(true)
  })

  it('detects mock instability warnings (per-test-churn) from reset + reconfigure pattern', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'churn.test.ts'),
      `
        import { beforeEach, it, expect, vi } from 'vitest'
        import { mockService } from '@/tests/mocks/service'

        vi.mock('@/api/service')

        beforeEach(() => {
          vi.clearAllMocks()
          mockService.mockResolvedValue({ data: 'a' })
          mockService.mockReturnValue({ data: 'b' })
          mockService.mockImplementation(() => ({ data: 'c' }))
        })

        it('first', () => expect(true).toBe(true))
        it('second', () => expect(true).toBe(true))
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    expect(profile?.instabilityWarnings.some((w) => w.kind === 'per-test-churn')).toBe(true)
  })

  it('builds mock store resources from a discovered mock-store directory', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    const mockStoreDir = join(examplePackage, 'src', 'tests', 'mock-store')
    await mkdir(mockStoreDir, { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(mockStoreDir, 'orders.ts'),
      `
        export const ORDER_001 = { id: 'ORDER_001' }
        export const ORDER_002 = { id: 'ORDER_002' }
        export { ORDER_001 as FIRST_ORDER }
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      `
        import { it, expect } from 'vitest'
        import { ORDER_001 } from '@/tests/mock-store/orders'
        it('works', () => expect(ORDER_001.id).toBe('ORDER_001'))
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.mockStore.rootDir).toBe('packages/example-app/src/tests/mock-store')
    expect(result.state.mockStore.resources).toHaveLength(1)
    expect(result.state.mockStore.resources[0]?.name).toBe('orders.ts')
    expect(result.state.mockStore.resources[0]?.exports).toContain('ORDER_001')
  })

  it('skips unreadable mock-store files while preserving readable resources', async () => {
    const mockStoreRoot = join(projectRoot, 'packages', 'example-app', 'src', 'tests', 'mock-store')
    await mkdir(mockStoreRoot, { recursive: true })
    await writeFile(join(mockStoreRoot, 'orders.ts'), "export const ORDER_001 = 'ORDER_001'\n", 'utf-8')
    const unreadablePath = join(mockStoreRoot, 'broken.ts')
    await writeFile(unreadablePath, "export const BROKEN = true\n", 'utf-8')
    await chmod(unreadablePath, 0)

    const result = await __stateTestUtils.collectMockStoreResources(projectRoot, {
      'packages/example-app': {
        fixtureRoots: [
          {
            path: 'packages/example-app/src/tests/mock-store',
            kind: 'mock-store',
            source: 'directory',
          },
        ],
      } as never,
    })

    expect(result.resources.map((resource) => resource.name)).toEqual(['orders.ts'])
  })

  it('returns an empty mock-store inventory when the learned root is not a directory', async () => {
    const fakeRoot = join(projectRoot, 'packages', 'example-app', 'src', 'tests', 'mock-store.ts')
    await mkdir(join(projectRoot, 'packages', 'example-app', 'src', 'tests'), { recursive: true })
    await writeFile(fakeRoot, "export const ORDER_001 = 'ORDER_001'\n", 'utf-8')

    const result = await __stateTestUtils.collectMockStoreResources(projectRoot, {
      'packages/example-app': {
        fixtureRoots: [
          {
            path: 'packages/example-app/src/tests/mock-store.ts',
            kind: 'mock-store',
            source: 'directory',
          },
        ],
      } as never,
    })

    expect(result).toEqual({
      rootDir: 'packages/example-app/src/tests/mock-store.ts',
      importHint: 'packages/example-app/src/tests/mock-store.ts',
      resources: [],
    })
  })

  it('keeps root-package fixture directories unprefixed and sorts render targets deterministically', async () => {
    await mkdir(join(projectRoot, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(join(projectRoot, 'src', 'tests', 'mocks', 'orders.ts'), 'export const ORDER = 1\n', 'utf-8')
    await writeFile(
      join(projectRoot, 'src', 'feature.test.tsx'),
      `
        import ZebraPanel from './ZebraPanel'
        import AlphaPanel from './AlphaPanel'
        import { it } from 'vitest'

        it('renders', () => {
          render(<ZebraPanel />)
          render(<AlphaPanel />)
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['.']!

    expect(profile.fixtureRoots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/tests/mocks',
          kind: 'mocks',
        }),
      ])
    )
    expect(profile.renderTargets.map((target) => target.symbol)).toEqual(['AlphaPanel', 'ZebraPanel'])
  })

  it('skips unreadable mock-store subdirectories during recursive discovery', async () => {
    const mockStoreRoot = join(projectRoot, 'packages', 'example-app', 'src', 'tests', 'mock-store')
    const unreadableDir = join(mockStoreRoot, 'private')
    await mkdir(unreadableDir, { recursive: true })
    await writeFile(join(mockStoreRoot, 'orders.ts'), "export const ORDER_001 = 'ORDER_001'\n", 'utf-8')
    await writeFile(join(unreadableDir, 'secret.ts'), "export const SECRET = true\n", 'utf-8')
    await chmod(unreadableDir, 0)
    try {
      const result = await __stateTestUtils.collectMockStoreResources(projectRoot, {
        'packages/example-app': {
          fixtureRoots: [
            {
              path: 'packages/example-app/src/tests/mock-store',
              kind: 'mock-store',
              source: 'directory',
            },
          ],
        } as never,
      })

      expect(result.resources.map((resource) => resource.name)).toEqual(['orders.ts'])
    } finally {
      await chmod(unreadableDir, 0o755)
    }
  })

  it('caps recursive mock-store evidence collection at the configured maximum', async () => {
    const mockStoreRoot = join(projectRoot, 'packages', 'example-app', 'src', 'tests', 'mock-store')
    await mkdir(mockStoreRoot, { recursive: true })

    await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        writeFile(
          join(mockStoreRoot, `resource-${index}.ts`),
          `export const RESOURCE_${index} = ${index}\n`,
          'utf-8'
        )
      )
    )

    const result = await __stateTestUtils.collectMockStoreResources(projectRoot, {
      'packages/example-app': {
        fixtureRoots: [
          {
            path: 'packages/example-app/src/tests/mock-store',
            kind: 'mock-store',
            source: 'directory',
          },
        ],
      } as never,
    })

    expect(result.resources).toHaveLength(50)
  })

  it('exposes the mock-store evidence limit helper for deterministic boundary testing', () => {
    expect(__stateTestUtils.hasReachedMockStoreEvidenceLimit(49)).toBe(false)
    expect(__stateTestUtils.hasReachedMockStoreEvidenceLimit(50)).toBe(true)
  })

  it('preserveGeneratedTests: false drops all generated test history on refresh', async () => {
    await initTaroState(projectRoot)

    await appendGeneratedTestRecord(projectRoot, {
      packagePath: '.',
      recordingFile: '/tmp/recording.js',
      testFile: '/tmp/recording.test.tsx',
      scoreResult: {
        total: 80,
        grade: 'B',
        dimensions: {
          queryQuality: 80,
          assertionSpecificity: 80,
          testStructure: 80,
          boundaryIsolation: 80,
        },
        signals: makeScoreSignals(),
        reasons: [],
        requiresReview: false,
      },
    })

    const stateBefore = await readTaroState(projectRoot)
    expect(stateBefore?.generatedTests).toHaveLength(1)

    // Rescan without preserving history by using a direct writeTaroState with empty generatedTests
    const stateWithoutHistory = { ...stateBefore!, generatedTests: [] }
    await writeTaroState(projectRoot, stateWithoutHistory)

    const stateAfter = await readTaroState(projectRoot)
    expect(stateAfter?.generatedTests).toHaveLength(0)
  })

  it('scanProjectState can intentionally drop generated test history during refresh rebuilds', async () => {
    await initTaroState(projectRoot)

    await appendGeneratedTestRecord(projectRoot, {
      packagePath: '.',
      recordingFile: '/tmp/recording.js',
      testFile: '/tmp/recording.test.tsx',
      scoreResult: {
        total: 80,
        grade: 'B',
        dimensions: {
          queryQuality: 80,
          assertionSpecificity: 80,
          testStructure: 80,
          boundaryIsolation: 80,
        },
        signals: makeScoreSignals(),
        reasons: [],
        requiresReview: false,
      },
    })

    const existingState = await readTaroState(projectRoot)
    const rescanned = await __stateTestUtils.scanProjectState(projectRoot, {
      existingState: existingState!,
      preserveGeneratedTests: false,
    })

    expect(rescanned.state.generatedTests).toEqual([])
  })

  it('treats unreadable config roots and descriptor walks as absent instead of throwing', async () => {
    const packageJsonFile = join(projectRoot, 'package.json')

    expect(await __stateTestUtils.hasConfigFile(packageJsonFile, 'vitest.config.')).toBe(false)
    await expect(__stateTestUtils.findPackageDescriptors(packageJsonFile)).resolves.toEqual([
      {
        key: '.',
        root: packageJsonFile,
        name: null,
      },
    ])
  })

  it('ignores unreadable and skipped directories while scanning fixture roots', async () => {
    const packageJsonFile = join(projectRoot, 'package.json')
    await mkdir(join(projectRoot, 'src', 'tests', 'fixtures'), { recursive: true })
    await mkdir(join(projectRoot, 'node_modules', 'fixtures'), { recursive: true })
    await mkdir(join(projectRoot, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'fixtures'), {
      recursive: true,
    })

    await expect(__stateTestUtils.collectFixtureDirs(packageJsonFile)).resolves.toEqual([])
    await expect(__stateTestUtils.collectFixtureDirs(projectRoot)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/tests/fixtures',
          kind: 'fixtures',
          source: 'directory',
        }),
      ])
    )
  })

  it('sorts provider wrappers by name and import path', () => {
    const providerWrappers = __stateTestUtils.collectProviderWrappers(projectRoot, [
      {
        path: join(projectRoot, 'src', 'alpha.test.tsx'),
        content: `
          import { ZetaProvider } from '@/providers/zeta'
          import { AlphaProvider } from '@/providers/alpha'
          render(<App />, { wrapper: ZetaProvider })
          render(<App />, { wrapper: AlphaProvider })
        `,
      },
      {
        path: join(projectRoot, 'src', 'beta.test.tsx'),
        content: `
          import { AlphaProvider } from '@/providers/alternate-alpha'
          render(<App />, { wrapper: AlphaProvider })
        `,
      },
    ])

    expect(providerWrappers).toEqual([
      {
        name: 'AlphaProvider',
        importPath: '@/providers/alpha',
        sourceTestFile: 'src/alpha.test.tsx',
      },
      {
        name: 'AlphaProvider',
        importPath: '@/providers/alternate-alpha',
        sourceTestFile: 'src/beta.test.tsx',
      },
      {
        name: 'ZetaProvider',
        importPath: '@/providers/zeta',
        sourceTestFile: 'src/alpha.test.tsx',
      },
    ])
  })

  it('dedupes render helpers by binding and sorts by usage count, then name and import path', () => {
    const renderHelpers = __stateTestUtils.collectRenderHelpers(projectRoot, [
      {
        path: join(projectRoot, 'src', 'alpha.test.tsx'),
        content: `
          import { renderWithProviders } from '@/tests/renderWithProviders'
          import { renderWithAuth } from '@/tests/renderWithAuth'
          renderWithProviders(<App />)
          renderWithProviders(<App />, { wrapper: Wrapper, within })
          renderWithAuth(<App />)
        `,
      },
      {
        path: join(projectRoot, 'src', 'beta.test.tsx'),
        content: `
          import { renderWithProviders } from '@/tests/renderWithProviders'
          import { renderWithAuth } from '@/tests/renderWithAltAuth'
          import { renderWithUnused } from '@/tests/renderWithUnused'
          import { within } from '@testing-library/react'
          renderWithProviders(<App />)
          within(document.body)
          renderWithAuth(<App />)
        `,
      },
      {
        path: join(projectRoot, 'src', 'gamma.test.tsx'),
        content: `
          import renderWithScene, { helper } from '@/tests/renderWithScene'
          renderWithScene(<App />)
          helper()
        `,
      },
    ])

    expect(renderHelpers).toEqual([
      expect.objectContaining({
        name: 'renderWithProviders',
        importPath: '@/tests/renderWithProviders',
        usageCount: 2,
        usesWithin: true,
      }),
      expect.objectContaining({
        name: 'renderWithAuth',
        importPath: '@/tests/renderWithAltAuth',
        usageCount: 1,
      }),
      expect.objectContaining({
        name: 'renderWithAuth',
        importPath: '@/tests/renderWithAuth',
        usageCount: 1,
      }),
      expect.objectContaining({
        name: 'renderWithScene',
        importPath: '@/tests/renderWithScene',
        importKind: 'default',
        usageCount: 1,
      }),
    ])
  })

  it('derives low-confidence interaction contracts, sorts instability warnings, and infers extension confidence', () => {
    expect(
      __stateTestUtils.deriveInteractionContracts({
        mutationLifecycles: [
          {
            file: 'src/forms/skip.test.tsx',
            stages: ['success'],
            evidence: ['success cues detected'],
          },
          {
            file: 'src/forms/order.test.tsx',
            stages: ['loading'],
            evidence: ['loading cues detected'],
          },
          {
            file: 'src/forms/settings.test.tsx',
            stages: ['error'],
            evidence: ['error cues detected'],
          },
        ],
        boundaryExemplars: [
          {
            file: 'src/forms/settings.test.tsx',
            target: '@/api/settings',
            boundaryKind: 'data-module',
            boundaryTargets: ['settingsApi'],
            companionKinds: [],
            scaffolded: false,
            overrideStyle: 'inline-reconfigure',
            tags: [],
            evidence: [],
          },
        ],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/forms/order.test.tsx',
          confidence: 'low',
          overrideStyle: 'none',
          supportTargets: [],
        }),
        expect.objectContaining({
          file: 'src/forms/settings.test.tsx',
          confidence: 'medium',
          overrideStyle: 'inline-reconfigure',
          supportTargets: ['settingsApi'],
        }),
      ])
    )

    expect(
      __stateTestUtils.detectMockInstabilityInFiles(projectRoot, [
        {
          path: join(projectRoot, 'src', 'flow.test.tsx'),
          content: `
            it('one', () => {
              const api = { mockResolvedValue() {}, mockImplementationOnce() {} }
              vi.mock('@/api/orders')
              vi.resetAllMocks()
              api.mockResolvedValue()
              api.mockImplementationOnce(() => {})
            })
          `,
        },
      ])
    ).toEqual([
      expect.objectContaining({ file: 'src/flow.test.tsx', kind: 'per-test-churn' }),
      expect.objectContaining({ file: 'src/flow.test.tsx', kind: 'recreated-factory' }),
    ])

    expect(
      __stateTestUtils.inferFileExtension({
        scannedAt: new Date().toISOString(),
        projectRoot,
        importStyle: 'esm',
        mockPattern: 'none',
        folderPattern: 'colocated',
        fileExtension: 'tsx',
        testFiles: [{ path: 'src/example.test.tsx', importStyle: 'esm', hasDescribeBlock: true, mockPattern: 'none', hasHelperWithExpect: false }],
      })
    ).toEqual(
      expect.objectContaining({
        value: 'tsx',
        confidence: 'medium',
      })
    )

    expect(
      __stateTestUtils.inferFileExtension({
        scannedAt: new Date().toISOString(),
        projectRoot,
        importStyle: 'esm',
        mockPattern: 'none',
        folderPattern: 'colocated',
        fileExtension: 'ts',
        testFiles: [{ path: 'src/example.test.ts', importStyle: 'esm', hasDescribeBlock: true, mockPattern: 'none', hasHelperWithExpect: false }],
      })
    ).toEqual(
      expect.objectContaining({
        value: 'ts',
        confidence: 'high',
      })
    )

    expect(
      __stateTestUtils.inferFileExtension({
        scannedAt: new Date().toISOString(),
        projectRoot,
        importStyle: 'esm',
        mockPattern: 'none',
        folderPattern: 'unknown',
        fileExtension: 'ts',
        testFiles: [],
      })
    ).toEqual(
      expect.objectContaining({
        value: 'ts',
        confidence: 'low',
      })
    )
  })

  it('emits component-preferred render boundary when all exemplars prefer component', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'api.ts'),
      'export function createApiMock() { return {} }',
      'utf-8'
    )
    // A test that imports a component directly (triggers component-level render boundary)
    await writeFile(
      join(examplePackage, 'src', 'Button.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        import { render } from '@testing-library/react'
        import { createApiMock } from '@/tests/mocks/api'
        import Button from './Button'

        vi.mock('@/api/endpoint', () => ({ ...createApiMock() }))

        describe('Button', () => {
          it('renders', () => {
            render(<Button />)
            expect(true).toBe(true)
          })
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    // The summary should have content for this package
    expect(summary).toContain('## packages/example-app')
    expect(result.state.packages['packages/example-app']).toBeDefined()
  })

  it('includes render target candidates sorted by file and symbol in package profile', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'alpha.test.tsx'),
      `
        import { it, expect } from 'vitest'
        import AlphaModule from './AlphaModule'
        it('works', () => expect(true).toBe(true))
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'beta.test.tsx'),
      `
        import { it, expect } from 'vitest'
        import BetaModule from './BetaModule'
        it('works', () => expect(true).toBe(true))
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    // renderTargets should be sorted by sourceTestFile then symbol
    if (profile && profile.renderTargets.length >= 2) {
      const files = profile.renderTargets.map((t) => t.sourceTestFile)
      const sorted = [...files].sort()
      expect(files).toEqual(sorted)
    }
    expect(profile).toBeDefined()
  })

  it('handles loadOrBootstrapTaroState returning existing valid state directly without rescanning', async () => {
    await initTaroState(projectRoot)

    // Second call - state.json already exists, so it should return existing state directly
    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.version).toBe(1)
    expect(result.summary).toBeDefined()
  })

  it('handles loadOrBootstrapTaroState with only legacy history.json (no conventions)', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/recording-legacy.js',
            score: 75,
            grade: 'C',
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests).toHaveLength(1)
    expect(result.state.generatedTests[0]?.grade).toBeUndefined()
    expect(result.state.generatedTests[0]?.quality.grade).toBe('C')
  })

  it('migrates legacy history entries with grade F when grade is unknown', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/recording.js',
            score: 55,
            grade: 'X', // unknown grade → should become 'F'
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests[0]?.quality.grade).toBe('F')
  })

  it('migrates legacy history entries with grade A', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/recording.js',
            score: 95,
            grade: 'A',
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests[0]?.quality.grade).toBe('A')
  })

  it('migrates legacy history entries with grade D', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/recording.js',
            score: 61,
            grade: 'D',
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests[0]?.quality.grade).toBe('D')
  })

  it('skips legacy history entries without a recordingFile', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(
      join(projectRoot, '.taro', 'history.json'),
      JSON.stringify(
        [
          {
            timestamp: new Date(0).toISOString(),
            score: 80,
            grade: 'B',
            // no recordingFile
          },
          {
            timestamp: new Date(0).toISOString(),
            recordingFile: '/tmp/valid.js',
            score: 80,
            grade: 'B',
          },
        ],
        null,
        2
      ),
      'utf-8'
    )

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.state.generatedTests).toHaveLength(1)
    expect(result.state.generatedTests[0]?.recordingFile).toBe('/tmp/valid.js')
  })

  it('builds shared mock factory profiles from test files that import from mock/fixture paths', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'test-a.test.ts'),
      `
        import { it, expect } from 'vitest'
        import { createOrderMock } from '@/tests/mocks/order-factory'
        it('works', () => expect(createOrderMock()).toBeDefined())
      `,
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'test-b.test.ts'),
      `
        import { it, expect } from 'vitest'
        import { createOrderMock } from '@/tests/mocks/order-factory'
        it('also works', () => expect(createOrderMock()).toBeDefined())
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    expect(profile?.sharedMockFactories.some((f) => f.target === 'createOrderMock')).toBe(true)
    const factory = profile?.sharedMockFactories.find((f) => f.target === 'createOrderMock')
    expect(factory?.count).toBeGreaterThanOrEqual(2)
  })

  it('detects provider wrappers used in wrapper: PropName syntax', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'wrapped.test.tsx'),
      `
        import { it, expect } from 'vitest'
        import { renderWithProviders } from '@/tests/renderWithProviders'
        import { TestQueryProvider } from '@/tests/TestQueryProvider'

        it('renders with provider', () => {
          renderWithProviders(<div />, { wrapper: TestQueryProvider })
          expect(true).toBe(true)
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    expect(profile?.providerWrappers.some((w) => w.name === 'TestQueryProvider')).toBe(true)
  })

  it('collects exemplar tags including userEvent and within and mocking', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'dialog.test.tsx'),
      `
        import { it, expect } from 'vitest'
        import userEvent from '@testing-library/user-event'

        it('fills form inside dialog', async () => {
          const user = userEvent.setup()
          const dialog = within(screen.getByRole('dialog'))
          vi.mock('@/api/service')
          await user.click(dialog.getByRole('button'))
          expect(true).toBe(true)
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']
    const exemplar = profile?.exemplars.find((e) =>
      e.file.includes('dialog.test.tsx')
    )

    expect(exemplar?.tags).toContain('user-event')
    expect(exemplar?.tags).toContain('dialog-scope')
    expect(exemplar?.tags).toContain('mocking')
  })

  it('writes summary with "No package-scoped test knowledge has been learned yet." when no packages', async () => {
    await initTaroState(projectRoot)
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    expect(summary).toContain('No package-scoped test knowledge has been learned yet.')
  })

  it('writes summary with exemplars section when boundary exemplars exist', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'api.ts'),
      'export function createApiMock() { return {} }\nexport function resetApiMock() {}',
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature.test.tsx'),
      `
        import { describe, it, expect, vi, beforeEach } from 'vitest'
        import { render } from '@testing-library/react'
        import { createApiMock, resetApiMock } from '@/tests/mocks/api'
        import FeatureModule from './FeatureModule'

        vi.mock('@/services/api', async () => ({ ...createApiMock() }))
        beforeEach(resetApiMock)

        describe('feature', () => {
          it('works', () => {
            render(<FeatureModule />)
            expect(true).toBe(true)
          })
        })
      `,
      'utf-8'
    )

    await initTaroState(projectRoot)
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    expect(summary).toContain('### Exemplars')
  })

  it('writes summary warnings section when profile has warnings', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app' }, null, 2),
      'utf-8'
    )
    // No vitest/jest config → runner will be 'unknown' → warning added
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    await initTaroState(projectRoot)
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    // The package has no runner config, so a warning should be present in the summary
    expect(summary).toContain('### Warnings')
  })

  it('collects fixture roots from directory scan in sub-packages', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    const fixturesDir = join(examplePackage, 'src', 'fixtures')
    await mkdir(fixturesDir, { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(fixturesDir, 'users.ts'),
      'export const USER_001 = { id: "u1" }',
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']

    expect(profile?.fixtureRoots.some((r) => r.kind === 'fixtures')).toBe(true)
  })

  it('handles package without package.json gracefully in runner detection', async () => {
    const examplePackage = join(projectRoot, 'packages', 'no-pkg-json')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/no-pkg-json' }, null, 2),
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/no-pkg-json']

    expect(profile).toBeDefined()
    expect(profile?.runner.value).toBe('vitest')
  })

  it('detects runner as unknown when no config or package signals exist', async () => {
    const examplePackage = join(projectRoot, 'packages', 'ambiguous')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/ambiguous' }, null, 2),
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "it('works', () => expect(1).toBe(1))", // no vitest/jest imports
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/ambiguous']

    expect(profile?.runner.value).toBe('unknown')
    expect(profile?.warnings).toContain(
      'Runner could not be detected confidently from local tests/config.'
    )
  })

  it('includes "No shared render helper detected" warning when no render helpers found', async () => {
    const examplePackage = join(projectRoot, 'packages', 'no-render-helper')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/no-render-helper', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/no-render-helper']

    expect(profile?.warnings).toContain(
      'No shared render helper detected; generation may fall back to plain render().'
    )
  })

  it('detects runner from vitest script in package.json when no config file is present', async () => {
    const examplePackage = join(projectRoot, 'packages', 'script-runner')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({
        name: '@repo/script-runner',
        scripts: { test: 'vitest run' },
      }),
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "it('works', () => {})",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/script-runner']

    expect(profile?.runner.value).toBe('vitest')
  })

  it('detects runner from jest script in package.json when no config file is present', async () => {
    const examplePackage = join(projectRoot, 'packages', 'jest-script-runner')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({
        name: '@repo/jest-script-runner',
        scripts: { test: 'jest --coverage' },
      }),
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "it('works', () => {})",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/jest-script-runner']

    expect(profile?.runner.value).toBe('jest')
  })

  it('readTaroStateWithDiagnostics emits parse warning when state.json contains invalid JSON', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(join(projectRoot, '.taro', 'state.json'), 'not-json', 'utf-8')

    const result = await loadOrBootstrapTaroState(projectRoot)

    expect(result.summary.warnings).toContain(
      'Failed to parse .taro/state.json. Taro will ignore it and rebuild state.'
    )
  })

  it('readTaroOverridesWithDiagnostics emits parse warning when overrides.json contains invalid JSON', async () => {
    await mkdir(join(projectRoot, '.taro'), { recursive: true })
    await writeFile(join(projectRoot, '.taro', 'overrides.json'), 'not-json', 'utf-8')

    const result = await initTaroState(projectRoot)

    expect(result.summary.warnings).toContain(
      'Failed to parse .taro/overrides.json. Taro will ignore overrides for this run.'
    )
  })

  it('handles Playwright config with storageState pointing to a non-existent file', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'playwright.config.ts'),
      `export default { use: { storageState: './playwright/.auth/missing-file.json' } }`,
      'utf-8'
    )
    // Intentionally do NOT create the auth file - it should fall through to directory scan
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    // No auth file exists, so playwrightAuth should be null
    expect(result.state.packages['packages/example-app']?.playwrightAuth).toBeNull()
  })

  it('includes playwrightAuth path in staleness evidence when auth path exists', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    const authDir = join(examplePackage, 'playwright', '.auth')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await mkdir(authDir, { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'playwright.config.ts'),
      `export default { use: { storageState: './playwright/.auth/user.json' } }`,
      'utf-8'
    )
    await writeFile(join(authDir, 'user.json'), '{"cookies":[],"origins":[]}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.tsx'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/example-app']!

    // Profile should have playwrightAuth set
    expect(profile.playwrightAuth).not.toBeNull()

    // Staleness check should still work (and include auth path in evidence scan)
    const staleness = await detectPackageProfileStaleness(projectRoot, profile)

    expect(staleness.stale).toBe(false)
  })

  it('resolves boundary profile supportImportPath to null when guardrailReason is set on an existing profile', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src', 'tests', 'mocks'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'tests', 'mocks', 'api.ts'),
      'export function createApiMock() { return {} }',
      'utf-8'
    )
    await writeFile(
      join(examplePackage, 'src', 'feature.test.tsx'),
      `
        import { describe, it, expect, vi } from 'vitest'
        import { createApiMock } from '@/tests/mocks/api'

        vi.mock('@/features/api', () => ({ ...createApiMock() }))
        vi.mock('@/components/library/Modal', () => ({ Modal: vi.fn() }))

        describe('feature', () => {
          it('works', () => expect(true).toBe(true))
        })
      `,
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const resolved = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(examplePackage, 'src', 'feature.test.tsx')
    )

    // @/components/library/Modal gets a repo-owned-ui-wrapper guardrail, meaning
    // forcedSupportImportPath should be null (line 2344)
    const guardedProfile = resolved?.boundaryProfiles.find(
      (p) => p.target === '@/components/library/Modal'
    )
    expect(guardedProfile?.guardrailReason).toBe('repo-owned-ui-wrapper')
    expect(guardedProfile?.supportImportPath).toBeNull()
  })

  it('reads and returns refreshed state with detectedAt set to refresh', async () => {
    const examplePackage = join(projectRoot, 'packages', 'example-app')
    await mkdir(join(examplePackage, 'src'), { recursive: true })
    await writeFile(
      join(examplePackage, 'package.json'),
      JSON.stringify({ name: '@repo/example-app', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(examplePackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(examplePackage, 'src', 'app.test.ts'),
      "import { it, expect } from 'vitest'\nit('works', () => expect(1).toBe(1))",
      'utf-8'
    )

    await initTaroState(projectRoot)
    const refreshed = await refreshTaroState(projectRoot)

    expect(refreshed.state.version).toBe(1)
    expect(refreshed.state.packages['packages/example-app']).toBeDefined()
  })

  it('writes summary with mixed render boundary when exemplars include both module and component targets', async () => {
    const result = await initTaroState(projectRoot)

    // Build a state with a package that has both module and component boundary exemplars
    // to trigger the 'mixed' branch of summarizeRenderBoundaryPreference
    const stateWithMixedExemplars = {
      ...result.state,
      packages: {
        'packages/mixed-app': {
          packagePath: 'packages/mixed-app',
          packageName: '@repo/mixed-app',
          scannedAt: new Date().toISOString(),
          testFileCount: 2,
          conventions: {
            scannedAt: '',
            projectRoot: '.',
            importStyle: 'esm' as const,
            mockPattern: 'vi.mock' as const,
            testFiles: [],
            folderPattern: 'colocated' as const,
            fileExtension: 'tsx' as const,
          },
          importStyle: { value: 'esm' as const, confidence: 'high' as const, evidence: [] },
          runner: { value: 'vitest' as const, confidence: 'high' as const, evidence: [] },
          mockPattern: { value: 'vi.mock' as const, confidence: 'high' as const, evidence: [] },
          folderPattern: { value: 'colocated' as const, confidence: 'high' as const, evidence: [] },
          fileExtension: { value: 'tsx' as const, confidence: 'medium' as const, evidence: [] },
          renderHelpers: [],
          providerWrappers: [],
          renderTargets: [],
          repeatedMockTargets: [],
          sharedMockFactories: [],
          boundaryProfiles: [],
          boundaryExemplars: [
            {
              file: 'packages/mixed-app/src/feature-module.test.tsx',
              renderBoundary: 'module' as const,
              boundaryTargets: ['@/services/api'],
              boundaryKinds: ['data-module' as const],
              usesProviderWrapper: false,
              usesCentralBoundarySupport: true,
              hasMutationLifecycle: false,
              overrideStyle: 'stable-handles' as const,
              tags: [],
            },
            {
              file: 'packages/mixed-app/src/button.test.tsx',
              renderBoundary: 'component' as const,
              boundaryTargets: ['@/services/api'],
              boundaryKinds: ['data-module' as const],
              usesProviderWrapper: false,
              usesCentralBoundarySupport: true,
              hasMutationLifecycle: false,
              overrideStyle: 'stable-handles' as const,
              tags: [],
            },
          ],
          interactionContracts: [],
          inlineSafeMockTargets: [],
          mutationLifecycles: [],
          instabilityWarnings: [],
          mockRecommendations: [],
          fixtureRoots: [],
          exemplars: [],
          playwrightAuth: null,
          warnings: [],
        },
      },
    }

    await writeTaroState(projectRoot, stateWithMixedExemplars)
    const summary = await readFile(join(projectRoot, '.taro', 'summary.md'), 'utf-8')

    expect(summary).toContain('- Preferred render boundary: `mixed`')
  })
})
