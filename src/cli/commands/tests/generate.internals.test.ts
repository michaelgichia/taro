import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { generateCommandInternals } from '#cli/commands/generate.ts'
import { deriveOutputPath } from '#cli/commands/generate.utils.ts'
import type { Finding } from '#core/findings-reporter.ts'
import type {
  ItGroup,
  QueryDescriptor,
  QueryResult,
  SelectorResolutionResult,
} from '#types/recording.ts'

const {
  analyzeMocksMock,
  appendGeneratedTestRecordMock,
  captureVisualStateMock,
  createPageInspectorMock,
  discoverBoundaryImportsFromSourceMock,
  openCapturePageMock,
  persistPlaywrightAuthProfileMock,
  refreshTaroStateMock,
  replayStepMock,
  resolveSelectorMock,
  resolveTaroPackageProfileMock,
  verifySyntaxMock,
  findVisualCaptureCandidatesMock,
} = vi.hoisted(() => ({
  analyzeMocksMock: vi.fn(),
  appendGeneratedTestRecordMock: vi.fn(),
  captureVisualStateMock: vi.fn(),
  createPageInspectorMock: vi.fn(() => ({ inspect: vi.fn() })),
  discoverBoundaryImportsFromSourceMock: vi.fn(),
  findVisualCaptureCandidatesMock: vi.fn(),
  openCapturePageMock: vi.fn(),
  persistPlaywrightAuthProfileMock: vi.fn(),
  refreshTaroStateMock: vi.fn(),
  replayStepMock: vi.fn(),
  resolveSelectorMock: vi.fn(),
  resolveTaroPackageProfileMock: vi.fn(),
  verifySyntaxMock: vi.fn(),
}))

vi.mock('#core/boundary-learning.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/boundary-learning.ts')>()
  return {
    ...actual,
    discoverBoundaryImportsFromSource: discoverBoundaryImportsFromSourceMock,
  }
})

vi.mock('#core/mock-intelligence.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/mock-intelligence.ts')>()
  return {
    ...actual,
    analyzeMocks: analyzeMocksMock,
  }
})

vi.mock('#core/recording-intelligence.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/recording-intelligence.ts')>()
  return {
    ...actual,
    findVisualCaptureCandidates: findVisualCaptureCandidatesMock,
  }
})

vi.mock('#core/resolver.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/resolver.ts')>()
  return {
    ...actual,
    captureVisualState: captureVisualStateMock,
    createPageInspector: createPageInspectorMock,
    openCapturePage: openCapturePageMock,
    replayStep: replayStepMock,
    resolveSelector: resolveSelectorMock,
  }
})

vi.mock('#core/state.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/state.ts')>()
  return {
    ...actual,
    appendGeneratedTestRecord: appendGeneratedTestRecordMock,
    persistPlaywrightAuthProfile: persistPlaywrightAuthProfileMock,
    refreshTaroState: refreshTaroStateMock,
    resolveTaroPackageProfile: resolveTaroPackageProfileMock,
  }
})

vi.mock('#core/verifier.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#core/verifier.ts')>()
  return {
    ...actual,
    verifySyntax: verifySyntaxMock,
  }
})

const tempDirs: string[] = []

class ProcessExitSignal {
  constructor(readonly code: number) {}
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    action: 'click',
    id: 'js-step-1',
    metadata: {},
    originalType: 'click',
    source: 'js',
    target: 'Open Example Flow',
    ...overrides,
  } as any
}

function makeRecording(overrides: Record<string, unknown> = {}) {
  const steps = (overrides.steps as any[]) ?? [makeStep()]
  return {
    baseline: {
      itGroups: [{ name: 'Example flow', steps }],
      queries: [],
      selectors: [],
    },
    rawStepCount: steps.length,
    steps,
    title: 'Example flow',
    ...overrides,
  } as any
}

function makeSuitePlan(overrides: Record<string, unknown> = {}) {
  return {
    contracts: [],
    helpers: [],
    itGroups: [{ name: 'Example flow', steps: [makeStep()] }],
    renderBoundary: {
      confidence: 'low',
      kind: 'component',
      resolvedTarget: null,
    },
    scenarios: [],
    warnings: [],
    ...overrides,
  } as any
}

function makeScoreResult(overrides: Record<string, unknown> = {}) {
  return {
    blockers: [],
    dimensions: {
      assertionSpecificity: 80,
      boundaryIsolation: 80,
      queryQuality: 80,
      testStructure: 80,
    },
    grade: 'B',
    markerQualityGate: {
      failing: false,
      message: 'markers look good',
      reason: 'ok',
    },
    requiresReview: false,
    total: 80,
    ...overrides,
  } as any
}

async function createTempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `taro-generate-internals-${label}-`))
  tempDirs.push(dir)
  return dir
}

function resolvedSelector(
  stepId: string,
  selector: string,
  query: QueryDescriptor,
  source: 'baseline' | 'live-dom' = 'live-dom'
): SelectorResolutionResult {
  return {
    outcome: source === 'baseline' ? 'preserved-query' : 'accessible-query',
    query,
    selector: { line: query.line, selector, stepId },
    source,
    status: 'resolved',
    stepId,
    url: 'http://localhost:3001/example',
    warnings: [],
  }
}

function unresolvedSelector(
  stepId: string,
  selector: string,
  reason: string,
  warnings: string[] = [reason]
): SelectorResolutionResult {
  return {
    outcome: 'selector-not-found',
    reason,
    selector: { line: 10, selector, stepId },
    status: 'unresolved',
    stepId,
    url: 'http://localhost:3001/example',
    warnings,
  }
}

