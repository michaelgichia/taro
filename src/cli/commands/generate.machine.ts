// src/cli/commands/generate.machine.ts
import { assign, enqueueActions, fromPromise, setup } from 'xstate'
import pc from 'picocolors'

import type { GenerateMachineContext } from '#cli/commands/generate.utils.ts'
import {
  generateMachineGuards,
  formatContextMatchesSummary,
  summarizeAuthPreflight,
  summarizeVisualState,
  summarizePageConfirmedContext,
  summarizeResolvedPackageProfile,
  summarizePlaywrightAuth,
  summarizeCleanup,
  summarizeMockAnalysis,
  summarizeBoundaryWarnings,
  summarizeSuiteContracts,
  summarizeSelectorWarnings,
  logScore,
  emitMarkerCoverageSection,
  emitRecoveredMarkerDiagnostics,
  emitMarkerPlacementCorrections,
  emitUnresolvedMarkerWarnings,
  emitLowConfidenceBanner,
  emitScoreHints,
  logExistingOutputDecision,
} from '#cli/commands/generate.utils.ts'

function log(msg: string): void {
  process.stderr.write(msg + '\n')
}

type CtxArg = { context: GenerateMachineContext }

export type GenerateMachineActors = {
  validateFileActor: ReturnType<typeof fromPromise>
  parseRecordingActor: ReturnType<typeof fromPromise>
  loadStateActor: ReturnType<typeof fromPromise>
  captureVisualActor: ReturnType<typeof fromPromise>
  searchContextActor: ReturnType<typeof fromPromise>
  refineProfileActor: ReturnType<typeof fromPromise>
  refreshProfileActor: ReturnType<typeof fromPromise>
  analyzeRecordingActor: ReturnType<typeof fromPromise>
  analyzeMocksActor: ReturnType<typeof fromPromise>
  planGenerationActor: ReturnType<typeof fromPromise>
  resolveSelectorsActor: ReturnType<typeof fromPromise>
  generateCodeActor: ReturnType<typeof fromPromise>
  assessOutputActor: ReturnType<typeof fromPromise>
  writeOutputActor: ReturnType<typeof fromPromise>
  finalizeActor: ReturnType<typeof fromPromise>
}

