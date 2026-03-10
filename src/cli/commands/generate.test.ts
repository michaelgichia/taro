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

const { discoverRepoRenderTargetsMock } = vi.hoisted(() => ({
  discoverRepoRenderTargetsMock: vi.fn(async () => []),
}))

vi.mock('../../core/scanner.js', () => ({
  analyzeSingleTestFile: vi.fn(async () => ({})),
  discoverRepoRenderTargets: discoverRepoRenderTargetsMock,
  mergeConventions: vi.fn(async () => undefined),
  readConventions: vi.fn(async () => null),
  scanConventions: vi.fn(async () => ({
    scannedAt: new Date(0).toISOString(),
    projectRoot: '/tmp/project',
    importStyle: 'esm',
    mockPattern: 'none',
    testFiles: [],
    folderPattern: 'unknown',
    fileExtension: 'ts',
  })),
}))

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
const sampleJsonBasicPath = resolve(process.cwd(), 'sample/sample-json-recording-basic.json')
const sampleJsonDialogPath = resolve(process.cwd(), 'sample/sample-json-recording-dialog.json')
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
  discoverRepoRenderTargetsMock.mockReset()
  discoverRepoRenderTargetsMock.mockResolvedValue([])
  planJsSuiteMock.mockClear()
  resolveSelectorMock.mockReset()
  resolveSelectorMock.mockImplementation(defaultResolveSelector)
})

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  process.exitCode = undefined
})

