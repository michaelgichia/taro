import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGenerateCommand } from './generate.js'
import { analyzeBoundaryIsolation } from '../../core/boundary-intelligence.js'
import type {
  QueryDescriptor,
  SelectorDescriptor,
  SelectorResolutionResult,
} from '../../types/recording.js'

const { captureVisualStateMock, resolveSelectorMock } = vi.hoisted(() => ({
  captureVisualStateMock: vi.fn(async () => null),
  resolveSelectorMock: vi.fn(),
}))

vi.mock('../../core/resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/resolver.js')>()

  return {
    ...actual,
    captureVisualState: captureVisualStateMock,
    resolveSelector: resolveSelectorMock,
  }
})

vi.mock('../../core/mock-intelligence.js', () => ({
  analyzeMocks: vi.fn(async () => null),
}))

const { taroStateControl } = vi.hoisted(() => ({
  taroStateControl: {
    statePackages: {} as Record<string, unknown>,
    stale: false,
    staleReason: null as string | null,
    profile: {
      packagePath: '.',
      packageName: null,
      scannedAt: new Date(0).toISOString(),
      testFileCount: 0,
      conventions: {
        scannedAt: new Date(0).toISOString(),
        projectRoot: '/tmp/project',
        importStyle: 'esm',
        mockPattern: 'none',
        testFiles: [],
        folderPattern: 'unknown',
        fileExtension: 'ts',
      },
      importStyle: { value: 'esm', confidence: 'high', evidence: [] as string[] },
      runner: { value: 'unknown' as const, confidence: 'low', evidence: [] as string[] },
      mockPattern: { value: 'none' as const, confidence: 'low', evidence: [] as string[] },
      folderPattern: { value: 'unknown' as const, confidence: 'low', evidence: [] as string[] },
      fileExtension: { value: 'ts' as const, confidence: 'high', evidence: [] as string[] },
      renderHelpers: [],
      providerWrappers: [],
      renderTargets: [] as Array<{
        symbol: string
        importPath: string
        sourceTestFile: string
        helperNames: string[]
        usesWithin: boolean
      }>,
      repeatedMockTargets: [],
      sharedMockFactories: [],
      boundaryProfiles: [],
      boundaryExemplars: [],
      inlineSafeMockTargets: [],
      mutationLifecycles: [],
      instabilityWarnings: [],
      mockRecommendations: [],
      fixtureRoots: [],
      exemplars: [],
      playwrightAuth: null,
      warnings: [],
      effectiveRunner: 'unknown' as const,
      effectiveRenderHelper: null,
      appliedOverrides: [] as string[],
      forbidMocks: [] as string[],
      preferredSharedMocks: {},
      boundaryPolicies: {},
      preferredBoundaryImplementations: {},
      forbidBoundaryTargets: [] as string[],
      effectiveQueryHookPolicy: 'avoid' as const,
    },
  },
}))

vi.mock('../../core/state.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/state.js')>()

  return {
    ...actual,
    appendGeneratedTestRecord: vi.fn(async () => undefined),
    loadOrBootstrapTaroState: vi.fn(async () => ({
      state: {
        version: 1,
        meta: {
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          taroVersion: 'test',
        },
        packages: taroStateControl.statePackages as Record<string, never>,
        mockStore: {
          rootDir: null,
          importHint: null,
          resources: [],
        },
        generatedTests: [],
      },
      summary: {
        packageCount: 1,
        renderHelperCount: 0,
        repeatedMockTargetCount: 0,
        boundaryProfileCount: 0,
        lowConfidenceBoundaryCount: 0,
        fixtureRootCount: 0,
        migratedLegacyState: false,
        overridePackageCount: 0,
        packages: [],
        warnings: [],
      },
    })),
    detectPackageProfileStaleness: vi.fn(async () => ({
      stale: taroStateControl.stale,
      reason: taroStateControl.staleReason,
      latestEvidencePath: taroStateControl.staleReason ? 'src/example.test.tsx' : null,
    })),
    persistPlaywrightAuthProfile: vi.fn(async () => true),
    readTaroOverrides: vi.fn(async () => ({})),
    refreshTaroState: vi.fn(async () => ({
      state: {
        version: 1,
        meta: {
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          taroVersion: 'test',
        },
        packages: {},
        mockStore: {
          rootDir: null,
          importHint: null,
          resources: [],
        },
        generatedTests: [],
      },
      summary: {
        packageCount: 1,
        renderHelperCount: 0,
        repeatedMockTargetCount: 0,
        boundaryProfileCount: 0,
        lowConfidenceBoundaryCount: 0,
        fixtureRootCount: 0,
        migratedLegacyState: false,
        overridePackageCount: 0,
        packages: [],
        warnings: [],
      },
    })),
    resolveTaroPackageProfile: vi.fn(
      (
        _state: unknown,
        _projectRoot: string,
        targetPath: string
      ) => {
        const normalizedTarget = targetPath.replace(/\\/g, '/')
        const matchingPackage = Object.keys(taroStateControl.statePackages)
          .filter((packagePath) => packagePath !== '.')
          .sort((left, right) => right.length - left.length)
          .find((packagePath) => normalizedTarget.includes(`/${packagePath}/`))

        if (matchingPackage) {
          return (taroStateControl.statePackages[matchingPackage] as typeof taroStateControl.profile) ??
            taroStateControl.profile
        }

        return taroStateControl.profile
      }
    ),
  }
})

