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

vi.mock('../../core/resolver.js', () => ({
  captureVisualState: captureVisualStateMock,
  resolveSelector: resolveSelectorMock,
}))

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

const sandboxes: string[] = []
const samplePath = resolve(process.cwd(), 'sample/sample-rest-recordingextension-output.js')
const accessibleSelector = 'div.css-19bb58m'
const inspectionFailureSelector =
  '#radix-_r_8s_-content-items > div:nth-of-type(1) > div:nth-of-type(2) span'
const inaccessibleSelector =
  '#radix-_r_8s_-content-otherDetails > div:nth-of-type(1) > div:nth-of-type(1) div.css-19bb58m'
const environmentOptionsMarker = '@jest-environment' + '-options'

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
    expect(result.logs).toContain("screen.getByRole('button', {name: 'Add Sale (Invoice)'})")
    expect(result.logs).toContain("screen.getByRole('combobox', { name: 'Item selector' })")
    expect(result.logs).toContain('// taro-query-checkpoint: click step requires manual RTL query recovery')
    expect(result.logs).toContain(`// selector: ${inaccessibleSelector}`)
    expect(result.logs).toContain(`// selector: ${inspectionFailureSelector}`)
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
    expect(written).toContain("screen.getByRole('button', {name: 'Add Sale (Invoice)'})")
    expect(written).toContain("import SalesModule from './SalesModule'")
    expect(written).toContain('render(<SalesModule />)')
    expect(written).toContain('const planSubmitContinue = async')
    expect(written).toContain('await planSubmitContinue(user)')
    expect(written).toContain(`// selector: ${inspectionFailureSelector}`)
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
    expect(result.warnings).not.toContain('Taro could not resolve the exact render target')
    expect(result.logs).not.toContain('// taro-boundary-warning: Prefer a repo-local module/container render boundary')
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
      '// taro-boundary-warning: Taro could not resolve the exact render target from repo context; generated output should be treated as a boundary draft.'
    )
    expect(result.logs).toContain('render(<App />)')
    expect(result.logs).not.toContain("import SalesModule from './SalesModule'")
  })
})