describe('createGenerateCommand', () => {
  it('covers live-dom recovery, inaccessible selectors, and inspection failure in dry-run output', async () => {
    const sandbox = await createSandbox('dry-run')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    discoverRepoRenderTargetsMock.mockResolvedValue([
      {
        symbol: 'SalesModule',
        importPath: './SalesModule',
        sourceTestFile: 'sample/sample-add-sale-test.tsx',
        helperNames: ['openAddSaleDialog', 'addItemToCart', 'fillOtherDetails'],
        usesWithin: true,
      },
    ])

    const result = await runGenerate(
      [samplePath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Parsed: Recording-Add-Sale-KE-06/03/2026 at 08:25:15')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain("import SalesModule from './SalesModule'")
    expect(result.logs).toContain('render(<SalesModule />)')
    expect(result.logs).toContain('const planSubmitContinue = async')
    expect(result.logs).toContain('await planSubmitContinue(user)')
    expect(result.logs).toContain('within(screen.getByRole(')
    expect(result.logs).toContain("screen.getByRole('button', {name: '+ Add Item to Cart'})")
    expect(result.logs).toContain("screen.getByRole('combobox', { name: 'Item selector' })")
    expect(result.logs).not.toContain("screen.getByRole('heading', {name: 'Add Sale (Invoice)'})")
    expect(result.logs).not.toContain("screen.getByText('KES 4,800.00')")
    expect(result.logs).toContain('// tayo-query-checkpoint: click step requires manual RTL query recovery')
    expect(result.logs).toContain(`// selector: ${inaccessibleSelector}`)
    expect(result.logs).not.toContain(`// selector: ${inspectionFailureSelector}`)
    expect(result.logs).not.toContain('screen.getByTestId(')
    expect(result.warnings).toContain('Manual review required')
    expect(result.warnings).toContain('Top blockers:')
    expect(result.warnings).toContain(`unresolved selector ${inaccessibleSelector}`)
    expect(result.warnings).toContain(
      `Playwright inspection failed for selector ${inspectionFailureSelector}.`
    )
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
    const outputPath = join(fixture.outputDir, 'generated.test.tsx')

    const result = await runGenerate(
      [fixture.recordingPath, '--dry-run', '--output', outputPath],
      fixture.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain(`// selector: ${accessibleSelector}`)
    expect(result.logs).toContain(
      `// reason: No recorded URL is available to inspect selector ${accessibleSelector}.`
    )
    expect(result.warnings).toContain(
      `No recorded URL is available to inspect selector ${accessibleSelector}.`
    )
    expect(result.logs).not.toContain('screen.getByTestId(')
  })

  it('uses the Add Sale sample as a regression guard against fabricated CSS-to-testid fallbacks', async () => {
    const sandbox = await createSandbox('sample-regression')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    resolveSelectorMock.mockImplementation(
      (
        selector: SelectorDescriptor,
        options: {
          url?: string
          preservedQuery?: QueryDescriptor
        } = {}
      ) => {
        if (options.preservedQuery) {
          return resolvedSelector(selector, options.preservedQuery, 'baseline')
        }

        if (selector.selector === accessibleSelector) {
          return unresolvedSelector(
            selector,
            'selector-inaccessible',
            `Selector ${selector.selector} did not expose trustworthy accessible query evidence.`,
            { url: options.url }
          )
        }

        return defaultResolveSelector(selector, options)
      }
    )

    const result = await runGenerate(
      [samplePath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain(`// selector: ${accessibleSelector}`)
    expect(result.logs).toContain(
      `// reason: Selector ${accessibleSelector} did not expose trustworthy accessible query evidence.`
    )
    expect(result.warnings).toContain(
      `unresolved selector ${accessibleSelector}: Selector ${accessibleSelector} did not expose trustworthy accessible query evidence.`
    )
    expect(result.logs).not.toContain("screen.getByRole('combobox', { name: 'Item selector' })")
    expect(result.logs).not.toContain('screen.getByTestId(')
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
    const outputPath = join(fixture.outputDir, 'semantic-marker.test.tsx')

    const result = await runGenerate(
      [fixture.recordingPath, '--dry-run', '--output', outputPath],
      fixture.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Recording cleanup: 1 redundant click(s), 1 preserved semantic marker(s), 1 unresolved semantic marker(s)')
    expect(result.logs).toContain('markers: detected=2, emitted=1, unresolved=1')
    expect(result.logs).toContain('[tayo] Marker coverage:')
    expect(result.logs).toContain('detected: 2')
    expect(result.logs).toContain('emitted: 1')
    expect(result.logs).toContain('unresolved: 1')
    expect(result.logs).toContain('QUAL-02 gate: PASS (markers-converted)')
    expect(countOccurrences(result.warnings, 'MKR-03 unresolved-marker')).toBe(1)
    expect(result.warnings).toMatch(
      /MKR-03 unresolved-marker marker=js-step-\d+ line: \d+ reason=[a-z-]+ detail="[^"]+" hint="[^"]+"/
    )
    expect(result.logs).not.toContain('dblClick noise event(s)')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain("await user.click(screen.getByRole('button', { name: 'Save' }))")
    expect(result.logs).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
    )
    expect(result.logs).not.toContain("await user.click(screen.getByRole('heading', { name: 'Review Sale' }))")
    expect(result.logs).not.toContain("await user.click(screen.getByRole('heading', { name: 'Starting state' }))")
    expect(result.logs).not.toContain('dblClick')
    expect(
      countOccurrences(
        result.logs,
        "expect(await screen.findByRole('heading', { name: 'Review Sale' })).toBeVisible()"
      )
    ).toBe(1)
  })

  it('falls back to line: unknown when unresolved marker line metadata is unavailable', async () => {
    const fixture = await createInlineJsFixture(
      'semantic-marker-line-unknown',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/sales" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Semantic marker fallback line context', async () => {
  expect(location.href).toBe('http://localhost:3001/sales')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await userEvent.dblClick(screen.getByText('Customer PIN / Name'))
})`
    )
    const outputPath = join(fixture.outputDir, 'semantic-marker-line-unknown.test.tsx')

    const actualSuitePlanner = await vi.importActual<typeof import('../../core/suite-planner.js')>(
      '../../core/suite-planner.js'
    )
    planJsSuiteMock.mockImplementationOnce(
      (
        input: Parameters<typeof actualSuitePlanner.planJsSuite>[0]
      ): ReturnType<typeof actualSuitePlanner.planJsSuite> => {
        const plan = actualSuitePlanner.planJsSuite(input)
        return {
          ...plan,
          scenarios: plan.scenarios.map((scenario) => ({
            ...scenario,
            unresolvedMarkerAssertions: (scenario.unresolvedMarkerAssertions ?? []).map(
              (unresolvedMarker) => ({
                ...unresolvedMarker,
                line: undefined,
                sourceContext: {
                  ...unresolvedMarker.sourceContext,
                  line: undefined,
                },
              })
            ),
          })),
        }
      }
    )

    const result = await runGenerate(
      [fixture.recordingPath, '--dry-run', '--output', outputPath],
      fixture.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(countOccurrences(result.warnings, 'MKR-03 unresolved-marker')).toBeGreaterThan(0)
    expect(result.warnings).toMatch(/reason=[a-z-]+/)
    expect(result.warnings).toContain('line: unknown')
    expect(result.warnings).toMatch(/detail="[^"]+"/)
    expect(result.warnings).toMatch(/hint="[^"]+"/)
  })

  it('emits sample-backed marker assertions after helper calls without replaying marker gestures', async () => {
    const sandbox = await createSandbox('sample-marker-proof')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    discoverRepoRenderTargetsMock.mockResolvedValue([
      {
        symbol: 'SalesModule',
        importPath: './SalesModule',
        sourceTestFile: 'sample/sample-add-sale-test.tsx',
        helperNames: ['openAddSaleDialog', 'addItemToCart', 'fillOtherDetails'],
        usesWithin: true,
      },
    ])

    const result = await runGenerate(
      [samplePath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('await planSubmitContinue(user)')
    expect(result.logs).toContain("expect(await screen.findByText('Please enter or')).toBeVisible()")
    expect(result.logs).toContain(
      "expect(await screen.findByLabelText('Customer PIN')).toBeVisible()"
    )
    expect(result.logs).toContain(
      "expect(await screen.findByRole('heading', { name: 'Review Sale (Invoice)' })).toBeVisible()"
    )
    expect(result.logs).toContain(
      "expect(await screen.findByText('KES 4,800.00')).toBeVisible()"
    )
    expect(result.logs).not.toContain("await user.click(screen.getByText('Customer PIN'))")
    expect(result.logs).not.toContain('dblClick')
    expect(result.logs.indexOf('await planSubmitContinue(user)')).toBeLessThan(
      result.logs.indexOf("expect(await screen.findByLabelText('Customer PIN')).toBeVisible()")
    )
    expect(
      countOccurrences(
        result.logs,
        "expect(await screen.findByLabelText('Customer PIN')).toBeVisible()"
      )
    ).toBe(1)
    expect(
      countOccurrences(
        result.logs,
        "expect(await screen.findByText('KES 4,800.00')).toBeVisible()"
      )
    ).toBe(1)
    expect(result.logs).not.toContain('toHaveValue(')
  })

  it('overwrites an existing JS output file when --force is provided', async () => {
    const sandbox = await createSandbox('force')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    discoverRepoRenderTargetsMock.mockResolvedValue([
      {
        symbol: 'SalesModule',
        importPath: './SalesModule',
        sourceTestFile: 'sample/sample-add-sale-test.tsx',
        helperNames: ['openAddSaleDialog', 'addItemToCart', 'fillOtherDetails'],
        usesWithin: true,
      },
    ])

    await writeFile(outputPath, 'stale content', 'utf-8')

    const result = await runGenerate(
      [samplePath, '--output', outputPath, '--force'],
      sandbox.outputDir
    )

    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Updated: ${outputPath}`)
    expect(written).toContain("screen.getByRole('button', {name: '+ Add Item to Cart'})")
    expect(written).toContain("import SalesModule from './SalesModule'")
    expect(written).toContain('render(<SalesModule />)')
    expect(written).toContain('const planSubmitContinue = async')
    expect(written).toContain('await planSubmitContinue(user)')
    expect(written).not.toContain("screen.getByRole('heading', {name: 'Add Sale (Invoice)'})")
    expect(written).not.toContain("screen.getByText('KES 4,800.00')")
    expect(written).not.toContain(`// selector: ${inspectionFailureSelector}`)
    expect(written).not.toContain('screen.getByTestId(')
    expect(written).not.toContain('stale content')
    expect(result.warnings).toContain('Manual review required')
    expect(result.warnings).toContain('Top blockers:')
  })

  it('treats repo-aware Add Sale output as boundary-safe when render target evidence exists', async () => {
    const sandbox = await createSandbox('boundary-safe')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    discoverRepoRenderTargetsMock.mockResolvedValue([
      {
        symbol: 'SalesModule',
        importPath: './SalesModule',
        sourceTestFile: 'sample/sample-add-sale-test.tsx',
        helperNames: ['openAddSaleDialog', 'addItemToCart', 'fillOtherDetails'],
        usesWithin: true,
      },
    ])

    const result = await runGenerate(
      [samplePath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.warnings).not.toContain('Tayo could not resolve the exact render target')
    expect(result.logs).not.toContain('// tayo-boundary-warning: Prefer a repo-local module/container render boundary')
    expect(analyzeBoundaryIsolation(result.logs)).toEqual([])
  })

  it('keeps explicit boundary-draft output when repo render target evidence is missing', async () => {
    const sandbox = await createSandbox('boundary-draft')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')

    discoverRepoRenderTargetsMock.mockResolvedValue([])

    const result = await runGenerate(
      [samplePath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain(
      '// tayo-boundary-warning: Tayo could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
    expect(result.logs).toContain('render(<App />)')
    expect(result.logs).not.toContain("import SalesModule from './SalesModule'")
  })

  it('supports representative JSON recordings through the public dry-run generate flow', async () => {
    const sandbox = await createSandbox('json-dry-run')
    const outputPath = join(sandbox.outputDir, 'json-basic.test.tsx')

    const result = await runGenerate(
      [sampleJsonBasicPath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain('Parsed: JSON basic sale flow — 7 steps')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain("screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Add Sale' */ '')")
    expect(result.logs).toContain(
      "screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Customer Name' */ '')"
    )
    expect(result.logs).toContain(
      "screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Sale created' */ '')"
    )
    expect(result.logs).toContain('[tayo] Score:')
    expect(result.logs).toContain('markers: detected=0, emitted=0, unresolved=0')
    expect(result.logs).toContain('QUAL-02 gate: PASS (no-markers-detected)')
    expect(result.logs).not.toContain('tayo-query-checkpoint')
    expect(result.logs).not.toContain('tayo-boundary-warning:')
    expect(result.warnings).toContain('Manual review required')
  })

  it('writes representative dialog JSON recordings without requiring JS-only resolver features', async () => {
    const sandbox = await createSandbox('json-write')
    const outputPath = join(sandbox.outputDir, 'json-dialog.test.tsx')

    const result = await runGenerate(
      [sampleJsonDialogPath, '--output', outputPath],
      sandbox.outputDir
    )
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(written).toContain(
      "screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Open Add Sale dialog' */ '')"
    )
    expect(written).toContain(
      "screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Reference' */ '')"
    )
    expect(written).toContain(
      "screen.getByTestId(/* TODO: replace with RTL query — CSS: 'Draft saved' */ '')"
    )
    expect(written).not.toContain('tayo-query-checkpoint')
    expect(written).not.toContain('tayo-boundary-warning:')
    expect(result.warnings).toContain('Manual review required')
  })

  it('fails dry-run with exit code 1 when semantic markers are detected but none are emitted', async () => {
    const fixture = await createInlineJsFixture(
      'qual-gate-dry-run-fail',
      `/**
 * ${environmentUrlMarker}
 * ${environmentOptionsMarker} { "url": "http://localhost:3001/sales" }
 */
const {screen} = require('@testing-library/dom')
const {default: userEvent} = require('@testing-library/user-event')
require('@testing-library/jest-dom')

test('Marker gate fail in dry-run', async () => {
  expect(location.href).toBe('http://localhost:3001/sales')
  await userEvent.dblClick(screen.getByRole('heading', { name: 'Starting state' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
})`
    )
    const outputPath = join(fixture.outputDir, 'qual-gate-dry-run-fail.test.tsx')

    const result = await runGenerate(
      [fixture.recordingPath, '--dry-run', '--output', outputPath],
      fixture.outputDir
    )

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('QUAL-02 gate: FAIL (zero-marker-conversion)')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.errors).toContain('QUAL-02 FAIL:')
    expect(result.errors).toContain('Exiting with code 1: QUAL-02 gate failed after --dry-run preview.')
    expect(result.exitCode).toBe(1)
  })

  it('writes output then fails with exit code 1 when QUAL-02 gate fails in write mode', async () => {
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
    const outputPath = join(fixture.outputDir, 'qual-gate-write-fail.test.tsx')

    const result = await runGenerate([fixture.recordingPath, '--output', outputPath], fixture.outputDir)
    const written = await readFile(outputPath, 'utf-8')

    expect(result.thrown).toBeUndefined()
    expect(result.logs).toContain('[tayo] ✓ post-write verified')
    expect(result.logs).toContain(`Created: ${outputPath}`)
    expect(result.logs).toContain('QUAL-02 gate: FAIL (zero-marker-conversion)')
    expect(result.errors).toContain('QUAL-02 FAIL:')
    expect(result.errors).toContain('Exiting with code 1: QUAL-02 gate failed after write mode output.')
    expect(result.exitCode).toBe(1)
    expect(written).toContain('it(')
  })
})
