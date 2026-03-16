// src/cli/commands/tests/generate.machine.test.ts
import { createActor, fromPromise } from 'xstate'
import { describe, expect, it, vi } from 'vitest'
import { createGenerateMachine } from '#cli/commands/generate.machine.ts'
import type { GenerateMachineContext } from '#cli/commands/generate.utils.ts'

const noop = fromPromise(async () => {})
const noopReturn = <T>(value: T) => fromPromise(async () => value)

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
  assessOutputActor: noopReturn({ existingCode: null, existingAssessment: null, shouldOverwrite: true }),
  writeOutputActor: noop,
  finalizeActor: noop,
  ...overrides,
})

describe('generateMachine', () => {
  it('starts in idle then immediately transitions to validating', () => {
    const states: string[] = []
    const actor = createActor(
      createGenerateMachine(makeAllActors()),
      { input: makeMinimalContext() }
    )
    actor.subscribe((s) => states.push(s.value as string))
    actor.start()
    expect(states[0]).toBe('idle')
    expect(states[1]).toBe('validating')
  })

  it('transitions to failed when validateFileActor throws', async () => {
    const actor = createActor(
      createGenerateMachine(makeAllActors({
        validateFileActor: fromPromise(async () => { throw new Error('file not found') }),
      })),
      { input: makeMinimalContext() }
    )
    await new Promise<void>((resolve) => {
      actor.subscribe((s) => {
        if (s.value === 'failed') resolve()
      })
      actor.start()
    })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error?.message).toBe('file not found')
  })

  it('transitions to done (keepExisting) when existing output is better than candidate', async () => {
    const highScore = {
      total: 90, grade: 'A' as const, requiresReview: false, blockers: [],
      dimensions: { queryQuality: 90, assertionSpecificity: 90, testStructure: 90, boundaryIsolation: 90 },
      markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
      markerQualityGate: { status: 'pass' as const, failing: false, reason: '', message: '' },
    }
    const lowScore = {
      total: 50, grade: 'C' as const, requiresReview: true, blockers: [],
      dimensions: { queryQuality: 50, assertionSpecificity: 50, testStructure: 50, boundaryIsolation: 50 },
      markerCoverage: { detected: 0, emitted: 0, unresolved: 0 },
      markerQualityGate: { status: 'pass' as const, failing: false, reason: '', message: '' },
    }
    const emptyFlow = { totalSteps: 0, coveredSteps: 0, coveredStepIds: [], uncoveredStepIds: [] }
    const highCovFlow = { totalSteps: 2, coveredSteps: 2, coveredStepIds: ['a', 'b'], uncoveredStepIds: [] }

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
          candidateAssessment: { flowCoverage: emptyFlow, scoreResult: lowScore },
        }),
        // existing output is better (score 90 > candidate 50)
        assessOutputActor: noopReturn({
          existingCode: 'existing()',
          existingAssessment: { flowCoverage: highCovFlow, scoreResult: highScore },
          shouldOverwrite: false,
        }),
      })),
      { input: makeMinimalContext() }
    )
    await new Promise<void>((resolve) => {
      actor.subscribe((s) => { if (s.value === 'done') resolve() })
      actor.start()
    })
    expect(actor.getSnapshot().value).toBe('done')
  })
})
