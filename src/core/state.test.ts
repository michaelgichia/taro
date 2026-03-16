import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectPackageProfileStaleness,
  persistPlaywrightAuthProfile,
  refreshTaroState,
  initTaroState,
  loadOrBootstrapTaroState,
  readTaroState,
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