beforeEach(() => {
  analyzeMocksMock.mockReset()
  analyzeMocksMock.mockResolvedValue(null)
  appendGeneratedTestRecordMock.mockReset()
  appendGeneratedTestRecordMock.mockResolvedValue(undefined)
  captureVisualStateMock.mockReset()
  captureVisualStateMock.mockResolvedValue({
    status: 'captured',
    url: 'http://localhost:3001/example',
  })
  createPageInspectorMock.mockClear()
  discoverBoundaryImportsFromSourceMock.mockReset()
  discoverBoundaryImportsFromSourceMock.mockResolvedValue([])
  findVisualCaptureCandidatesMock.mockReset()
  findVisualCaptureCandidatesMock.mockReturnValue([])
  openCapturePageMock.mockReset()
  openCapturePageMock.mockResolvedValue({
    browser: { close: vi.fn(async () => undefined) },
    page: {},
  })
  persistPlaywrightAuthProfileMock.mockReset()
  persistPlaywrightAuthProfileMock.mockResolvedValue(true)
  refreshTaroStateMock.mockReset()
  refreshTaroStateMock.mockResolvedValue(undefined)
  replayStepMock.mockReset()
  replayStepMock.mockResolvedValue({ replayed: true })
  resolveSelectorMock.mockReset()
  resolveSelectorMock.mockImplementation((selector, options = {}) => {
    if (options.preservedQuery) {
      return resolvedSelector(selector.stepId, selector.selector, options.preservedQuery, 'baseline')
    }

    return unresolvedSelector(
      selector.stepId,
      selector.selector,
      `Selector ${selector.selector} was not found.`
    )
  })
  resolveTaroPackageProfileMock.mockReset()
  verifySyntaxMock.mockReset()
  verifySyntaxMock.mockReturnValue({ valid: true })
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
  process.exitCode = undefined
  vi.restoreAllMocks()
})

