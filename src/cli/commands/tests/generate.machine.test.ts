// src/cli/commands/tests/generate.machine.test.ts
import { createActor, fromPromise } from 'xstate'
import { describe, expect, it, vi } from 'vitest'
import { createGenerateMachine } from '#cli/commands/generate.machine.ts'
import type { GenerateMachineContext } from '#cli/commands/generate.utils.ts'

const noop = fromPromise(async () => {})
const noopReturn = <T>(value: T) => fromPromise(async () => value)
const throwWith = (msg: string) => fromPromise(async () => { throw new Error(msg) })

function makeMinimalContext(): GenerateMachineContext {
  return {
    filePath: '/tmp/test.js',
    projectRoot: '/tmp',
    commandOptions: {},
    debugReporter: {
      enabled: false,
      persist: vi.fn(),
      traceReplay: vi.fn(),
      traceSelector: vi.fn(),
      traceStepSummary: vi.fn(),
      traceBrowserFailure: vi.fn(),
    },
    findings: [],
  }
}

const makeAllActors = (overrides: Partial<Record<string, ReturnType<typeof fromPromise>>> = {}) => ({
  validateFileActor: noop,
  parseRecordingActor: noop,
  loadStateActor: noop,
  captureVisualActor: noop,
  searchContextActor: noop,
  refineProfileActor: noopReturn({ packageProfile: null, contextProfileReason: null, staleness: null }),
  refreshProfileActor: noop,
  analyzeRecordingActor: noop,
  analyzeMocksActor: noopReturn({ mockAnalysis: null }),
  planGenerationActor: noop,
  resolveSelectorsActor: noop,
  generateCodeActor: noop,
  assessOutputActor: noopReturn({ existingCode: null, existingAssessment: null, shouldOverwrite: false }),
  writeOutputActor: noop,
  finalizeActor: noop,
  runHealthCommandsActor: noop,
  ...overrides,
})

function runToFinal(actor: ReturnType<typeof createActor>): Promise<void> {
  return new Promise<void>((resolve) => {
    actor.subscribe((s) => {
      if (s.value === 'done' || s.value === 'failed') resolve()
    })
    actor.start()
  })
}

function runCollectingStates(
  actor: ReturnType<typeof createActor>,
): { states: string[]; done: Promise<void> } {
  const states: string[] = []
  const done = new Promise<void>((resolve) => {
    actor.subscribe((s) => {
      states.push(s.value as string)
      if (s.value === 'done' || s.value === 'failed') resolve()
    })
    actor.start()
  })
  return { states, done }
}

function makeScore(total: number, grade: 'A' | 'B' | 'C') {
  return {
    total,
    grade,
    requiresReview: total < 70,
    blockers: [] as string[],
    dimensions: {
      queryQuality: total,
      assertionSpecificity: total,
      testStructure: total,
      boundaryIsolation: total,
    },
    markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
    markerQualityGate: {
      status: 'pass' as const,
      failing: false,
      reason: '',
      message: '',
    },
  }
}

function makePackageProfile(packagePath: string, extras: Record<string, unknown> = {}) {
  return {
    packagePath,
    sharedMockFactories: [],
    boundaryProfiles: [],
    inlineSafeMockTargets: [],
    effectiveRunner: 'unknown' as const,
    effectiveRenderHelper: null,
    appliedOverrides: [],
    ...extras,
  }
}

function makeFlowCoverage(total: number, covered: number) {
  return {
    totalSteps: total,
    coveredSteps: covered,
    coveredStepIds: Array.from({ length: covered }, (_, i) => String(i)),
    uncoveredStepIds: Array.from({ length: total - covered }, (_, i) =>
      String(covered + i),
    ),
  }
}