const { planJsSuiteMock } = vi.hoisted(() => ({
  planJsSuiteMock: vi.fn(),
}))

vi.mock('../../core/suite-planner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/suite-planner.js')>()
  planJsSuiteMock.mockImplementation(actual.planJsSuite)
  return {
    ...actual,
    planJsSuite: planJsSuiteMock,
  }
})

const sandboxes: string[] = []
const samplePath = resolve(process.cwd(), 'sample/sample-rest-recordingextension-output.js')
const accessibleSelector = 'div.css-19bb58m'
const inspectionFailureSelector =
  '#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'
const inaccessibleSelector =
  '#radix-_r_8s_-content-otherDetails > div:nth-of-type(1) > div:nth-of-type(1) div.css-19bb58m'
const environmentUrlMarker = '@jest-environment' + ' url'
const environmentOptionsMarker = '@jest-environment' + '-options'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function deriveOutputPath(recordingPath: string): string {
  return recordingPath.replace(/\.js$/, '.test.tsx')
}

async function createProjectInlineJsFixture(label: string, source: string) {
  const sandbox = await createSandbox(label)
  const recordingsDir = join(sandbox.outputDir, 'recordings')
  await mkdir(recordingsDir, { recursive: true })
  const recordingPath = join(recordingsDir, `${label}.js`)
  await writeFile(recordingPath, source, 'utf-8')
  return { ...sandbox, recordingPath }
}

function resolvedSelector(
  selector: SelectorDescriptor,
  query: QueryDescriptor,
  source: 'baseline' | 'live-dom' = 'live-dom'
): SelectorResolutionResult {
  return {
    status: 'resolved',
    outcome: source === 'baseline' ? 'preserved-query' : 'accessible-query',
    source,
    stepId: selector.stepId,
    selector,
    url: 'http://localhost:3001/workspace',
    query,
    warnings: [],
  }
}

function unresolvedSelector(
  selector: SelectorDescriptor,
  outcome: Extract<SelectorResolutionResult, { status: 'unresolved' }>['outcome'],
  reason: string,
  extras: {
    url?: string
    inspectionError?: string
  } = {}
): SelectorResolutionResult {
  return {
    status: 'unresolved',
    outcome,
    stepId: selector.stepId,
    selector,
    url: extras.url,
    reason,
    inspectionError: extras.inspectionError,
    warnings: [reason],
  }
}

function makeLiveDomQuery(selector: SelectorDescriptor): QueryDescriptor {
  return {
    stepId: selector.stepId,
    method: 'getByRole',
    queryRoot: 'screen',
    line: selector.line,
    target: selector.selector,
    quality: 'excellent',
    raw: "screen.getByRole('combobox', { name: 'Item selector' })",
  }
}