describe('generateCommandInternals', () => {
  it('resolves imported files, rebases render helpers, and flushes findings', async () => {
    const projectRoot = await createTempDir('paths')
    const renderHelperDir = join(projectRoot, 'src', 'tests')
    const componentsDir = join(projectRoot, 'src', 'components')
    const outputPath = join(projectRoot, 'src', 'features', 'FeatureFlow.test.tsx')
    await mkdir(renderHelperDir, { recursive: true })
    await mkdir(componentsDir, { recursive: true })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(
      join(componentsDir, 'FeatureFlow.tsx'),
      'export default function FeatureFlow() {}',
      'utf-8'
    )

    expect(
      await generateCommandInternals.resolveImportedFilePath({
        importPath: '@/components/FeatureFlow',
        projectRoot,
        sourceFile: 'src/tests/render.test.tsx',
      })
    ).toBeNull()

    expect(
      await generateCommandInternals.resolveImportedFilePath({
        importPath: '../components/FeatureFlow',
        projectRoot,
        sourceFile: 'src/tests/render.test.tsx',
      })
    ).toBe(join(componentsDir, 'FeatureFlow.tsx'))

    expect(
      await generateCommandInternals.resolveImportedFilePath({
        importPath: '../components/MissingFlow',
        projectRoot,
        sourceFile: 'src/tests/render.test.tsx',
      })
    ).toBe(join(projectRoot, 'src', 'components', 'MissingFlow'))

    expect(
      generateCommandInternals.rebaseRenderHelperImportPath({
        outputPath,
        projectRoot,
        renderHelper: {
          importPath: './render-utils',
          name: 'renderFeatureFlow',
          sourceTestFile: 'src/tests/render.test.tsx',
        } as any,
      })
    ).toEqual(
      expect.objectContaining({
        importPath: '../tests/render-utils',
      })
    )
    expect(
      generateCommandInternals.rebaseRenderHelperImportPath({
        outputPath,
        projectRoot,
        renderHelper: {
          importPath: '@/tests/render-utils',
          name: 'renderFeatureFlow',
          sourceTestFile: 'src/tests/render.test.tsx',
        } as any,
      })
    ).toEqual(
      expect.objectContaining({
        importPath: '@/tests/render-utils',
      })
    )

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0)
    })
    const findings: Finding[] = [
      {
        category: 'boundary',
        message: 'manual review still required',
        severity: 'BLOCKING',
      },
    ]

    expect(() => generateCommandInternals.flushFindings(findings)).toThrow(ProcessExitSignal)
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('=== taro:findings:start ===\n[BLOCKING] boundary')
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('collects coverage tokens and compares output assessments', () => {
    expect(generateCommandInternals.collectComparableTokens(null)).toEqual([])
    expect(
      generateCommandInternals.collectComparableTokens(
        `screen.getByRole('button', { name: 'Review Example' })`
      )
    ).toContain('review example')

    expect(
      generateCommandInternals.collectStepCoverageTokens(makeStep({ action: 'navigate' }))
    ).toEqual({
      measurable: false,
      primary: [],
      secondary: [],
    })

    const fillCoverage = generateCommandInternals.collectStepCoverageTokens(
      makeStep({
        action: 'fill',
        target: 'Customer Reference',
        value: 'ABC-123',
      })
    )
    expect(fillCoverage.measurable).toBe(true)
    expect(fillCoverage.primary).toContain('customer reference')
    expect(fillCoverage.secondary.length).toBeGreaterThan(0)

    expect(
      generateCommandInternals.mapParsedQueriesToResults({
        queries: [{ line: 12, method: 'getByRole' }],
      } as any)
    ).toEqual([
      {
        line: 12,
        method: 'getByRole',
        quality: 'fragile',
        query: 'getByRole',
      },
    ])

    expect(
      generateCommandInternals.mapParsedQueriesToResults(
        { queries: [] } as any,
        `
describe('example', () => {
  it('renders', () => {
    expect(screen.getByText('Saved')).toBeVisible()
  })
})
`
      )
    ).toEqual([
      {
        method: 'getByText',
        quality: 'fragile',
        query: 'getByText(',
      },
    ])

    expect(
      generateCommandInternals.compareOutputAssessments(
        {
          flowCoverage: { coveredStepIds: [], coveredSteps: 2, totalSteps: 2, uncoveredStepIds: [] },
          scoreResult: makeScoreResult({ blockers: ['a'], total: 70 }),
        },
        {
          flowCoverage: { coveredStepIds: [], coveredSteps: 2, totalSteps: 2, uncoveredStepIds: [] },
          scoreResult: makeScoreResult({ blockers: ['a', 'b'], total: 70 }),
        }
      )
    ).toBeGreaterThan(0)

    expect(
      generateCommandInternals.compareOutputAssessments(
        {
          flowCoverage: { coveredStepIds: [], coveredSteps: 5, totalSteps: 5, uncoveredStepIds: [] },
          scoreResult: makeScoreResult({ total: 75 }),
        },
        {
          flowCoverage: { coveredStepIds: [], coveredSteps: 2, totalSteps: 2, uncoveredStepIds: [] },
          scoreResult: makeScoreResult({ total: 85 }),
        }
      )
    ).toBeGreaterThan(0)
  })

  it('reconciles existing output by keeping the higher-scored suite and merging distinct tests', async () => {
    const resolution = await generateCommandInternals.reconcileExistingOutput({
      analyzedRecording: makeRecording(),
      candidateAssessment: {
        flowCoverage: { coveredStepIds: ['0'], coveredSteps: 1, totalSteps: 1, uncoveredStepIds: [] },
        scoreResult: makeScoreResult({ total: 70, grade: 'C', requiresReview: true }),
      },
      candidateCode: `
import { screen } from '@testing-library/react'

describe('Example flow', () => {
  it('adds a new review assertion', async () => {
    expect(screen.getByText('Review Example')).toBeVisible()
  })
})
`,
      existingAssessment: {
        flowCoverage: { coveredStepIds: ['0'], coveredSteps: 1, totalSteps: 1, uncoveredStepIds: [] },
        scoreResult: makeScoreResult({ total: 90, grade: 'A' }),
      },
      existingCode: `
import { render } from '@testing-library/react'

describe('Example flow', () => {
  it('covers the main example flow', async () => {
    render(<FeatureFlow />)
  })
})
`,
    })

    expect(resolution.preferredSource).toBe('existing')
    expect(resolution.shouldWrite).toBe(true)
    expect(resolution.mergeApplied).toBe(true)
    expect(resolution.mergedTestCount).toBe(1)
    expect(resolution.outputCode).toContain("it('covers the main example flow'")
    expect(resolution.outputCode).toContain("it('adds a new review assertion'")
  })

  it('prefers the fresh candidate when assessments tie but the code differs', async () => {
    const candidateCode = `
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

describe('Example flow', () => {
  it('covers the main example flow', async () => {
    render(<FeatureFlow />)
  })
})
`
    const existingCode = `
import { render } from '@testing-library/react'

describe('Example flow', () => {
  it('covers the main example flow', async () => {
    render(<FeatureFlow />)
  })
})
`

    const resolution = await generateCommandInternals.reconcileExistingOutput({
      analyzedRecording: makeRecording(),
      candidateAssessment: {
        flowCoverage: { coveredStepIds: ['0'], coveredSteps: 1, totalSteps: 1, uncoveredStepIds: [] },
        scoreResult: makeScoreResult({ total: 90, grade: 'A' }),
      },
      candidateCode,
      existingAssessment: {
        flowCoverage: { coveredStepIds: ['0'], coveredSteps: 1, totalSteps: 1, uncoveredStepIds: [] },
        scoreResult: makeScoreResult({ total: 90, grade: 'A' }),
      },
      existingCode,
    })

    expect(resolution.preferredSource).toBe('candidate')
    expect(resolution.shouldWrite).toBe(true)
    expect(resolution.mergeApplied).toBe(false)
    expect(resolution.outputCode).toContain("import { describe, expect, it } from 'vitest'")
  })

  it('does not merge stale existing tests back into the preferred candidate', async () => {
    const resolution = await generateCommandInternals.reconcileExistingOutput({
      analyzedRecording: makeRecording(),
      candidateAssessment: {
        flowCoverage: { coveredStepIds: ['0', '1'], coveredSteps: 2, totalSteps: 2, uncoveredStepIds: [] },
        scoreResult: makeScoreResult({ total: 80, grade: 'B' }),
      },
      candidateCode: `
import { describe, expect, it } from 'vitest'

describe('Example flow', () => {
  it('covers the full example flow', async () => {
    expect(screen.getByText('Review Example')).toBeVisible()
  })
})
`,
      existingAssessment: {
        flowCoverage: { coveredStepIds: ['0'], coveredSteps: 1, totalSteps: 2, uncoveredStepIds: ['1'] },
        scoreResult: makeScoreResult({ total: 90, grade: 'A' }),
      },
      existingCode: `
describe('Example flow', () => {
  it('is stale', async () => {
    render(<App />)
  })
})
`,
    })

    expect(resolution.preferredSource).toBe('candidate')
    expect(resolution.shouldWrite).toBe(true)
    expect(resolution.mergeApplied).toBe(false)
    expect(resolution.outputCode).toContain("it('covers the full example flow'")
    expect(resolution.outputCode).not.toContain("it('is stale'")
  })

  it('finds repo context matches and resolves package/render-target context', async () => {
    const projectRoot = await createTempDir('context')
    const srcDir = join(projectRoot, 'packages', 'example-app', 'src')
    await mkdir(srcDir, { recursive: true })
    await writeFile(
      join(srcDir, 'FeatureFlow.tsx'),
      '<button>Review Example Flow</button>',
      'utf-8'
    )
    await writeFile(
      join(srcDir, 'FeatureFlow.test.tsx'),
      "expect(screen.getByText('Review Example Flow')).toBeVisible()",
      'utf-8'
    )
    const unreadablePath = join(srcDir, 'Unreadable.tsx')
    await writeFile(unreadablePath, 'Review Example Flow', 'utf-8')
    await chmod(unreadablePath, 0o000)
    await writeFile(join(projectRoot, 'not-a-dir.txt'), 'Review Example Flow', 'utf-8')
    await writeFile(
      join(srcDir, 'Huge.tsx'),
      `export const huge = '${'Review Example Flow '.repeat(40_000)}'`,
      'utf-8'
    )

    expect(
      generateCommandInternals.collectVisualElementContextTerm({
        element: {
          ariaLabel: 'save',
          innerText: 'div.css-123',
          labelText: 'open',
        },
      } as any)
    ).toBeNull()
    expect(
      generateCommandInternals.collectVisualElementContextTerm({
        element: {
          ariaLabel: 'Review Example Flow',
        },
      } as any)
    ).toBe('Review Example Flow')
    expect(
      await generateCommandInternals.findRepoContextMatches({
        excludePaths: [],
        projectRoot,
        terms: [],
      })
    ).toEqual([])

    expect(
      await generateCommandInternals.findRepoContextMatches({
        excludePaths: [],
        projectRoot: join(projectRoot, 'not-a-dir.txt'),
        terms: ['Review Example Flow'],
      })
    ).toEqual([])

    const matches = await generateCommandInternals.findRepoContextMatches({
      excludePaths: [],
      projectRoot,
      terms: ['Review Example Flow'],
    })
    expect(matches.map((match) => match.filePath)).toContain(
      'packages/example-app/src/FeatureFlow.tsx'
    )
    expect(matches.map((match) => match.kind)).toContain('test')
    expect(matches.map((match) => match.filePath)).not.toContain('packages/example-app/src/Huge.tsx')
    expect(matches.map((match) => match.filePath)).not.toContain(
      'packages/example-app/src/Unreadable.tsx'
    )
    await chmod(unreadablePath, 0o644)

    const currentProfile = { packagePath: '.', renderTargets: [] }
    const resolvedProfile = { packagePath: 'packages/example-app', renderTargets: [] }
    resolveTaroPackageProfileMock.mockReturnValue(resolvedProfile)

    expect(
      generateCommandInternals.resolvePackageProfileFromContextMatches({
        currentProfile,
        matches: [
          {
            filePath: 'packages/example-app/src/FeatureFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 3,
          },
          {
            filePath: 'packages/example-app/src/FeatureFlow.test.tsx',
            kind: 'test',
            matchedTerms: ['Review Example Flow'],
            score: 4,
          },
          {
            filePath: 'packages/example-admin/src/AdminFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 1,
          },
        ],
        overrides: {},
        projectRoot,
        state: {
          packages: {
            '.': {},
            'packages/example-admin': {},
            'packages/example-app': {},
          },
        },
      })
    ).toEqual({
      profile: resolvedProfile,
      reason: 'packages/example-app/src/FeatureFlow.tsx matched recording text evidence',
    })

    expect(
      generateCommandInternals.resolvePackageProfileFromContextMatches({
        currentProfile: resolvedProfile,
        matches: [
          {
            filePath: 'packages/example-app/src/FeatureFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 2,
          },
        ],
        overrides: {},
        projectRoot,
        state: { packages: { '.': {}, 'packages/example-app': {} } },
      })
    ).toEqual({
      profile: resolvedProfile,
      reason: null,
    })

    resolveTaroPackageProfileMock.mockReturnValue(null)
    expect(
      generateCommandInternals.resolvePackageProfileFromContextMatches({
        currentProfile,
        matches: [
          {
            filePath: 'packages/example-app/src/FeatureFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 2,
          },
        ],
        overrides: {},
        projectRoot,
        state: { packages: { '.': {}, 'packages/example-app': {} } },
      })
    ).toEqual({
      profile: currentProfile,
      reason: null,
    })

    expect(
      generateCommandInternals.deriveContextRenderTargets({
        matches: [
          ...matches,
          {
            filePath: 'packages/example-app/src/featureFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 5,
          },
          {
            filePath: 'packages/example-app/src/FeatureFlow.tsx',
            kind: 'source',
            matchedTerms: ['Review Example Flow'],
            score: 5,
          },
        ],
        outputPath: join(projectRoot, 'generated', 'FeatureFlow.test.tsx'),
        projectRoot,
      })
    ).toEqual([
      expect.objectContaining({
        importPath: '../packages/example-app/src/FeatureFlow',
        symbol: 'FeatureFlow',
      }),
    ])
  })

  it('reports marker diagnostics, cleanup, score hints, and helper fallbacks', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const suitePlan = makeSuitePlan({
      scenarios: [
        {
          helperRefs: [],
          markerAssertions: [
            {
              diagnostics: {
                canonicalRecovery: {
                  fromText: 'Review',
                  sourceFile: 'src/FeatureFlow.tsx',
                  toText: 'Review Example',
                },
                placementCorrection: {
                  fromScenarioName: 'draft',
                  toScenarioName: 'review',
                },
              },
              markerStepId: 'js-step-2',
            },
            {
              diagnostics: {
                canonicalRecovery: {
                  fromText: 'Review',
                  sourceFile: 'src/FeatureFlow.tsx',
                  toText: 'Review Example',
                },
              },
              markerStepId: 'js-step-2',
            },
          ],
          steps: [],
          unresolvedMarkerAssertions: [
            {
              markerStepId: 'js-step-3',
              query: { raw: "screen.getByText('Missing review')" },
              reason: 'boundary-placement-conflict',
              sourceContext: { line: 21 },
            },
            {
              markerStepId: 'js-step-3',
              reason: 'boundary-placement-conflict',
              sourceContext: { line: 21 },
            },
          ],
        },
      ],
    })

    expect(generateCommandInternals.buildMarkerReviewDiagnostics(null)).toEqual({
      canonicalRecoveries: 0,
      placementConflicts: 0,
      placementCorrections: 0,
    })
    generateCommandInternals.emitRecoveredMarkerDiagnostics(null)
    generateCommandInternals.emitMarkerPlacementCorrections(null)
    generateCommandInternals.emitUnresolvedMarkerWarnings(null)
    expect(stderrSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(generateCommandInternals.buildMarkerReviewDiagnostics(suitePlan)).toEqual({
      canonicalRecoveries: 2,
      placementConflicts: 1,
      placementCorrections: 1,
    })

    generateCommandInternals.emitRecoveredMarkerDiagnostics(suitePlan)
    generateCommandInternals.emitMarkerPlacementCorrections(suitePlan)
    generateCommandInternals.emitUnresolvedMarkerWarnings(suitePlan)
    expect(stderrSpy.mock.calls.join('\n')).toContain('MKR-01 canonical-copy marker=js-step-2')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('MKR-02 placement-correction marker=js-step-2')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('MKR-03 unresolved-marker marker=js-step-3')

    warnSpy.mockClear()
    generateCommandInternals.emitLowConfidenceBanner(makeScoreResult())
    expect(warnSpy).not.toHaveBeenCalled()
    generateCommandInternals.emitLowConfidenceBanner(
      makeScoreResult({
        blockers: ['query quality is weak'],
        grade: 'D',
        requiresReview: true,
        total: 54,
      })
    )
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('Manual review required')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('Top blockers')

    warnSpy.mockClear()
    stderrSpy.mockClear()
    generateCommandInternals.emitScoreHints(
      makeScoreResult({
        dimensions: {
          assertionSpecificity: 50,
          boundaryIsolation: 50,
          queryQuality: 50,
          testStructure: 50,
        },
      }),
      [{ line: 10, method: 'getByTestId', quality: 'fragile', query: 'row-id' }],
      [{ message: 'mocked a provider', suggestion: 'keep providers real' }] as any
    )
    expect(stderrSpy.mock.calls.join('\n')).toContain('getByTestId queries')
    expect(stderrSpy.mock.calls.join('\n')).toContain('Add specific matchers')
    expect(stderrSpy.mock.calls.join('\n')).toContain('Split into multiple it() blocks')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('Boundary: mocked a provider')

    stderrSpy.mockClear()
    generateCommandInternals.summarizeCleanup({
      diagnostics: {
        intentGroupCount: 1,
        removedCursorWander: 0,
        removedDoubleClickNoise: 0,
        removedRedundantClicks: 0,
        preservedSemanticMarkers: 0,
        unresolvedSemanticMarkers: 0,
      },
    } as any)
    expect(stderrSpy).not.toHaveBeenCalled()
    generateCommandInternals.summarizeCleanup({
      diagnostics: {
        intentGroupCount: 2,
        removedCursorWander: 1,
        removedDoubleClickNoise: 1,
        removedRedundantClicks: 1,
        preservedSemanticMarkers: 1,
        unresolvedSemanticMarkers: 1,
      },
    } as any)
    expect(stderrSpy.mock.calls.join('\n')).toContain('Recording cleanup: 1 redundant click(s)')

    expect(
      generateCommandInternals.buildMarkerCoverageSummary({
        analyzedRecording: {
          diagnostics: { preservedSemanticMarkers: 1, unresolvedSemanticMarkers: 2 },
        },
        suitePlan: null,
      } as any)
    ).toEqual({
      detected: 3,
      emitted: 0,
      unresolved: 2,
    })

    const recording = makeRecording({
      steps: [
        makeStep({ id: undefined }),
        makeStep({ id: 'js-step-2', target: 'Review Example' }),
        makeStep({ id: 'js-step-3', target: 'Save Draft' }),
      ],
    })
    const merged = generateCommandInternals.mergeAnalyzedStepState(recording, {
      steps: [
        makeStep({
          id: 'js-step-2',
          metadata: { query: { method: 'getByText' } },
          semanticMarkerCandidate: { proofText: 'Review Example' },
        }),
      ],
    } as any)
    expect(merged.steps[0]?.id).toBeUndefined()
    expect((merged.steps[1] as any).semanticMarkerCandidate).toEqual({
      proofText: 'Review Example',
    })
    expect(
      generateCommandInternals.toItGroups(
        { intentGroups: [{ name: 'learned group', steps: [makeStep({ id: 'js-step-9' })] }], steps: [] } as any,
        'fallback'
      )
    ).toEqual([{ name: 'learned group', steps: [expect.objectContaining({ id: 'js-step-9' })] }])
    expect(generateCommandInternals.toItGroups({ intentGroups: [], steps: recording.steps } as any, '')).toEqual([
      {
        name: 'recorded flow',
        steps: recording.steps,
      },
    ])
    expect(generateCommandInternals.isQueryDescriptor(null)).toBe(false)
    expect(generateCommandInternals.isQueryDescriptor({ method: 'getByRole' })).toBe(true)
    expect(
      generateCommandInternals.mergeSelectorResolutionWarnings(
        unresolvedSelector('js-step-1', '#save', 'missing', ['first']),
        ['first', 'second']
      )
    ).toEqual(
      expect.objectContaining({
        warnings: ['first', 'second'],
      })
    )

    expect(
      generateCommandInternals.stripSemanticMarkerStepsFromScenarios(
        [
          {
            helperRefs: ['planSupport'],
            markerAssertions: [],
            steps: [makeStep({ semanticMarkerLink: { markerStepId: 'js-step-2' } })],
          },
          {
            helperRefs: [],
            markerAssertions: [{ markerStepId: 'js-step-3' }],
            steps: [makeStep({ unresolvedSemanticMarker: { markerStepId: 'js-step-3' } })],
          },
        ] as any,
        [{ name: 'planSupport', steps: [] }] as any
      )
    ).toHaveLength(2)

    expect(
      generateCommandInternals.dedupeQueryResults([
        { line: 10, method: 'getByRole', query: 'Save', quality: 'good' },
        { line: 10, method: 'getByRole', query: 'Save', quality: 'good' },
      ] as QueryResult[])
    ).toHaveLength(1)

    expect(
      generateCommandInternals.collectExpectedLandmarks(
        makeRecording({
          baseline: {
            itGroups: [],
            queries: [
              { name: 'Review Example Flow', target: '#save' },
              { name: 'http://localhost:3001/example', target: 'Open Example Flow' },
            ],
          },
          steps: [
            makeStep({ action: 'hover', target: 'ignored hover' }),
            makeStep({ action: 'click', target: 'Open Example Flow' }),
            makeStep({ action: 'fill', target: 'Customer Reference', value: 'ABC-123' }),
            makeStep({ action: 'assert', target: 'document.title', value: 'Workspace' }),
          ],
        })
      )
    ).toEqual([
      'Review Example Flow',
      'Open Example Flow',
      'Customer Reference',
      'ABC-123',
      'Workspace',
    ])

    expect(generateCommandInternals.toProjectRelativePath('/repo', '/repo/src/FeatureFlow.tsx')).toBe(
      'src/FeatureFlow.tsx'
    )
    expect(
      generateCommandInternals.toProjectRelativePath('/repo', '/tmp/playwright/.auth/user.json')
    ).toBe('playwright/.auth/user.json')
    expect(generateCommandInternals.toProjectRelativePath('/repo', '/repo')).toBe('.')
  })

  it('summarizes mock analysis, audits boundary policy, and scores render targets', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const projectRoot = await createTempDir('boundary')
    const renderTargetFile = join(projectRoot, 'src', 'FeatureFlow.tsx')
    await mkdir(dirname(renderTargetFile), { recursive: true })
    await writeFile(renderTargetFile, `import { Dialog } from '@/ui/Modal'`, 'utf-8')

    generateCommandInternals.summarizeMockAnalysis(null)
    generateCommandInternals.summarizeMockAnalysis({
      boundaryProfiles: [],
      forbidBoundaryTargets: [],
      forbidMocks: [],
      interactionContracts: [],
      instabilityWarnings: [],
      mutationLifecycles: [],
      packagePath: '.',
      preferredSharedMocks: {},
      recommendations: [],
      repeatedTargets: [],
      source: 'generated',
    } as any)
    expect(stderrSpy).not.toHaveBeenCalled()

    generateCommandInternals.summarizeMockAnalysis({
      boundaryProfiles: [{ target: '@/orders/api' }],
      forbidBoundaryTargets: ['@/dangerous/provider'],
      forbidMocks: ['@/legacy/api'],
      interactionContracts: [
        {
          file: 'src/FeatureFlow.test.tsx',
          kind: 'mutation-form',
          states: ['failed-completion'],
        },
      ],
      instabilityWarnings: [{ file: 'src/FeatureFlow.test.tsx', reason: 'flaky timing' }],
      mutationLifecycles: [
        {
          file: 'src/FeatureFlow.test.tsx',
          stages: ['idle', 'success'],
        },
      ],
      packagePath: 'packages/example-app',
      preferredSharedMocks: { '@/orders/api': '@/tests/mocks/orders-api' },
      recommendations: [{ count: 2, kind: 'shared-mock', target: '@/orders/api' }],
      repeatedTargets: ['@/orders/api'],
      source: 'package-profile',
    } as any)
    expect(stderrSpy.mock.calls.join('\n')).toContain('Mock analysis: package=packages/example-app')
    expect(stderrSpy.mock.calls.join('\n')).toContain('Shared mock preference')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('forbidden targets @/legacy/api')
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('Mock stability: flaky timing')

    discoverBoundaryImportsFromSourceMock.mockResolvedValue([
      {
        guardrailReason: 'repo-owned-ui-wrapper',
        target: '@/ui/Modal',
      },
    ])
    const warnings = await generateCommandInternals.auditBoundaryPolicy(
      [
        `vi.mock('@/legacy/api')`,
        `vi.mock('@/ui/Modal')`,
        `vi.mock('@/orders/api')`,
        'render(<FeatureFlow />)',
      ].join('\n'),
      {
        boundaryProfiles: [
          {
            strategy: 'shared-module-factory',
            supportImportPath: '@/tests/mocks/orders-api',
            target: '@/orders/api',
          },
          {
            strategy: 'provider-wrapper',
            target: '@/providers/AppProviders',
          },
        ],
        effectiveRenderHelper: null,
        forbidBoundaryTargets: [],
        forbidMocks: ['@/legacy/api'],
      } as any,
      renderTargetFile
    )
    expect(warnings).toContain('Generated test mocks forbidden boundary target "@/legacy/api".')
    expect(warnings.join('\n')).toContain('Generated test mocks protected UI boundary "@/ui/Modal".')
    expect(warnings).toContain('Generated test bypasses learned central boundary support for "@/orders/api".')
    expect(warnings).toContain(
      'Generated test may bypass a learned provider-wrapper boundary because no shared render helper was applied.'
    )

    const candidate = {
      evidenceTerms: ['Review Example Flow'],
      helperNames: ['renderFeatureFlow'],
      importPath: './FeatureFlowModule',
      sourceTestFile: 'packages/example-app/src/FeatureFlowModule.tsx',
      symbol: 'FeatureFlowModule',
      usesWithin: true,
    }
    expect(
      generateCommandInternals.scoreRenderTargetCandidate(
        candidate as any,
        makeRecording({
          steps: [makeStep({ target: 'Review Example Flow' })],
          title: 'Review Example Flow',
        }),
        { repeatedTargets: ['@/orders/api'] } as any,
        makeSuitePlan({ renderBoundary: { kind: 'module' } }),
        {
          packageProfile: { packagePath: 'packages/example-app' } as any,
          visualState: { matchedLandmarks: ['Review Example Flow'] } as any,
        }
      )
    ).toBeGreaterThan(0)

    const plan = makeSuitePlan({
      warnings: [
        'Taro could not resolve the exact render target from repo context',
        'Prefer a repo-local module/container render boundary',
        'Keep this warning',
      ],
    })
    expect(generateCommandInternals.applyRepoRenderTarget(plan, null)).toBe(plan)
    expect(
      generateCommandInternals.applyRepoRenderTarget(plan, {
        importPath: './FeatureFlowModule',
        sourceTestFile: 'src/FeatureFlowModule.tsx',
        symbol: 'FeatureFlowModule',
      } as any)
    ).toEqual(
      expect.objectContaining({
        renderBoundary: expect.objectContaining({
          confidence: 'medium',
          resolvedTarget: 'FeatureFlowModule',
        }),
        warnings: ['Keep this warning'],
      })
    )
  })

  it('captures visuals, analyzes mocks defensively, finalizes output, and resolves JS generation edges', async () => {
    expect(
      await generateCommandInternals.maybeCaptureVisualState({
        analyzedRecording: { steps: [] },
        projectRoot: '/repo',
        recording: makeRecording(),
      } as any)
    ).toBeNull()

    findVisualCaptureCandidatesMock.mockReturnValue([{ reason: 'dialog-state', selector: '#save' }])
    await generateCommandInternals.maybeCaptureVisualState({
      analyzedRecording: { steps: [] },
      auth: { path: '.auth/user.json', strategy: 'storageState' },
      projectRoot: '/repo',
      recording: makeRecording(),
      url: 'http://localhost:3001/example',
    } as any)
    expect(captureVisualStateMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/example',
      expect.objectContaining({
        reason: 'dialog-state',
        selector: '#save',
      })
    )

    findVisualCaptureCandidatesMock.mockReturnValue([])
    await generateCommandInternals.maybeCaptureVisualState({
      analyzedRecording: { steps: [] },
      projectRoot: '/repo',
      recording: makeRecording(),
      selector: '#root',
      skipScreenshotArtifacts: true,
      url: 'http://localhost:3001/example',
    } as any)
    expect(captureVisualStateMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/example',
      expect.objectContaining({
        reason: 'ambiguous-ui',
        screenshotDir: undefined,
      })
    )

    await generateCommandInternals.maybeCaptureVisualState({
      analyzedRecording: { steps: [] },
      projectRoot: '/repo',
      recording: makeRecording(),
      url: 'http://localhost:3001/example',
    } as any)
    expect(captureVisualStateMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/example',
      expect.objectContaining({
        reason: 'page-context',
      })
    )

    analyzeMocksMock.mockResolvedValueOnce({ source: 'package-profile' })
    expect(await generateCommandInternals.maybeAnalyzeMocks('/repo', null)).toEqual({
      source: 'package-profile',
    })
    analyzeMocksMock.mockRejectedValueOnce(new Error('analysis failed'))
    expect(await generateCommandInternals.maybeAnalyzeMocks('/repo', null)).toBeNull()

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new ProcessExitSignal(code ?? 0)
    })
    verifySyntaxMock.mockReturnValueOnce({ error: 'Unexpected token', valid: false })
    await expect(
      generateCommandInternals.finalizeGeneratedOutput({
        code: 'const broken =',
        outputPath: '/repo/src/FeatureFlow.test.tsx',
        packageProfile: null,
        projectRoot: '/repo',
        recordingFile: '/repo/recording.js',
        scoreResult: makeScoreResult(),
      } as any)
    ).rejects.toThrow(ProcessExitSignal)
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('Post-write verification failed')
    expect(exitSpy).toHaveBeenCalledWith(2)

    verifySyntaxMock.mockReturnValue({ valid: true })
    refreshTaroStateMock.mockRejectedValueOnce(new Error('refresh failed'))
    await expect(
      generateCommandInternals.finalizeGeneratedOutput({
        code: 'const ok = true',
        outputPath: '/repo/src/FeatureFlow.test.tsx',
        packageProfile: { packagePath: 'packages/example-app' },
        projectRoot: '/repo',
        recordingFile: '/repo/recording.js',
        scoreResult: makeScoreResult(),
      } as any)
    ).resolves.toBeUndefined()

    const itGroups: ItGroup[] = [{ name: 'Example flow', steps: [makeStep()] }]
    expect(await generateCommandInternals.resolveJsGeneration(makeRecording({ baseline: null }), itGroups)).toEqual({
      itGroups,
      queryResults: [],
      recording: makeRecording({ baseline: null }),
      warnings: [],
    })

    openCapturePageMock.mockResolvedValueOnce({
      browser: { close: vi.fn(async () => undefined) },
      page: {},
    })
    resolveSelectorMock.mockResolvedValueOnce(undefined as never)
    const replayRecording = makeRecording({
      baseline: {
        itGroups,
        queries: [],
        selectors: [{ line: 10, selector: '#save', stepId: 'js-step-1' }],
      },
      steps: [
        makeStep({
          id: 'js-step-1',
          metadata: {
            query: {
              line: 10,
              method: 'getByRole',
              name: 'Save',
              queryRoot: 'screen',
              raw: "screen.getByRole('button', { name: 'Save' })",
              role: 'button',
              stepId: 'js-step-1',
            },
          },
        }),
      ],
      url: 'http://localhost:3001/example',
    })
    await generateCommandInternals.resolveJsGeneration(replayRecording, itGroups)

    const fallbackQuery: QueryDescriptor = {
      line: 12,
      method: 'getByRole',
      name: 'Review Example',
      queryRoot: 'screen',
      raw: "screen.getByRole('heading', { name: 'Review Example' })",
      role: 'heading',
      stepId: 'js-step-2',
      target: 'Review Example',
    }
    const fallbackRecording = makeRecording({
      baseline: {
        itGroups,
        queries: [],
        selectors: [
          { line: 10, selector: '#missing-step', stepId: 'js-step-missing' },
          { line: 11, selector: '#preserved', stepId: 'js-step-2' },
          { line: 12, selector: '#first-attempt', stepId: 'js-step-3' },
          { line: 13, selector: '#second-attempt', stepId: 'js-step-3' },
          { line: 14, selector: '#no-choice', stepId: 'js-step-4' },
        ],
      },
      steps: [
        makeStep({
          id: 'js-step-2',
          metadata: { query: fallbackQuery },
          target: 'Review Example',
        }),
        makeStep({ id: 'js-step-3', target: 'Customer Reference' }),
        makeStep({ id: 'js-step-4', target: 'Submit' }),
      ],
    })
    resolveSelectorMock.mockImplementationOnce((selector, options = {}) =>
      resolvedSelector(selector.stepId, selector.selector, options.preservedQuery, 'baseline')
    )
    resolveSelectorMock.mockImplementationOnce(() =>
      unresolvedSelector('js-step-3', '#first-attempt', 'first failure', ['first failure'])
    )
    resolveSelectorMock.mockImplementationOnce(() =>
      resolvedSelector('js-step-3', '#second-attempt', {
        line: 13,
        method: 'getByRole',
        name: 'Customer Reference',
        queryRoot: 'screen',
        raw: "screen.getByRole('textbox', { name: 'Customer Reference' })",
        role: 'textbox',
        stepId: 'js-step-3',
        target: 'Customer Reference',
      })
    )
    const fallbackResult = await generateCommandInternals.resolveJsGeneration(
      fallbackRecording,
      itGroups
    )
    expect(fallbackResult.recording.steps[0]?.metadata?.query).toEqual(fallbackQuery)
    expect(fallbackResult.queryResults).toContainEqual(
      expect.objectContaining({
        method: 'getByRole',
        query: "screen.getByRole('textbox', { name: 'Customer Reference' })",
      })
    )
  })
})

