import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectPackageProfileStaleness,
  initTaroState,
  loadOrBootstrapTaroState,
  readTaroState,
  resolveTaroPackageProfile,
  writeTaroState,
} from './state.js'

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
    const vitestPackage = join(projectRoot, 'packages', 'dashboard')
    const jestPackage = join(projectRoot, 'packages', 'legacy')

    await mkdir(join(vitestPackage, 'src'), { recursive: true })
    await mkdir(join(jestPackage, 'src'), { recursive: true })
    await writeFile(
      join(vitestPackage, 'package.json'),
      JSON.stringify({ name: '@repo/dashboard', devDependencies: { vitest: '^3.0.0' } }, null, 2),
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
      join(vitestPackage, 'src', 'dashboard.test.tsx'),
      "import { describe, expect, it } from 'vitest'\ndescribe('dashboard', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )
    await writeFile(
      join(jestPackage, 'src', 'legacy.test.tsx'),
      "describe('legacy', () => { it('works', () => { expect(true).toBe(true); jest.fn() }) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)

    expect(result.state.packages['packages/dashboard']?.runner.value).toBe('vitest')
    expect(result.state.packages['packages/legacy']?.runner.value).toBe('jest')
  })

  it('learns render helpers, repeated mocks, fixture roots, and respects overrides', async () => {
    const dashboardPackage = join(projectRoot, 'packages', 'dashboard')
    await mkdir(join(dashboardPackage, 'src', 'tests', 'mock-store'), { recursive: true })
    await writeFile(
      join(dashboardPackage, 'package.json'),
      JSON.stringify({ name: '@repo/dashboard', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(dashboardPackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    await writeFile(
      join(dashboardPackage, 'src', 'tests', 'mock-store', 'orders.ts'),
      "export const ORDER_001 = { id: 'ORDER_001' }\n",
      'utf-8'
    )
    await writeFile(
      join(dashboardPackage, 'src', 'sales.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        import { renderWithProviders } from '@/tests/renderWithProviders'
        import { ORDER_001 } from '@/tests/mock-store/orders'
        import SalesModule from './SalesModule'

        vi.mock('@/modules/orders/api')

        describe('sales', () => {
          it('renders', () => {
            renderWithProviders(<SalesModule />, { wrapper: QueryClientProvider })
            expect(ORDER_001.id).toBe('ORDER_001')
          })
        })
      `,
      'utf-8'
    )
    await writeFile(
      join(dashboardPackage, 'src', 'checkout.test.tsx'),
      `
        import { describe, expect, it, vi } from 'vitest'
        vi.mock('@/modules/orders/api')
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
            'packages/dashboard': {
              runner: 'jest',
              renderHelper: {
                name: 'renderDashboard',
                importPath: '@/tests/renderDashboard',
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
    const dashboardProfile = result.state.packages['packages/dashboard']
    const resolvedProfile = resolveTaroPackageProfile(
      result.state,
      projectRoot,
      join(dashboardPackage, 'src', 'sales.test.tsx'),
      {
        packages: {
          'packages/dashboard': {
            runner: 'jest',
            renderHelper: {
              name: 'renderDashboard',
              importPath: '@/tests/renderDashboard',
            },
          },
        },
      }
    )

    expect(dashboardProfile?.renderHelpers[0]).toEqual(
      expect.objectContaining({
        name: 'renderWithProviders',
        importPath: '@/tests/renderWithProviders',
      })
    )
    expect(dashboardProfile?.repeatedMockTargets).toEqual([
      {
        target: '@/modules/orders/api',
        files: ['packages/dashboard/src/checkout.test.tsx', 'packages/dashboard/src/sales.test.tsx'],
        count: 2,
      },
    ])
    expect(dashboardProfile?.fixtureRoots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '@/tests/mock-store',
          kind: 'mock-store',
        }),
      ])
    )
    expect(result.state.mockStore.rootDir).toBe('packages/dashboard/src/tests/mock-store')
    expect(resolvedProfile?.effectiveRunner).toBe('jest')
    expect(resolvedProfile?.effectiveRenderHelper).toEqual(
      expect.objectContaining({
        name: 'renderDashboard',
        importPath: '@/tests/renderDashboard',
      })
    )
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
    const dashboardPackage = join(projectRoot, 'packages', 'dashboard')
    await mkdir(join(dashboardPackage, 'src'), { recursive: true })
    await writeFile(
      join(dashboardPackage, 'package.json'),
      JSON.stringify({ name: '@repo/dashboard', devDependencies: { vitest: '^3.0.0' } }, null, 2),
      'utf-8'
    )
    await writeFile(join(dashboardPackage, 'vitest.config.ts'), 'export default {}', 'utf-8')
    const testFile = join(dashboardPackage, 'src', 'dashboard.test.tsx')
    await writeFile(
      testFile,
      "import { describe, expect, it } from 'vitest'\ndescribe('dashboard', () => { it('works', () => expect(true).toBe(true)) })",
      'utf-8'
    )

    const result = await initTaroState(projectRoot)
    const profile = result.state.packages['packages/dashboard']!

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 15))
    await writeFile(
      testFile,
      "import { describe, expect, it } from 'vitest'\ndescribe('dashboard', () => { it('works again', () => expect(true).toBe(true)) })",
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
})