export function createGenerateMachine(actors: GenerateMachineActors) {
  return setup({
    types: { context: {} as GenerateMachineContext, input: {} as GenerateMachineContext },
    actors,
    guards: generateMachineGuards,
  }).createMachine({
    id: 'generate',
    initial: 'idle',
    context: ({ input }) => input,
    states: {
      idle: {
        entry: enqueueActions(({ enqueue, self }) => {
          enqueue.sendTo(self, { type: 'PROCEED' })
        }),
        on: {
          PROCEED: { target: 'validating' },
        },
      },
      validating: {
        invoke: {
          src: 'validateFileActor',
          input: ({ context }: CtxArg) => ({ filePath: context.filePath }),
          onDone: { target: 'parsing' },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      parsing: {
        invoke: {
          src: 'parseRecordingActor',
          input: ({ context }: CtxArg) => ({ filePath: context.filePath }),
          onDone: {
            target: 'loadingState',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                normalizedRecording: out?.normalizedRecording,
                defaultOutputPath: out?.defaultOutputPath,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      loadingState: {
        invoke: {
          src: 'loadStateActor',
          input: ({ context }: CtxArg) => ({
            filePath: context.filePath,
            projectRoot: context.projectRoot,
            commandOptions: context.commandOptions,
          }),
          onDone: {
            target: 'capturingVisual',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                hadState: out?.hadState,
                bootstrappedState: out?.bootstrappedState,
                overrides: out?.overrides,
                packageProfile: out?.packageProfile,
                explicitAuthPath: out?.explicitAuthPath,
                explicitInstructionsPath: out?.explicitInstructionsPath,
                visualAuth: out?.visualAuth,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      capturingVisual: {
        entry: ({ context }: CtxArg) => {
          if (context.commandOptions.screenshots === false) {
            log(pc.dim('[taro]') + ' Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran.')
          }
        },
        invoke: {
          src: 'captureVisualActor',
          input: ({ context }: CtxArg) => ({
            normalizedRecording: context.normalizedRecording,
            visualAuth: context.visualAuth,
            projectRoot: context.projectRoot,
            commandOptions: context.commandOptions,
          }),
          onDone: {
            target: 'searchingContext',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                earlyAnalyzedRecording: out?.earlyAnalyzedRecording,
                recordingUrl: out?.recordingUrl,
                visualState: out?.visualState,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      searchingContext: {
        entry: ({ context }: CtxArg) => {
          summarizeAuthPreflight({ auth: context.visualAuth ?? null, url: context.recordingUrl, visualState: context.visualState ?? null })
          summarizeVisualState(context.visualState ?? null)
          summarizePageConfirmedContext(context.visualState ?? null)
        },
        invoke: {
          src: 'searchContextActor',
          input: ({ context }: CtxArg) => ({
            normalizedRecording: context.normalizedRecording,
            visualState: context.visualState,
            projectRoot: context.projectRoot,
            defaultOutputPath: context.defaultOutputPath,
            filePath: context.filePath,
          }),
          onDone: {
            target: 'refiningProfile',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                normalizedRecording: out?.normalizedRecording,
                contextMatches: out?.contextMatches,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      refiningProfile: {
        invoke: {
          src: 'refineProfileActor',
          input: ({ context }: CtxArg) => ({
            bootstrappedState: context.bootstrappedState,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            overrides: context.overrides,
            contextMatches: context.contextMatches,
          }),
          onDone: [
            {
              guard: 'isProfileStale',
              target: 'refreshingProfile',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              actions: assign(({ event }) => {
                const out = (event as any).output
                return {
                  packageProfile: out?.packageProfile,
                  contextProfileReason: out?.contextProfileReason,
                  staleness: out?.staleness,
                }
              }),
            },
            {
              target: 'analyzingRecording',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              actions: assign(({ event }) => {
                const out = (event as any).output
                return {
                  packageProfile: out?.packageProfile,
                  contextProfileReason: out?.contextProfileReason,
                  staleness: out?.staleness,
                }
              }),
            },
          ],
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      refreshingProfile: {
        entry: ({ context }: CtxArg) => {
          const profilePath = context.packageProfile?.packagePath ?? '.'
          log(pc.dim('[taro]') + ` Detected stale package profile ${profilePath}; refreshing before generation.`)
          if (context.staleness?.reason) {
            console.warn(pc.yellow(context.staleness.reason))
          }
        },
        invoke: {
          src: 'refreshProfileActor',
          input: ({ context }: CtxArg) => ({
            projectRoot: context.projectRoot,
            contextMatches: context.contextMatches,
            overrides: context.overrides,
          }),
          onDone: {
            target: 'refiningProfile',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                bootstrappedState: out?.bootstrappedState,
                overrides: out?.overrides,
                packageProfile: out?.packageProfile,
                contextProfileReason: out?.contextProfileReason,
                staleness: out?.staleness,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      analyzingRecording: {
        entry: ({ context }: CtxArg) => {
          if (context.bootstrappedState?.summary.warnings.length) {
            for (const w of context.bootstrappedState.summary.warnings) {
              console.warn(pc.yellow(w))
            }
          }
          if (context.hadState === false) log(pc.dim('[taro]') + ' Bootstrapped .taro/state.json from current repo tests.')
          if (context.contextMatches?.length) {
            log(pc.dim('[taro]') + ` Context matches:\n${formatContextMatchesSummary(context.contextMatches)}`)
          }
          if (context.contextProfileReason && context.packageProfile) {
            log(pc.dim('[taro]') + ` Context-selected package profile ${context.packageProfile.packagePath}: ${context.contextProfileReason}.`)
          }
          summarizeResolvedPackageProfile(context.packageProfile ?? null)
          if (context.packageProfile?.appliedOverrides?.length) {
            log(pc.dim('[taro]') + ` Applied overrides for ${context.packageProfile.packagePath}: ${context.packageProfile.appliedOverrides.join(', ')}`)
          }
          summarizePlaywrightAuth(context.packageProfile ?? null)
          if (context.normalizedRecording) {
            log(pc.green('Parsed:') + ` ${pc.bold(context.normalizedRecording.title)} — ${context.normalizedRecording.steps.length} steps`)
          }
        },
        invoke: {
          src: 'analyzeRecordingActor',
          input: ({ context }: CtxArg) => ({
            normalizedRecording: context.normalizedRecording,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            visualState: context.visualState,
            visualAuth: context.visualAuth,
            explicitAuthPath: context.explicitAuthPath,
            explicitInstructionsPath: context.explicitInstructionsPath,
          }),
          onDone: {
            target: 'analyzingMocks',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                analyzedRecording: out?.analyzedRecording,
                markerAwareRecording: out?.markerAwareRecording,
                recoveredVisualAuth: out?.recoveredVisualAuth,
                visualAuth: out?.visualAuth,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      analyzingMocks: {
        entry: ({ context }: CtxArg) => {
          if (context.analyzedRecording) summarizeCleanup(context.analyzedRecording)
        },
        invoke: {
          src: 'analyzeMocksActor',
          input: ({ context }: CtxArg) => ({
            projectRoot: context.projectRoot,
            packageProfile: context.packageProfile,
          }),
          onDone: {
            target: 'planning',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return { mockAnalysis: out?.mockAnalysis }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      planning: {
        entry: ({ context }: CtxArg) => {
          summarizeMockAnalysis(context.mockAnalysis ?? null)
        },
        invoke: {
          src: 'planGenerationActor',
          input: ({ context }: CtxArg) => ({
            markerAwareRecording: context.markerAwareRecording,
            analyzedRecording: context.analyzedRecording,
            mockAnalysis: context.mockAnalysis,
            normalizedRecording: context.normalizedRecording,
            packageProfile: context.packageProfile,
            projectRoot: context.projectRoot,
            defaultOutputPath: context.defaultOutputPath,
            contextMatches: context.contextMatches,
            visualState: context.visualState,
          }),
          onDone: {
            target: 'resolvingSelectors',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                jsSuitePlan: out?.jsSuitePlan,
                outputPath: out?.outputPath,
                resolvedRenderTargetFile: out?.resolvedRenderTargetFile,
                boundarySupportPlan: out?.boundarySupportPlan,
                generationRenderTarget: out?.generationRenderTarget,
                generationRenderHelper: out?.generationRenderHelper,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      resolvingSelectors: {
        entry: ({ context }: CtxArg) => {
          if (context.boundarySupportPlan?.warnings.length) {
            for (const w of context.boundarySupportPlan.warnings) console.warn(pc.yellow(w))
          }
          if (context.jsSuitePlan) {
            summarizeBoundaryWarnings(context.jsSuitePlan.warnings)
            summarizeSuiteContracts(context.jsSuitePlan)
          }
        },
        invoke: {
          src: 'resolveSelectorsActor',
          input: ({ context }: CtxArg) => ({
            markerAwareRecording: context.markerAwareRecording,
            jsSuitePlan: context.jsSuitePlan,
            analyzedRecording: context.analyzedRecording,
            normalizedRecording: context.normalizedRecording,
            visualAuth: context.visualAuth,
            projectRoot: context.projectRoot,
            debugReporter: context.debugReporter,
          }),
          onDone: {
            target: 'generating',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return { resolvedJsGeneration: out?.resolvedJsGeneration }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      generating: {
        entry: ({ context }: CtxArg) => {
          summarizeSelectorWarnings(context.resolvedJsGeneration?.warnings ?? [])
        },
        invoke: {
          src: 'generateCodeActor',
          input: ({ context }: CtxArg) => ({
            normalizedRecording: context.normalizedRecording,
            resolvedJsGeneration: context.resolvedJsGeneration,
            jsSuitePlan: context.jsSuitePlan,
            outputPath: context.outputPath,
            packageProfile: context.packageProfile,
            boundarySupportPlan: context.boundarySupportPlan,
            generationRenderTarget: context.generationRenderTarget,
            generationRenderHelper: context.generationRenderHelper,
            analyzedRecording: context.analyzedRecording,
          }),
          onDone: {
            target: 'assessingOutput',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: assign(({ event }) => {
              const out = (event as any).output
              return {
                generatedCode: out?.generatedCode,
                hydratedSuitePlan: out?.hydratedSuitePlan,
                scoreResult: out?.scoreResult,
                boundaryPolicyWarnings: out?.boundaryPolicyWarnings,
                candidateAssessment: out?.candidateAssessment,
              }
            }),
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      assessingOutput: {
        invoke: {
          src: 'assessOutputActor',
          input: ({ context }: CtxArg) => ({
            outputPath: context.outputPath,
            generatedCode: context.generatedCode,
            analyzedRecording: context.analyzedRecording,
          }),
          onDone: [
            {
              guard: 'shouldWrite',
              target: 'writing',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              actions: assign(({ event }) => {
                const out = (event as any).output
                return {
                  existingCode: out?.existingCode,
                  existingAssessment: out?.existingAssessment,
                  shouldOverwrite: out?.existingCode != null,
                }
              }),
            },
            {
              guard: 'shouldKeepExisting',
              target: 'done',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              actions: ({ context, event }: any) => {
                if (event.output?.existingCode && event.output?.existingAssessment) {
                  logExistingOutputDecision({
                    outputPath: context.outputPath!,
                    candidate: context.candidateAssessment!,
                    existing: event.output.existingAssessment,
                    overwrite: false,
                  })
                }
              },
            },
          ],
          // intentional: preserve existing on assessment error
          onError: {
            target: 'done',
            actions: () => {
              console.warn(pc.yellow('Existing output could not be assessed cleanly, so Taro will preserve it instead of overwriting blindly.'))
            },
          },
        },
      },
      writing: {
        entry: ({ context }: CtxArg) => {
          if (context.existingCode && context.existingAssessment && context.candidateAssessment && context.outputPath) {
            logExistingOutputDecision({
              outputPath: context.outputPath,
              candidate: context.candidateAssessment,
              existing: context.existingAssessment,
              overwrite: true,
            })
          }
          if (context.scoreResult) {
            logScore(context.scoreResult)
            emitMarkerCoverageSection(context.scoreResult)
            emitLowConfidenceBanner(context.scoreResult)
            emitScoreHints(context.scoreResult, context.resolvedJsGeneration?.queryResults ?? [])
          }
          emitRecoveredMarkerDiagnostics(context.hydratedSuitePlan ?? null)
          emitMarkerPlacementCorrections(context.hydratedSuitePlan ?? null)
          emitUnresolvedMarkerWarnings(context.hydratedSuitePlan ?? null)
          for (const w of context.boundaryPolicyWarnings ?? []) {
            console.warn(pc.yellow(`Boundary policy: ${w}`))
          }
          if (context.boundarySupportPlan?.requiresReview) {
            console.warn(pc.yellow('Boundary support requires manual review because one or more collaborators were scaffolded with generic defaults.'))
          }
        },
        invoke: {
          src: 'writeOutputActor',
          input: ({ context }: CtxArg) => ({
            generatedCode: context.generatedCode,
            outputPath: context.outputPath,
            shouldOverwrite: context.shouldOverwrite,
            boundarySupportPlan: context.boundarySupportPlan,
          }),
          onDone: { target: 'finalizing' },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      finalizing: {
        invoke: {
          src: 'finalizeActor',
          input: ({ context }: CtxArg) => ({
            generatedCode: context.generatedCode,
            outputPath: context.outputPath,
            projectRoot: context.projectRoot,
            filePath: context.filePath,
            scoreResult: context.scoreResult,
            packageProfile: context.packageProfile,
          }),
          onDone: {
            target: 'done',
            actions: ({ context }: CtxArg) => {
              const action = context.shouldOverwrite ? pc.yellow('Updated') : pc.green('Created')
              log(`${action}: ${pc.bold(context.outputPath!)}`)
              log(pc.green('[taro] ✓ post-write verified'))
            },
          },
          onError: { target: 'failed', actions: assign({ error: ({ event }) => event.error as Error }) },
        },
      },
      done: {
        type: 'final',
      },
      failed: {
        type: 'final',
      },
    },
  })
}