describe('deriveOutputPath', () => {
  it('colocates by default when no folderPattern is given', () => {
    expect(deriveOutputPath('/repo/src/components/Button.js')).toBe(
      join('/repo/src/components', 'Button.test.tsx')
    )
  })

  it('colocates when folderPattern is colocated', () => {
    expect(deriveOutputPath('/repo/src/components/Button.tsx', 'colocated')).toBe(
      join('/repo/src/components', 'Button.test.tsx')
    )
  })

  it('places in __tests__/ subdirectory when folderPattern is __tests__', () => {
    expect(deriveOutputPath('/repo/src/components/Button.tsx', '__tests__')).toBe(
      join('/repo/src/components/__tests__', 'Button.test.tsx')
    )
  })

  it('places in tests/ subdirectory when folderPattern is tests', () => {
    expect(deriveOutputPath('/repo/src/components/Button.tsx', 'tests')).toBe(
      join('/repo/src/components/tests', 'Button.test.tsx')
    )
  })

  it('colocates when folderPattern is mixed', () => {
    expect(deriveOutputPath('/repo/src/components/Button.tsx', 'mixed')).toBe(
      join('/repo/src/components', 'Button.test.tsx')
    )
  })

  it('colocates when folderPattern is unknown', () => {
    expect(deriveOutputPath('/repo/src/components/Button.tsx', 'unknown')).toBe(
      join('/repo/src/components', 'Button.test.tsx')
    )
  })
})
