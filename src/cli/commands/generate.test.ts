import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
      inlineSafeMockTargets: [],
      mutationLifecycles: [],
      instabilityWarnings: [],
      mockRecommendations: [],
      fixtureRoots: [],
      exemplars: [],
      warnings: [],
      effectiveRunner: 'unknown' as const,
      effectiveRenderHelper: null,
      appliedOverrides: [] as string[],
      forbidMocks: [] as string[],
      preferredSharedMocks: {},
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
        fixtureRootCount: 0,
        migratedLegacyState: false,
        overridePackageCount: 0,
        packages: [],
        warnings: [],
      },
    })),
    resolveTaroPackageProfile: vi.fn(() => taroStateControl.profile),
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
    url: 'http://localhost:3001/dashboard',
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
  const root = await mkdtemp(join(tmpdir(), `tayo-generate-${label}-`))
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

async function runGenerate(args: string[], cwdPath: string) {
  const command = createGenerateCommand()
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
  taroStateControl.stale = false
  taroStateControl.staleReason = null
  taroStateControl.profile.renderTargets = []
  taroStateControl.profile.effectiveRunner = 'unknown'
  taroStateControl.profile.effectiveRenderHelper = null
  taroStateControl.profile.appliedOverrides = []
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
    const outputPath = deriveOutputPath(fixture.recordingPath)

    taroStateControl.profile.renderTargets = [
      {
        symbol: 'SalesModule',
        importPath: './SalesModule',
        sourceTestFile: 'sample/sample-add-sale-test.tsx',
        helperNames: ['openAddSaleDialog', 'addItemToCart', 'fillOtherDetails'],
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
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(written).toContain("import SalesModule from './SalesModule'")
    expect(written).toContain('render(<SalesModule />)')
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
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/sales" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Semantic marker flow', async () => {
  expect(location.href).toBe('http://localhost:3001/sales')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Review Sale' }))
  await userEvent.click(screen.getByRole('heading', { name: 'Review Sale' }))
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
    expect(result.logs).toContain('QUAL-02 gate: PASS (markers-converted)')
    expect(countOccurrences(result.warnings, 'MKR-03 unresolved-marker')).toBe(1)
    expect(result.warnings).toMatch(
      /MKR-03 unresolved-marker marker=js-step-\d+ line: \d+ reason=[a-z-]+ detail="[^"]+" hint="[^"]+"/
    )
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(written).toContain("await user.click(screen.getByRole('button', { name: 'Save' }))")
    expect(written).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
    )
    expect(written).not.toContain(
      "await user.click(screen.getByRole('heading', { name: 'Review Sale' }))"
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
    expect(written).not.toContain("import SalesModule from './SalesModule'")
  })

  it('refreshes stale package state before generation and reports the reason', async () => {
    const fixture = await createRecordingFixture('stale-profile')
    taroStateControl.stale = true
    taroStateControl.staleReason = 'packages/dashboard/src/sales.test.tsx changed after the package profile was scanned.'

    const result = await runGenerate([fixture.recordingPath], fixture.outputDir)

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('Detected stale package profile .; refreshing before generation.')
    expect(result.warnings).toContain(
      'packages/dashboard/src/sales.test.tsx changed after the package profile was scanned.'
    )
  })

  it('fails with exit code 1 when QUAL-02 gate fails after writing output', async () => {
    const fixture = await createInlineJsFixture(
      'qual-gate-write-fail',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/sales" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Marker gate fail in write mode', async () => {
  expect(location.href).toBe('http://localhost:3001/sales')
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
    expect(result.logs).toContain('QUAL-02 gate: FAIL (zero-marker-conversion)')
    expect(result.errors).toContain('QUAL-02 FAIL:')
    expect(result.errors).toContain(
      'Exiting with code 1: QUAL-02 gate failed after generation.'
    )
    expect(result.exitCode).toBe(1)
    expect(written).toContain('it(')
  })
})