describe('generateMachine', () => {
  describe('initial state', () => {
    it('starts in idle then immediately transitions to validating', () => {
      const states: string[] = []
      const actor = createActor(
        createGenerateMachine(makeAllActors()),
        { input: makeMinimalContext() },
      )
      actor.subscribe((s) => states.push(s.value as string))
      actor.start()
      expect(states[0]).toBe('idle')
      expect(states[1]).toBe('validating')
    })
  })

  describe('error handling — each actor transitions to failed', () => {
    it('transitions to failed when validateFileActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          validateFileActor: throwWith('file not found'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('file not found')
    })

    it('transitions to failed when parseRecordingActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          parseRecordingActor: throwWith('parse error'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('parse error')
    })

    it('transitions to failed when loadStateActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          loadStateActor: throwWith('state load error'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('state load error')
    })

    it('transitions to failed when captureVisualActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          captureVisualActor: throwWith('playwright unavailable'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('playwright unavailable')
    })

    it('transitions to failed when searchContextActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          searchContextActor: throwWith('search failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('search failed')
    })

    it('transitions to failed when refineProfileActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: throwWith('profile refinement failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('profile refinement failed')
    })

    it('transitions to failed when refreshProfileActor throws after stale profile', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: true, reason: 'files changed', latestEvidencePath: null },
          }),
          refreshProfileActor: throwWith('refresh failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('refresh failed')
    })

    it('transitions to failed when analyzeRecordingActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          analyzeRecordingActor: throwWith('analysis failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('analysis failed')
    })

    it('transitions to failed when analyzeMocksActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          analyzeMocksActor: throwWith('mock analysis failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('mock analysis failed')
    })

    it('transitions to failed when planGenerationActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          planGenerationActor: throwWith('plan failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('plan failed')
    })

    it('transitions to failed when resolveSelectorsActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          resolveSelectorsActor: throwWith('selector resolution failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('selector resolution failed')
    })

    it('transitions to failed when generateCodeActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          generateCodeActor: throwWith('code generation failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('code generation failed')
    })

    it('transitions to failed when writeOutputActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          writeOutputActor: throwWith('write failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('write failed')
    })

    it('transitions to failed when finalizeActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          finalizeActor: throwWith('finalize failed'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error?.message).toBe('finalize failed')
    })
  })

  describe('isProfileStale guard', () => {
    it('goes directly to analyzingRecording when staleness.stale is false', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: false, reason: null, latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).not.toContain('refreshingProfile')
      expect(states).toContain('analyzingRecording')
    })

    it('goes directly to analyzingRecording when staleness is null', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: null,
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).not.toContain('refreshingProfile')
      expect(states).toContain('analyzingRecording')
    })

    it('routes to refreshingProfile when staleness.stale is true', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: true, reason: 'files changed', latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).toContain('refreshingProfile')
    })

    it('transitions from refreshingProfile directly to analyzingRecording (no infinite loop)', async () => {
      // Even when refreshProfileActor returns staleness.stale=true, the machine must
      // NOT loop back to refiningProfile — it goes straight to analyzingRecording.
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: true, reason: 'stale', latestEvidencePath: null },
          }),
          refreshProfileActor: noopReturn({
            bootstrappedState: { state: { packages: {} }, summary: { warnings: [] } },
            overrides: {},
            packageProfile: null,  // null is safe: summarizeResolvedPackageProfile handles null
            contextProfileReason: null,
            staleness: { stale: true, reason: 'still stale', latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states.filter((s) => s === 'refreshingProfile')).toHaveLength(1)
      expect(states.filter((s) => s === 'refiningProfile')).toHaveLength(1)
      const refreshIdx = states.lastIndexOf('refreshingProfile')
      expect(states[refreshIdx + 1]).toBe('analyzingRecording')
    })

    it('assigns refreshProfileActor output to context before analyzingRecording', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: true, reason: 'stale', latestEvidencePath: null },
          }),
          refreshProfileActor: noopReturn({
            bootstrappedState: { state: { packages: {} }, summary: { warnings: [] } },
            overrides: {},
            packageProfile: makePackageProfile('packages/app'),
            contextProfileReason: 'refreshed',
            staleness: { stale: false, reason: null, latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'analyzingRecording') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect((capturedContext?.packageProfile as any)?.packagePath).toBe('packages/app')
      expect(capturedContext?.contextProfileReason).toBe('refreshed')
    })
  })

  describe('assessingOutput guards', () => {
    it('writes when there is no existing code (shouldWrite)', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          assessOutputActor: noopReturn({
            existingCode: null,
            existingAssessment: null,
            shouldOverwrite: false,
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).toContain('writing')
      expect(states).toContain('finalizing')
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('writes when candidate scores better than existing (shouldWrite)', async () => {
      const highScore = makeScore(90, 'A')
      const lowScore = makeScore(50, 'C')
      const highFlow = makeFlowCoverage(2, 2)
      const lowFlow = makeFlowCoverage(2, 0)
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          generateCodeActor: noopReturn({
            generatedCode: 'new()',
            hydratedSuitePlan: null,
            scoreResult: null,
            boundaryPolicyWarnings: [],
            candidateAssessment: { flowCoverage: highFlow, scoreResult: highScore },
          }),
          assessOutputActor: noopReturn({
            existingCode: 'old()',
            existingAssessment: { flowCoverage: lowFlow, scoreResult: lowScore },
            shouldOverwrite: true,
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).toContain('writing')
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('transitions to done (keepExisting) when existing output is better than candidate', async () => {
      const highScore = makeScore(90, 'A')
      const lowScore = makeScore(50, 'C')
      const highFlow = makeFlowCoverage(2, 2)
      const lowFlow = makeFlowCoverage(2, 0)
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          parseRecordingActor: noopReturn({
            normalizedRecording: { title: 't', steps: [], baseline: null },
            defaultOutputPath: '/tmp/t.test.tsx',
          }),
          loadStateActor: noopReturn({
            hadState: false,
            bootstrappedState: { state: { packages: {} }, summary: { warnings: [] } },
            overrides: {},
            packageProfile: null,
            explicitAuthPath: null,
            explicitInstructionsPath: null,
            visualAuth: null,
          }),
          captureVisualActor: noopReturn({
            earlyAnalyzedRecording: { steps: [], diagnostics: { removedRedundantClicks: 0 }, intentGroups: [] },
            recordingUrl: undefined,
            visualState: null,
          }),
          searchContextActor: noopReturn({
            normalizedRecording: { title: 't', steps: [], baseline: null },
            contextMatches: [],
          }),
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: false },
          }),
          analyzeRecordingActor: noopReturn({
            analyzedRecording: { steps: [], diagnostics: { removedRedundantClicks: 0 }, intentGroups: [] },
            markerAwareRecording: { title: 't', steps: [], baseline: null },
            recoveredVisualAuth: null,
            visualAuth: null,
          }),
          planGenerationActor: noopReturn({
            jsSuitePlan: null,
            outputPath: '/tmp/t.test.tsx',
            resolvedRenderTargetFile: null,
            boundarySupportPlan: { warnings: [], requiresReview: false },
            generationRenderTarget: null,
            generationRenderHelper: null,
          }),
          resolveSelectorsActor: noopReturn({
            resolvedJsGeneration: {
              itGroups: [], queryResults: [],
              recording: { title: 't', steps: [], baseline: null },
              warnings: [],
            },
          }),
          generateCodeActor: noopReturn({
            generatedCode: 'test()',
            hydratedSuitePlan: null,
            scoreResult: lowScore,
            boundaryPolicyWarnings: [],
            candidateAssessment: { flowCoverage: lowFlow, scoreResult: lowScore },
          }),
          assessOutputActor: noopReturn({
            existingCode: 'existing()',
            existingAssessment: { flowCoverage: highFlow, scoreResult: highScore },
            shouldOverwrite: false,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => { if (s.value === 'done') resolve() })
        actor.start()
      })
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('transitions to done (not failed) when assessOutputActor throws', async () => {
      // Intentional: preserve existing output on assessment error rather than failing
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          assessOutputActor: throwWith('assessment error'),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(actor)
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('does not visit writing when assessOutputActor throws', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          assessOutputActor: throwWith('assessment error'),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done
      expect(states).not.toContain('writing')
    })
  })

  describe('context assignment', () => {
    it('assigns normalizedRecording and defaultOutputPath from parseRecordingActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          parseRecordingActor: noopReturn({
            normalizedRecording: { title: 'My Recording', steps: [{ id: 's1' }], baseline: null },
            defaultOutputPath: '/output/my.test.tsx',
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'loadingState') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.defaultOutputPath).toBe('/output/my.test.tsx')
      expect((capturedContext?.normalizedRecording as any)?.title).toBe('My Recording')
    })

    it('assigns hadState, bootstrappedState, and explicitAuthPath from loadStateActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          loadStateActor: noopReturn({
            hadState: false,
            bootstrappedState: {
              state: { packages: { 'pkg-a': {} } },
              summary: { warnings: ['w1'] },
            },
            overrides: {},
            packageProfile: null,
            explicitAuthPath: '/auth.json',
            explicitInstructionsPath: null,
            visualAuth: null,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'capturingVisual') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.hadState).toBe(false)
      expect(capturedContext?.explicitAuthPath).toBe('/auth.json')
      expect((capturedContext?.bootstrappedState as any)?.summary.warnings).toEqual(['w1'])
    })

    it('assigns earlyAnalyzedRecording and recordingUrl from captureVisualActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          captureVisualActor: noopReturn({
            earlyAnalyzedRecording: {
              steps: [{ id: 'step1' }],
              diagnostics: { removedRedundantClicks: 2 },
              intentGroups: [],
            },
            recordingUrl: 'http://localhost:3000/feature',
            visualState: null,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'searchingContext') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.recordingUrl).toBe('http://localhost:3000/feature')
      expect((capturedContext?.earlyAnalyzedRecording as any)?.diagnostics.removedRedundantClicks).toBe(2)
    })

    it('assigns contextMatches from searchContextActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const matches = [{ filePath: 'src/Foo.tsx', matchedTerms: ['term1', 'term2'], score: 0.9 }]
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          searchContextActor: noopReturn({
            normalizedRecording: { title: 'T', steps: [], baseline: null },
            contextMatches: matches,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'refiningProfile') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.contextMatches).toEqual(matches)
    })

    it('assigns packageProfile and contextProfileReason from refineProfileActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: makePackageProfile('packages/feature', { testFileCount: 5 }),
            contextProfileReason: 'matched by context',
            staleness: { stale: false, reason: null, latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'analyzingRecording') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect((capturedContext?.packageProfile as any)?.packagePath).toBe('packages/feature')
      expect(capturedContext?.contextProfileReason).toBe('matched by context')
    })

    it('assigns analyzedRecording and visualAuth from analyzeRecordingActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const analyzedRecording = {
        steps: [{ id: 'a1' }],
        diagnostics: { removedRedundantClicks: 1 },
        intentGroups: [],
      }
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          analyzeRecordingActor: noopReturn({
            analyzedRecording,
            markerAwareRecording: { title: 'T', steps: [], baseline: null },
            recoveredVisualAuth: null,
            visualAuth: { strategy: 'storageState', path: '/tmp/auth.json' },
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'analyzingMocks') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect((capturedContext?.analyzedRecording as any)?.diagnostics.removedRedundantClicks).toBe(1)
      expect((capturedContext?.visualAuth as any)?.strategy).toBe('storageState')
    })

    it('assigns mockAnalysis from analyzeMocksActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      // null is a valid MockAnalysis value; summarizeMockAnalysis guards against it
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          analyzeMocksActor: noopReturn({ mockAnalysis: null }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'planning') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.mockAnalysis).toBeNull()
    })

    it('assigns outputPath and boundarySupportPlan from planGenerationActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          planGenerationActor: noopReturn({
            jsSuitePlan: null,
            outputPath: '/custom/output.test.tsx',
            resolvedRenderTargetFile: null,
            boundarySupportPlan: { warnings: ['boundary warning'], requiresReview: true },
            generationRenderTarget: null,
            generationRenderHelper: null,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'resolvingSelectors') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.outputPath).toBe('/custom/output.test.tsx')
      expect((capturedContext?.boundarySupportPlan as any)?.warnings).toEqual(['boundary warning'])
      expect((capturedContext?.boundarySupportPlan as any)?.requiresReview).toBe(true)
    })

    it('assigns resolvedJsGeneration from resolveSelectorsActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const resolvedJsGeneration = {
        itGroups: [{ name: 'group1', tests: [] }],
        queryResults: [],
        recording: { title: 'T', steps: [], baseline: null },
        warnings: ['some warning'],
      }
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          resolveSelectorsActor: noopReturn({ resolvedJsGeneration }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'generating') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect((capturedContext?.resolvedJsGeneration as any)?.warnings).toEqual(['some warning'])
    })

    it('assigns generatedCode, boundaryPolicyWarnings, and candidateAssessment from generateCodeActor', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const candidateAssessment = {
        flowCoverage: makeFlowCoverage(3, 3),
        scoreResult: makeScore(85, 'B'),
      }
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          generateCodeActor: noopReturn({
            generatedCode: 'describe("suite", () => {})',
            hydratedSuitePlan: null,
            scoreResult: null,
            boundaryPolicyWarnings: ['policy-warning'],
            candidateAssessment,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'assessingOutput') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.generatedCode).toBe('describe("suite", () => {})')
      expect(capturedContext?.boundaryPolicyWarnings).toEqual(['policy-warning'])
      expect(capturedContext?.candidateAssessment).toEqual(candidateAssessment)
    })

    it('assigns existingCode and shouldOverwrite from assessOutputActor (shouldWrite path)', async () => {
      let capturedContext: GenerateMachineContext | undefined
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          assessOutputActor: noopReturn({
            existingCode: null,
            existingAssessment: null,
            shouldOverwrite: false,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await new Promise<void>((resolve) => {
        actor.subscribe((s) => {
          if (s.value === 'writing') capturedContext = s.context
          if (s.value === 'done' || s.value === 'failed') resolve()
        })
        actor.start()
      })
      expect(capturedContext?.existingCode).toBeNull()
      // shouldOverwrite is derived from existingCode != null
      expect(capturedContext?.shouldOverwrite).toBe(false)
    })
  })

  describe('full pipeline state sequence', () => {
    it('traverses all expected states in order on the happy path (no existing output)', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors()),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done

      const expectedStates = [
        'idle',
        'validating',
        'parsing',
        'loadingState',
        'capturingVisual',
        'searchingContext',
        'refiningProfile',
        'analyzingRecording',
        'analyzingMocks',
        'planning',
        'resolvingSelectors',
        'generating',
        'assessingOutput',
        'writing',
        'finalizing',
        'done',
      ]
      for (const s of expectedStates) {
        expect(states, `expected state "${s}" to be visited`).toContain(s)
      }
      expect(states).not.toContain('refreshingProfile')
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('traverses refreshingProfile between refiningProfile and analyzingRecording when stale', async () => {
      const actor = createActor(
        createGenerateMachine(makeAllActors({
          refineProfileActor: noopReturn({
            packageProfile: null,
            contextProfileReason: null,
            staleness: { stale: true, reason: 'stale', latestEvidencePath: null },
          }),
        })),
        { input: makeMinimalContext() },
      )
      const { states, done } = runCollectingStates(actor)
      await done

      const refineIdx = states.indexOf('refiningProfile')
      const refreshIdx = states.indexOf('refreshingProfile')
      const analyzeIdx = states.indexOf('analyzingRecording')

      expect(refineIdx).toBeLessThan(refreshIdx)
      expect(refreshIdx).toBeLessThan(analyzeIdx)
      expect(actor.getSnapshot().value).toBe('done')
    })

    it('ends in done for both writing and keepExisting paths', async () => {
      const keepActor = createActor(
        createGenerateMachine(makeAllActors({
          generateCodeActor: noopReturn({
            generatedCode: 'new()',
            hydratedSuitePlan: null,
            scoreResult: null,
            boundaryPolicyWarnings: [],
            candidateAssessment: { flowCoverage: makeFlowCoverage(0, 0), scoreResult: makeScore(30, 'C') },
          }),
          assessOutputActor: noopReturn({
            existingCode: 'existing()',
            existingAssessment: {
              flowCoverage: makeFlowCoverage(2, 2),
              scoreResult: makeScore(90, 'A'),
            },
            shouldOverwrite: false,
          }),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(keepActor)
      expect(keepActor.getSnapshot().value).toBe('done')

      const writeActor = createActor(
        createGenerateMachine(makeAllActors({
          assessOutputActor: noopReturn({ existingCode: null, existingAssessment: null, shouldOverwrite: false }),
        })),
        { input: makeMinimalContext() },
      )
      await runToFinal(writeActor)
      expect(writeActor.getSnapshot().value).toBe('done')
    })
  })
})