function defaultResolveSelector(
  selector: SelectorDescriptor,
  options: {
    url?: string
    preservedQuery?: QueryDescriptor
  } = {}
): SelectorResolutionResult {
  if (options.preservedQuery) {
    return resolvedSelector(selector, options.preservedQuery, 'baseline')
  }

  if (!options.url) {
    return unresolvedSelector(
      selector,
      'no-url',
      `No recorded URL is available to inspect selector ${selector.selector}.`
    )
  }

  if (selector.selector === accessibleSelector) {
    return resolvedSelector(selector, makeLiveDomQuery(selector))
  }

  if (selector.selector === inaccessibleSelector) {
    return unresolvedSelector(
      selector,
      'selector-inaccessible',
      `Selector ${selector.selector} did not expose trustworthy accessible query evidence.`,
      { url: options.url }
    )
  }

  if (selector.selector === inspectionFailureSelector) {
    return unresolvedSelector(
      selector,
      'inspection-failed',
      `Playwright inspection failed for selector ${selector.selector}.`,
      {
        url: options.url,
        inspectionError: 'browser blocked',
      }
    )
  }

  return unresolvedSelector(
    selector,
    'selector-not-found',
    `Selector ${selector.selector} was not found at ${options.url}.`,
    { url: options.url }
  )
}

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-generate-${label}-`))
  sandboxes.push(root)
  await mkdir(join(root, 'project'), { recursive: true })
  return { outputDir: join(root, 'project'), root }
}

async function createRecordingFixture(
  label: string,
  mutate?: (source: string) => string
) {
  const sandbox = await createSandbox(label)
  const source = await readFile(samplePath, 'utf-8')
  const recordingPath = join(sandbox.root, `${label}.js`)
  await writeFile(recordingPath, mutate ? mutate(source) : source, 'utf-8')
  return { ...sandbox, recordingPath }
}

async function createInlineJsFixture(label: string, source: string) {
  const sandbox = await createSandbox(label)
  const recordingPath = join(sandbox.root, `${label}.js`)
  await writeFile(recordingPath, source, 'utf-8')
  return { ...sandbox, recordingPath }
}

async function runGenerate(
  args: string[],
  cwdPath: string,
  context?: Parameters<typeof createGenerateCommand>[0]
) {
  const command = createGenerateCommand(context)
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const originalCwd = process.cwd()
  let thrown: unknown

  process.chdir(cwdPath)

  try {
    await command.parseAsync(args, { from: 'user' })
  } catch (error) {
    thrown = error
  } finally {
    const result = {
      logs: logSpy.mock.calls.flat().join('\n'),
      warnings: warnSpy.mock.calls.flat().join('\n'),
      errors: errorSpy.mock.calls.flat().join('\n'),
      thrown,
      exitCode: process.exitCode,
    }

    process.chdir(originalCwd)
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    return result
  }
}

beforeEach(() => {
  captureVisualStateMock.mockReset()
  captureVisualStateMock.mockResolvedValue(null)
  taroStateControl.statePackages = {}
  taroStateControl.stale = false
  taroStateControl.staleReason = null
  taroStateControl.profile.renderTargets = []
  taroStateControl.profile.folderPattern = { value: 'unknown', confidence: 'low', evidence: [] }
  taroStateControl.profile.conventions.folderPattern = 'unknown'
  taroStateControl.profile.effectiveRunner = 'unknown'
  taroStateControl.profile.effectiveRenderHelper = null
  taroStateControl.profile.appliedOverrides = []
  taroStateControl.profile.playwrightAuth = null
  taroStateControl.profile.boundaryProfiles = []
  taroStateControl.profile.boundaryExemplars = []
  taroStateControl.profile.boundaryPolicies = {}
  taroStateControl.profile.preferredBoundaryImplementations = {}
  taroStateControl.profile.forbidBoundaryTargets = []
  taroStateControl.profile.effectiveQueryHookPolicy = 'avoid'
  planJsSuiteMock.mockClear()
  resolveSelectorMock.mockReset()
  resolveSelectorMock.mockImplementation(defaultResolveSelector)
})

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  process.exitCode = undefined
})

describe('createGenerateCommand', () => {
  it('writes JS output with repo-aware recovery and explicit unresolved-selector warnings', async () => {
    const fixture = await createRecordingFixture('write-sample')
    const outputPath = join(fixture.outputDir, 'sample', 'FeatureFlow.test.tsx')

    taroStateControl.profile.renderTargets = [
      {
        symbol: 'FeatureFlow',
        importPath: './FeatureFlow',
        sourceTestFile: 'sample/feature-flow.test.tsx',
        helperNames: ['openFeatureEntry', 'completeFeatureFlow', 'reviewFeatureState'],
        usesWithin: true,
      },
    ]

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Parsed: Recording-Add-Sale-KE-06/03/2026 at 08:25:15')
    expect(result.logs).toContain('State profile: package=.')
    expect(result.logs).toContain('[taro] ✓ post-write verified')
    expect(result.logs).toContain('Updated .taro/state.json for package .')
    expect(result.logs).toContain('Created:')
    expect(result.logs).toContain('sample/FeatureFlow.test.tsx')
    expect(written).toContain("import FeatureFlow from './FeatureFlow'")
    expect(written).toContain('render(<FeatureFlow />)')
    expect(written).toContain('const planSubmitContinue = async')
    expect(written).toContain('await planSubmitContinue(user)')
    expect(written).toContain('within(screen.getByRole(')
    expect(written).toContain("screen.getByRole('button', {name: '+ Add Item to Cart'})")
    expect(written).toContain("screen.getByRole('combobox', { name: 'Item selector' })")
    expect(written).toContain('// taro-query-checkpoint: click step requires manual RTL query recovery')
    expect(written).toContain(`// selector: ${inaccessibleSelector}`)
    expect(written).not.toContain(`// selector: ${inspectionFailureSelector}`)
    expect(written).not.toContain('screen.getByTestId(')
    expect(result.warnings).toContain('Manual review required')
    expect(result.warnings).toContain('Top blockers:')
    expect(result.warnings).toContain(`unresolved selector ${inaccessibleSelector}`)
    expect(result.warnings).toContain(
      `Playwright inspection failed for selector ${inspectionFailureSelector}.`
    )
    expect(result.warnings).not.toContain('Taro could not resolve the exact render target')
    expect(analyzeBoundaryIsolation(written)).toEqual([])
  })

  it('uses recording text matches to select package context and recover a source render target', async () => {
    const fixture = await createProjectInlineJsFixture(
      'context-example',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`
    )
    const featureFlowPath = join(
      fixture.outputDir,
      'packages',
      'example-app',
      'src',
      'features',
      'FeatureFlow.tsx'
    )
    const outputPath = join(dirname(featureFlowPath), 'FeatureFlow.test.tsx')
    await mkdir(dirname(featureFlowPath), { recursive: true })
    await writeFile(
      featureFlowPath,
      `
        export default function FeatureFlow() {
          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      'utf-8'
    )

    const exampleProfile = {
      ...structuredClone(taroStateControl.profile),
      packagePath: 'packages/example-app',
      packageName: '@repo/example-app',
      renderTargets: [],
      fixtureRoots: [
        {
          path: '@/test-support/mock-store',
          kind: 'mock-store' as const,
          source: 'import' as const,
        },
      ],
      mutationLifecycles: [
        {
          file: 'packages/example-app/src/features/feature-flow.test.tsx',
          stages: ['success', 'error'],
          evidence: ['mutation stages detected'],
        },
      ],
      effectiveRunner: 'vitest' as const,
    }

    taroStateControl.statePackages = {
      '.': taroStateControl.profile,
      'packages/example-app': exampleProfile,
    }

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Context matches:')
    expect(result.logs).toContain('packages/example-app/src/features/FeatureFlow.tsx')
    expect(result.logs).toContain(
      'Context-selected package profile packages/example-app: packages/example-app/src/features/FeatureFlow.tsx matched recording text evidence.'
    )
    expect(result.logs).toContain('State profile: package=packages/example-app')
    expect(result.logs).toContain('Created:')
    expect(result.logs).toContain('packages/example-app/src/features/FeatureFlow.test.tsx')
    expect(written).toContain("import FeatureFlow from './FeatureFlow'")
    expect(written).toContain('render(<FeatureFlow />)')
  })

  it('runs Playwright page confirmation before suite planning and uses confirmed landmarks to steer context matching', async () => {
    const fixture = await createProjectInlineJsFixture(
      'preflight-page-confirmation',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByText('General Invoice details (optional)'))
  await userEvent.click(screen.getByText('Customer PIN'))
})`
    )
    const featureFlowPath = join(
      fixture.outputDir,
      'packages',
      'example-app',
      'src',
      'features',
      'FeatureFlow.tsx'
    )
    const reverseInvoicePath = join(
      fixture.outputDir,
      'src',
      'reverse-invoice',
      'ReverseInvoice.tsx'
    )
    const outputPath = join(dirname(featureFlowPath), 'FeatureFlow.test.tsx')
    await mkdir(dirname(featureFlowPath), { recursive: true })
    await mkdir(dirname(reverseInvoicePath), { recursive: true })
    await writeFile(
      featureFlowPath,
      `
        export default function FeatureFlow() {
          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      'utf-8'
    )
    await writeFile(
      reverseInvoicePath,
      `
        export default function ReverseInvoice() {
          return (
            <>
              <h1>General Invoice details (optional)</h1>
              <p>Customer PIN</p>
            </>
          )
        }
      `,
      'utf-8'
    )
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: 'http://localhost:3001/example',
      matchedLandmarks: ['Open Example Flow'],
      pageTitle: 'DigiTax',
      reason: 'landmark-confirmation',
      status: 'captured',
      url: 'http://localhost:3001/example',
      warnings: [],
    })

    const exampleProfile = {
      ...structuredClone(taroStateControl.profile),
      packagePath: 'packages/example-app',
      packageName: '@repo/example-app',
      renderTargets: [],
      effectiveRunner: 'vitest' as const,
    }

    taroStateControl.statePackages = {
      '.': taroStateControl.profile,
      'packages/example-app': exampleProfile,
    }

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const createdPath = result.logs.match(/Created: (.+\.test\.tsx)/)?.[1]

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('Page-confirmed context: Open Example Flow')
    expect(result.logs).toContain('packages/example-app/src/features/FeatureFlow.tsx')
    expect(result.logs).toContain(
      'Context-selected package profile packages/example-app: packages/example-app/src/features/FeatureFlow.tsx matched recording text evidence.'
    )
    expect(createdPath?.replace(/^\/private(?=\/var\/)/, '')).toBe(
      outputPath.replace(/^\/private(?=\/var\/)/, '')
    )
    expect(captureVisualStateMock.mock.invocationCallOrder[0]).toBeLessThan(
      planJsSuiteMock.mock.invocationCallOrder[0]
    )
    const written = await readFile(createdPath!, 'utf-8')
    expect(written).toContain("import FeatureFlow from './FeatureFlow'")
  })

  it('reuses learned central boundary support for imported collaborator modules', async () => {
    const fixture = await createProjectInlineJsFixture(
      'boundary-support-reuse',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`
    )
    const featureFlowPath = join(
      fixture.outputDir,
      'packages',
      'example-app',
      'src',
      'features',
      'FeatureFlow.tsx'
    )
    const outputPath = join(dirname(featureFlowPath), 'FeatureFlow.test.tsx')
    await mkdir(dirname(featureFlowPath), { recursive: true })
    await writeFile(
      featureFlowPath,
      `
        import { useKraCreateSaleMutation, useKraItemsQuery } from '@digitax/data-layer'

        export default function FeatureFlow() {
          useKraItemsQuery()
          useKraCreateSaleMutation()

          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      'utf-8'
    )

    const exampleProfile = {
      ...structuredClone(taroStateControl.profile),
      packagePath: 'packages/example-app',
      packageName: '@repo/example-app',
      effectiveRunner: 'vitest' as const,
      boundaryProfiles: [
        {
          target: '@digitax/data-layer',
          kind: 'data-module' as const,
          strategy: 'shared-module-factory' as const,
          supportImportPath: '@/tests/mocks/digitax-data-layer',
          supportPath: 'packages/example-app/src/tests/mocks/digitax-data-layer.ts',
          supportExports: {
            factoryExport: 'createDataLayerMock',
            resetExport: 'resetDataLayerMock',
            overrideExports: ['useKraCreateSaleMutationMock'],
            spyExports: [],
            fixtureExports: [],
          },
          payloadSource: 'fixtures' as const,
          confidence: 'high' as const,
          files: ['packages/example-app/src/features/feature-flow.test.tsx'],
          evidence: ['packages/example-app/src/features/feature-flow.test.tsx: mock target @digitax/data-layer'],
          conflictTargets: [],
          lowConfidenceScaffold: false,
        },
      ],
    }

    taroStateControl.statePackages = {
      '.': taroStateControl.profile,
      'packages/example-app': exampleProfile,
    }

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.warnings).not.toContain('Scaffolded central boundary support')
    expect(written).toContain(
      "import { createDataLayerMock, resetDataLayerMock } from '@/tests/mocks/digitax-data-layer'"
    )
    expect(written).toContain("vi.mock('@digitax/data-layer', async (importOriginal) => {")
    expect(written).toContain("return { ...actual, ...createDataLayerMock() }")
    expect(written).toContain('beforeEach(() => {')
    expect(written).toContain('resetDataLayerMock()')
    expect(written).not.toContain('createDigitaxDataLayerMock')
  })

  it('scaffolds central boundary support when no learned collaborator profile exists', async () => {
    const fixture = await createProjectInlineJsFixture(
      'boundary-support-scaffold',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Example flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.click(screen.getByRole('button', { name: 'Open Example Flow' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example Flow' }))
})`
    )
    const featureFlowPath = join(
      fixture.outputDir,
      'packages',
      'example-app',
      'src',
      'features',
      'FeatureFlow.tsx'
    )
    const outputPath = join(dirname(featureFlowPath), 'FeatureFlow.test.tsx')
    const supportPath = join(
      fixture.outputDir,
      'packages',
      'example-app',
      'src',
      'tests',
      'mocks',
      'digitax-data-layer.mock.ts'
    )
    await mkdir(dirname(featureFlowPath), { recursive: true })
    await writeFile(
      featureFlowPath,
      `
        import { useKraCreateSaleMutation, useKraItemsQuery } from '@digitax/data-layer'

        export default function FeatureFlow() {
          useKraItemsQuery()
          useKraCreateSaleMutation()

          return (
            <>
              <button>Open Example Flow</button>
              <h1>Review Example Flow</h1>
            </>
          )
        }
      `,
      'utf-8'
    )

    const exampleProfile = {
      ...structuredClone(taroStateControl.profile),
      packagePath: 'packages/example-app',
      packageName: '@repo/example-app',
      effectiveRunner: 'vitest' as const,
      fixtureRoots: [
        {
          path: 'packages/example-app/src/tests/mocks',
          kind: 'mocks' as const,
          source: 'directory' as const,
        },
      ],
    }

    taroStateControl.statePackages = {
      '.': taroStateControl.profile,
      'packages/example-app': exampleProfile,
    }

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')
    const scaffold = await readFile(supportPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.warnings).toContain('Scaffolded central boundary support for @digitax/data-layer')
    expect(result.warnings).toContain('Manual review required')
    expect(written).toContain(
      "import { createDigitaxDataLayerMock, resetDigitaxDataLayerMock } from '../tests/mocks/digitax-data-layer.mock'"
    )
    expect(written).toContain("vi.mock('@digitax/data-layer', async (importOriginal) => {")
    expect(written).toContain('return { ...actual, ...createDigitaxDataLayerMock() }')
    expect(written).not.toContain('useKraItemsQuery:')
    expect(scaffold).toContain('export const useKraCreateSaleMutationMock = vi.fn')
    expect(scaffold).toContain('export const useKraItemsQueryMock = vi.fn')
    expect(scaffold).toContain('export function createDigitaxDataLayerMock()')
    expect(scaffold).toContain('export function resetDigitaxDataLayerMock()')
  })

  it('keeps selector degradation explicit when recorder JS has no URL evidence', async () => {
    const fixture = await createRecordingFixture('no-url', (source) =>
      source
        .replace(new RegExp(`^ \\* ${environmentOptionsMarker} .*$`, 'm'), '')
        .replace(
          /^  expect\(location\.href\)\.toBe\('http:\/\/localhost:3001[^']*'\)\n/m,
          ''
        )
    )
    const outputPath = deriveOutputPath(fixture.recordingPath)

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(written).toContain(`// selector: ${accessibleSelector}`)
    expect(written).toContain(
      `// reason: No recorded URL is available to inspect selector ${accessibleSelector}.`
    )
    expect(result.warnings).toContain(
      `No recorded URL is available to inspect selector ${accessibleSelector}.`
    )
    expect(written).not.toContain('screen.getByTestId(')
  })

  it('reports preserved markers separately and keeps proof dblClick gestures out of generated user actions', async () => {
    const fixture = await createInlineJsFixture(
      'semantic-marker',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Semantic marker flow', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Example' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Example' }))
})`
    )
    const outputPath = deriveOutputPath(fixture.recordingPath)

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(
      'Recording cleanup: 1 redundant click(s), 1 preserved semantic marker(s), 1 unresolved semantic marker(s)'
    )
    expect(result.logs).toContain('markers: detected=2, emitted=1, unresolved=1')
    expect(result.logs).toContain('[taro] Marker coverage:')
    expect(result.logs).toContain('QUAL-02 gate: WARN (markers-partially-converted)')
    expect(result.warnings).toContain(
      'Manual review required — this generated test is still a draft'
    )
    expect(countOccurrences(result.warnings, 'MKR-03 unresolved-marker')).toBe(1)
    expect(result.warnings).toMatch(
      /MKR-03 unresolved-marker marker=js-step-\d+ line: \d+ reason=[a-z-]+ detail="[^"]+" hint="[^"]+"/
    )
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(written).toContain("await user.click(screen.getByRole('button', { name: 'Save' }))")
    expect(written).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Example' })).toBeVisible()"
    )
    expect(written).not.toContain(
      "await user.click(screen.getByRole('heading', { name: 'Review Example' }))"
    )
    expect(written).not.toContain(
      "await user.click(screen.getByRole('heading', { name: 'Starting state' }))"
    )
    expect(written).not.toContain('dblClick')
  })

  it('keeps explicit boundary-draft output when repo render target evidence is missing', async () => {
    const fixture = await createRecordingFixture('boundary-draft')
    const outputPath = deriveOutputPath(fixture.recordingPath)

    taroStateControl.profile.renderTargets = []

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(written).toContain(
      '// taro-boundary-warning: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
    expect(written).toContain('render(<App />)')
    expect(written).not.toContain("import FeatureFlow from './FeatureFlow'")
  })

  it('refreshes stale package state before generation and reports the reason', async () => {
    const fixture = await createRecordingFixture('stale-profile')
    taroStateControl.stale = true
    taroStateControl.staleReason =
      'packages/example-app/src/feature-flow.test.tsx changed after the package profile was scanned.'

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('Detected stale package profile .; refreshing before generation.')
    expect(result.warnings).toContain(
      'packages/example-app/src/feature-flow.test.tsx changed after the package profile was scanned.'
    )
  })

  it('skips screenshot artifacts but still runs Playwright page confirmation when --no-screenshots is provided', async () => {
    const fixture = await createRecordingFixture('skip-visuals')

    const result = await runGenerate(['--no-screenshots', fixture.recordingPath], fixture.outputDir)

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain(
      'Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran.'
    )
    expect(captureVisualStateMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        screenshotDir: undefined,
      })
    )
  })

  it('reports Playwright visual capture failures and continues generation', async () => {
    const fixture = await createRecordingFixture('mcp-visuals')
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: 'http://localhost:3001/dashboard',
      pageTitle: '',
      reason: 'dialog-state',
      selector: '#save',
      status: 'capture-failed',
      url: 'http://localhost:3001/dashboard',
      warnings: ['Playwright visual capture failed. browser executable is missing.'],
    })

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)

    expect(result.thrown).toBeUndefined()
    expect(result.warnings).toContain('Playwright visual capture failed. browser executable is missing.')
    expect(result.exitCode).toBeUndefined()
  })

  it('persists explicit storageState auth and forwards it to visual capture', async () => {
    const fixture = await createRecordingFixture('persist-visual-auth')
    const authDir = join(fixture.outputDir, 'playwright', '.auth')
    const authPath = join(authDir, 'user.json')
    await mkdir(authDir, { recursive: true })
    await writeFile(authPath, '{"cookies":[],"origins":[]}', 'utf-8')

    const result = await runGenerate(['--auth', authPath, fixture.recordingPath], fixture.outputDir)
    const stateModule = await import('../../core/state.js')

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('Persisted visual auth for package .: storageState=playwright/.auth/user.json')
    expect(vi.mocked(stateModule.persistPlaywrightAuthProfile)).toHaveBeenCalledWith(
      expect.stringMatching(/persist-visual-auth-.*\/project$/),
      '.',
      expect.objectContaining({
        detectedAt: 'generate',
        path: 'playwright/.auth/user.json',
        source: 'manual',
        strategy: 'storageState',
      })
    )
    expect(captureVisualStateMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: {
          path: expect.stringMatching(/playwright\/\.auth\/user\.json$/),
          strategy: 'storageState',
        },
      })
    )
  })

  it('fails fast in non-interactive runs when visual capture reports an auth interrupt', async () => {
    const fixture = await createRecordingFixture('auth-interrupt')
    taroStateControl.profile.playwrightAuth = {
      strategy: 'storageState',
      path: 'playwright/.auth/user.json',
      detectedAt: 'init',
      source: 'detected',
    }
    captureVisualStateMock.mockResolvedValue({
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: 'http://localhost:3001/login',
      interrupt: {
        kind: 'auth-required',
        actualTitle: 'Sign In',
        expectedTitle: 'DigiTax',
        expectedUrl: 'http://localhost:3001/dashboard',
        path: '/tmp/playwright/.auth/user.json',
        reachedUrl: 'http://localhost:3001/login',
        signals: ['auth-route', 'route-mismatch', 'expected-selector-missing'],
        strategy: 'storageState',
      },
      pageTitle: 'Sign In',
      reason: 'dialog-state',
      screenshotPath: '/tmp/taro-login.png',
      selector: '#save',
      status: 'auth-interrupted',
      url: 'http://localhost:3001/dashboard',
      warnings: ['Authentication required before visual capture could reach http://localhost:3001/dashboard.'],
    })

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('Visual auth: storageState=playwright/.auth/user.json (detected)')
    expect(result.logs).toContain('Auth checkpoint screenshot: /tmp/taro-login.png')
    expect(result.warnings).toContain(
      'Visual context unavailable: authentication required before reaching the target UI.'
    )
    expect(result.warnings).toContain('Reuse or replace the saved storage state with --auth /tmp/playwright/.auth/user.json.')
    expect(result.errors).toBe('')
    expect(result.exitCode).toBeUndefined()
  })

  it('persists recovered MCP auth in interactive runs and continues generation', async () => {
    const fixture = await createRecordingFixture('auth-recovered')
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        persistedAuthPath: '.taro/playwright/.auth/user.json',
        startedAt: new Date().toISOString(),
        status: 'succeeded',
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: 'http://localhost:3001/dashboard',
      interrupt: {
        kind: 'auth-required',
        actualTitle: 'Sign In',
        expectedTitle: 'DigiTax',
        expectedUrl: 'http://localhost:3001/dashboard',
        reachedUrl: 'http://localhost:3001/login',
        signals: ['auth-route', 'route-mismatch'],
        strategy: 'instructions',
      },
      pageTitle: 'DigiTax',
      reason: 'dialog-state',
      screenshotPath: '/tmp/taro-dashboard.png',
      selector: '#save',
      status: 'auth-recovered',
      url: 'http://localhost:3001/dashboard',
      warnings: [],
    })

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      {
        input: { isTTY: true },
        output: { isTTY: true },
      }
    )
    const stateModule = await import('../../core/state.js')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Visual auth recovered via Playwright runtime.')
    expect(result.logs).toContain('Saved Playwright storageState: .taro/playwright/.auth/user.json')
    expect(result.logs).toContain(
      'Persisted visual auth for package .: storageState=.taro/playwright/.auth/user.json'
    )
    expect(vi.mocked(stateModule.persistPlaywrightAuthProfile)).toHaveBeenCalledWith(
      expect.any(String),
      '.',
      expect.objectContaining({
        strategy: 'storageState',
        path: '.taro/playwright/.auth/user.json',
        detectedAt: 'generate',
        source: 'manual',
      })
    )
  })

  it('prints auth instructions when MCP recovery times out and stops generation', async () => {
    const fixture = await createRecordingFixture('auth-timeout')
    captureVisualStateMock.mockResolvedValue({
      authRecovery: {
        completedAt: new Date().toISOString(),
        instructionsPath: 'instructions/auth.md',
        persistedAuthPath: '.taro/playwright/.auth/user.json',
        startedAt: new Date().toISOString(),
        status: 'timed-out',
        timeoutMs: 300000,
      },
      capturedAt: new Date().toISOString(),
      dialog: null,
      element: null,
      finalUrl: 'http://localhost:3001/login',
      interrupt: {
        kind: 'auth-required',
        actualTitle: 'Sign In',
        expectedTitle: 'DigiTax',
        expectedUrl: 'http://localhost:3001/dashboard',
        reachedUrl: 'http://localhost:3001/login',
        signals: ['auth-route', 'route-mismatch'],
        strategy: 'instructions',
      },
      pageTitle: 'Sign In',
      reason: 'dialog-state',
      screenshotPath: '/tmp/taro-login-timeout.png',
      selector: '#save',
      status: 'auth-recovery-timed-out',
      url: 'http://localhost:3001/dashboard',
      warnings: ['Timed out waiting 300s for manual authentication.'],
    })

    const result = await runGenerate(
      [fixture.recordingPath],
      fixture.outputDir,
      {
        input: { isTTY: true },
        output: { isTTY: true },
      }
    )

    expect(result.thrown).toBeUndefined()
    expect(result.warnings).toContain('Playwright authentication timed out.')
    expect(result.warnings).toContain('Visual auth instructions: instructions/auth.md')
    expect(result.warnings).toContain('Timed out waiting 300s for manual authentication.')
    expect(result.errors).toBe('')
    expect(result.exitCode).toBeUndefined()
  })

  it('keeps zero marker conversion warning-only after writing output', async () => {
    const fixture = await createInlineJsFixture(
      'qual-gate-write-fail',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/example" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Marker gate fail in write mode', async () => {
  expect(location.href).toBe('http://localhost:3001/example')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
})`
    )
    const outputPath = deriveOutputPath(fixture.recordingPath)

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('[taro] ✓ post-write verified')
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(result.logs).toContain('QUAL-02 gate: WARN (zero-marker-conversion)')
    expect(result.warnings).toContain(
      'QUAL-02 WARN: Semantic markers were detected, but no marker-derived assertions were emitted.'
    )
    expect(result.warnings).toContain(
      'Manual review required — this generated test is still a draft'
    )
    expect(result.exitCode).toBeUndefined()
    expect(written).toContain('it(')
  })
})
