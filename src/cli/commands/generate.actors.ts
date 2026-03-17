// src/cli/commands/generate.actors.ts
import { fromPromise } from 'xstate'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import pc from 'picocolors'

import { normalizeJsBaseline } from '#core/baseline-normalizer.ts'
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from '#core/boundary-support.ts'
import { emitQuerySummary, generateTestFromGroups } from '#core/generator.ts'
import { loadInput } from '#core/input-loader.ts'
import { analyzeMocks } from '#core/mock-intelligence.ts'
import { analyzeRecording } from '#core/recording-intelligence.ts'
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '#core/state.ts'
import { planJsSuite } from '#core/suite-planner.ts'
import { verifySyntax } from '#core/verifier.ts'
import { writeTestFile } from '#core/writer.ts'
import { enrichCanonicalSemanticMarkers } from '#core/semantic-marker-enrichment.ts'
import { scoreGeneratedTest } from '#core/scorer.ts'

import type {
  AnalyzeMocksActorInput,
  AnalyzeRecordingActorInput,
  AssessOutputActorInput,
  CaptureVisualActorInput,
  FinalizeActorInput,
  GenerateCodeActorInput,
  LoadStateActorInput,
  ParseRecordingActorInput,
  PlanGenerationActorInput,
  RefineProfileActorInput,
  RefreshProfileActorInput,
  ResolveSelectorsActorInput,
  SearchContextActorInput,
  ValidateFileActorInput,
  WriteOutputActorInput,
} from '#cli/commands/generate.utils.ts'

import {
  assessOutputAgainstRecording,
  auditBoundaryPolicy,
  buildFlowCoverageSummary,
  buildMarkerCoverageSummary,
  buildMarkerReviewDiagnostics,
  collectRepoContextSearchTerms,
  deriveContextRenderTargets,
  deriveOutputPath,
  findRepoContextMatches,
  findRecordingUrl,
  getPrimarySelector,
  hasInteractiveVisualAuthCapability,
  maybeCaptureVisualState,
  mergeAnalyzedStepState,
  normalizeComparablePath,
  persistRecoveredVisualAuth,
  rebaseRenderHelperImportPath,
  resolvePackageProfileFromContextMatches,
  resolveRenderTargetFile,
  resolveRepoRenderTarget,
  resolveVisualAuthStorageStatePath,
  resolveJsGeneration,
  stripSemanticMarkerStepsFromHelpers,
  stripSemanticMarkerStepsFromItGroups,
  stripSemanticMarkerStepsFromScenarios,
  toImportPath,
  toItGroups,
  applyRepoRenderTarget,
  rehydrateSuitePlan,
  mapParsedQueriesToResults,
  DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH,
  MANUAL_VISUAL_AUTH_TIMEOUT_MS,
  resolveOptionalFilePath,
} from '#cli/commands/generate.utils.ts'

import { parseJsRecording } from '#core/js-parser.ts'

export const validateFileActor = fromPromise(
  async ({ input }: { input: ValidateFileActorInput }) => {
    try {
      await access(input.filePath)
    } catch {
      throw new Error(`File not found or not accessible: ${input.filePath}`)
    }
  }
)

export const parseRecordingActor = fromPromise(
  async ({ input }: { input: ParseRecordingActorInput }) => {
    const parsedInput = await loadInput(input.filePath)
    const normalizedRecording = normalizeJsBaseline(parsedInput)
    const defaultOutputPath = deriveOutputPath(input.filePath)
    return { normalizedRecording, defaultOutputPath }
  }
)

export const loadStateActor = fromPromise(
  async ({ input }: { input: LoadStateActorInput }) => {
    const { projectRoot, commandOptions } = input
    const hadState = await access(join(projectRoot, '.taro', 'state.json'))
      .then(() => true)
      .catch(() => false)
    const bootstrappedState = await loadOrBootstrapTaroState(projectRoot)
    const overrides = await readTaroOverrides(projectRoot)
    const defaultOutputPath = deriveOutputPath(input.filePath)
    const packageProfile = resolveTaroPackageProfile(
      bootstrappedState.state, projectRoot, defaultOutputPath, overrides
    )
    const explicitAuthPath = await resolveOptionalFilePath(projectRoot, commandOptions.auth)
    const explicitInstructionsPath = await resolveOptionalFilePath(
      projectRoot, commandOptions.instructions
    )
    if (explicitAuthPath && explicitInstructionsPath) {
      console.warn(pc.yellow(
        '[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run.'
      ))
    }
    const visualAuth =
      explicitAuthPath
        ? { strategy: 'storageState' as const, path: explicitAuthPath.relativePath, detectedAt: 'generate' as const, source: 'manual' as const }
        : explicitInstructionsPath
          ? { strategy: 'instructions' as const, path: explicitInstructionsPath.relativePath, detectedAt: 'generate' as const, source: 'manual' as const }
          : packageProfile?.playwrightAuth ?? null
    return { hadState, bootstrappedState, overrides, packageProfile, explicitAuthPath, explicitInstructionsPath, visualAuth }
  }
)

export const captureVisualActor = fromPromise(
  async ({ input }: { input: CaptureVisualActorInput }) => {
    const { normalizedRecording, visualAuth, projectRoot, commandOptions } = input
    const earlyAnalyzedRecording = analyzeRecording(normalizedRecording!)
    const recordingUrl = findRecordingUrl(earlyAnalyzedRecording)
    const recoveryStorageStatePath = resolveVisualAuthStorageStatePath(projectRoot, visualAuth ?? null)
    const authInstructionsPath =
      visualAuth?.strategy === 'instructions' ? visualAuth.path : undefined
    const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
      {}, commandOptions.interactiveAuth === true
    )
    const visualState = await maybeCaptureVisualState({
      analyzedRecording: earlyAnalyzedRecording,
      auth: visualAuth ?? null,
      authRecovery: commandOptions.screenshots !== false
        ? {
            enabled: interactiveVisualAuth,
            instructionsPath: authInstructionsPath,
            persistedAuthPath: recoveryStorageStatePath.relativePath,
            saveStorageStatePath: recoveryStorageStatePath.absolutePath,
            timeoutMs: MANUAL_VISUAL_AUTH_TIMEOUT_MS,
          }
        : undefined,
      projectRoot,
      recording: normalizedRecording!,
      selector: getPrimarySelector(normalizedRecording!),
      skipScreenshotArtifacts: commandOptions.screenshots === false,
      url: recordingUrl,
    })
    return { earlyAnalyzedRecording, recordingUrl, visualState }
  }
)

export const searchContextActor = fromPromise(
  async ({ input }: { input: SearchContextActorInput }) => {
    const { normalizedRecording, visualState, projectRoot, defaultOutputPath, filePath } = input
    const contextSearchTerms = collectRepoContextSearchTerms(normalizedRecording!, visualState ?? null)
    const contextMatches = await findRepoContextMatches({
      projectRoot,
      terms: contextSearchTerms,
      excludePaths: [filePath!, defaultOutputPath!],
    })
    const enrichedRecording = await enrichCanonicalSemanticMarkers({
      contextMatches,
      projectRoot,
      recording: normalizedRecording!,
    })
    return { normalizedRecording: enrichedRecording, contextMatches }
  }
)

export const refineProfileActor = fromPromise(
  async ({ input }: { input: RefineProfileActorInput }) => {
    const { bootstrappedState, packageProfile, projectRoot, overrides, contextMatches } = input
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState!.state,
      currentProfile: packageProfile ?? null,
      projectRoot,
      overrides: overrides!,
      matches: contextMatches ?? [],
    })
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null
    return {
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    }
  }
)

export const refreshProfileActor = fromPromise(
  async ({ input }: { input: RefreshProfileActorInput }) => {
    const { projectRoot, contextMatches, overrides } = input
    const bootstrappedState = await refreshTaroState(projectRoot)
    const freshOverrides = await readTaroOverrides(projectRoot)
    const defaultOutputPath = '.'
    const baseProfile = resolveTaroPackageProfile(
      bootstrappedState.state, projectRoot, defaultOutputPath, freshOverrides
    )
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState.state,
      currentProfile: baseProfile,
      projectRoot,
      overrides: freshOverrides,
      matches: contextMatches ?? [],
    })
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null
    return {
      bootstrappedState,
      overrides: freshOverrides,
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    }
  }
)

export const analyzeRecordingActor = fromPromise(
  async ({ input }: { input: AnalyzeRecordingActorInput }) => {
    const { normalizedRecording, packageProfile, projectRoot, visualState, visualAuth } = input
    const analyzedRecording = analyzeRecording(normalizedRecording!)
    const markerAwareRecording = mergeAnalyzedStepState(normalizedRecording!, analyzedRecording)
    const recoveredVisualAuth = await persistRecoveredVisualAuth({
      packageProfile: packageProfile ?? null,
      projectRoot,
      visualState: visualState ?? null,
    })
    const updatedVisualAuth = recoveredVisualAuth ?? visualAuth ?? null
    return {
      analyzedRecording,
      markerAwareRecording,
      recoveredVisualAuth,
      visualAuth: updatedVisualAuth,
    }
  }
)

export const analyzeMocksActor = fromPromise(
  async ({ input }: { input: AnalyzeMocksActorInput }) => {
    const mockAnalysis = await (async () => {
      try {
        return await analyzeMocks(input.projectRoot, { packageProfile: input.packageProfile ?? null })
      } catch {
        return null
      }
    })()
    return { mockAnalysis }
  }
)

export const planGenerationActor = fromPromise(
  async ({ input }: { input: PlanGenerationActorInput }) => {
    const {
      markerAwareRecording, analyzedRecording, mockAnalysis, normalizedRecording,
      packageProfile, projectRoot, defaultOutputPath, contextMatches, visualState,
    } = input
    const conventions = packageProfile?.conventions ?? {
      scannedAt: new Date().toISOString(),
      projectRoot,
      importStyle: 'esm' as const,
      mockPattern: 'none' as const,
      testFiles: [],
      folderPattern: 'unknown' as const,
      fileExtension: 'ts' as const,
    }
    const contextRenderTargets = deriveContextRenderTargets({
      projectRoot,
      outputPath: defaultOutputPath!,
      matches: contextMatches ?? [],
    })
    const repoRenderTargets = [
      ...contextRenderTargets,
      ...(packageProfile?.renderTargets ?? []),
    ]
    const rawJsSuitePlan = planJsSuite({
      recording: markerAwareRecording!,
      analyzedRecording: analyzedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      fallbackTitle: normalizedRecording!.title,
    })
    const repoRenderTarget = resolveRepoRenderTarget({
      candidates: repoRenderTargets,
      packageProfile,
      recording: normalizedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      suitePlan: rawJsSuitePlan,
      visualState: visualState ?? null,
    })
    const resolvedRenderTargetFile = await resolveRenderTargetFile({
      projectRoot, renderTarget: repoRenderTarget,
    })
    const outputPath = resolvedRenderTargetFile
      ? deriveOutputPath(resolvedRenderTargetFile)
      : defaultOutputPath!
    const generationRenderTarget = repoRenderTarget && resolvedRenderTargetFile
      ? { ...repoRenderTarget, importPath: toImportPath(dirname(outputPath), resolvedRenderTargetFile) }
      : repoRenderTarget
    const generationRenderHelper = rebaseRenderHelperImportPath({
      projectRoot, outputPath,
      renderHelper: packageProfile?.effectiveRenderHelper ?? null,
    })
    const boundarySupportPlan = await planBoundarySupport({
      projectRoot, outputPath, packageProfile: packageProfile ?? null,
      renderTargetFile: resolvedRenderTargetFile,
      renderTarget: repoRenderTarget,
    })
    const jsSuitePlan = rawJsSuitePlan
      ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
      : null
    return {
      jsSuitePlan, outputPath, resolvedRenderTargetFile,
      boundarySupportPlan, generationRenderTarget, generationRenderHelper,
    }
  }
)

export const resolveSelectorsActor = fromPromise(
  async ({ input }: { input: ResolveSelectorsActorInput }) => {
    const { markerAwareRecording, jsSuitePlan, analyzedRecording, normalizedRecording, visualAuth, projectRoot, debugReporter } = input
    const itGroups = jsSuitePlan?.itGroups ?? toItGroups(analyzedRecording!, normalizedRecording!.title)
    const resolvedJsGeneration = await resolveJsGeneration(
      markerAwareRecording!,
      itGroups,
      {
        auth: visualAuth
          ? { path: resolve(projectRoot, visualAuth.path), strategy: visualAuth.strategy }
          : undefined,
        debugReporter,
      }
    )
    return { resolvedJsGeneration }
  }
)

export const generateCodeActor = fromPromise(
  async ({ input }: { input: GenerateCodeActorInput }) => {
    const {
      normalizedRecording, resolvedJsGeneration, jsSuitePlan, outputPath,
      packageProfile, boundarySupportPlan, generationRenderTarget,
      generationRenderHelper, analyzedRecording,
    } = input
    const conventions = packageProfile?.conventions ?? {
      scannedAt: new Date().toISOString(),
      projectRoot: '',
      importStyle: 'esm' as const,
      mockPattern: 'none' as const,
      testFiles: [],
      folderPattern: 'unknown' as const,
      fileExtension: 'ts' as const,
    }
    const hydratedSuitePlan = jsSuitePlan
      ? rehydrateSuitePlan(jsSuitePlan, resolvedJsGeneration!.recording.steps)
      : null
    const generationHelpers = hydratedSuitePlan
      ? stripSemanticMarkerStepsFromHelpers(hydratedSuitePlan.helpers)
      : undefined
    const generationScenarios = hydratedSuitePlan && generationHelpers
      ? stripSemanticMarkerStepsFromScenarios(hydratedSuitePlan.scenarios, generationHelpers)
      : undefined
    const generationItGroups = stripSemanticMarkerStepsFromItGroups(resolvedJsGeneration!.itGroups)
    const generated = generateTestFromGroups(
      normalizedRecording!.title, generationItGroups, {
        outputPath: outputPath!,
        conventions,
        runner: packageProfile?.effectiveRunner ?? 'unknown',
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        helpers: generationHelpers,
        scenarios: generationScenarios,
        renderTarget: generationRenderTarget ?? undefined,
        renderHelper: generationRenderHelper ?? undefined,
      }
    )
    let code = applyBoundarySupport(generated.code, boundarySupportPlan!)
    const boundaryPolicyWarnings = await auditBoundaryPolicy(
      code, packageProfile ?? null, null
    )
    if (hydratedSuitePlan?.warnings.length) {
      code = [
        ...hydratedSuitePlan.warnings.map((w) => `// taro-boundary-warning: ${w}`),
        code,
      ].join('\n')
    }
    if (boundaryPolicyWarnings.length > 0) {
      code = [
        ...boundaryPolicyWarnings.map((w) => `// taro-boundary-warning: ${w}`),
        code,
      ].join('\n')
    }
    const markerCoverage = buildMarkerCoverageSummary({
      analyzedRecording: analyzedRecording!,
      suitePlan: hydratedSuitePlan,
    })
    const markerDiagnostics = buildMarkerReviewDiagnostics(hydratedSuitePlan)
    const scoreResult = scoreGeneratedTest(code, {
      queryResults: resolvedJsGeneration?.queryResults ?? [],
      markerCoverage,
      markerDiagnostics,
    })
    const flowCoverage = buildFlowCoverageSummary(analyzedRecording!, code)
    const candidateAssessment = { flowCoverage, scoreResult }
    emitQuerySummary(resolvedJsGeneration?.queryResults ?? [])
    return {
      generatedCode: code,
      hydratedSuitePlan,
      scoreResult,
      boundaryPolicyWarnings,
      candidateAssessment,
    }
  }
)

export const assessOutputActor = fromPromise(
  async ({ input }: { input: AssessOutputActorInput }) => {
    const { outputPath, generatedCode, analyzedRecording } = input
    let existingCode: string | null = null
    try {
      existingCode = await readFile(outputPath!, 'utf-8')
    } catch {
      return { existingCode: null, existingAssessment: null, shouldOverwrite: true }
    }
    const existingAssessment = await assessOutputAgainstRecording({
      analyzedRecording: analyzedRecording!,
      code: existingCode,
    })
    const candidateParsed = await parseJsRecording(generatedCode!)
    const candidateFlowCoverage = buildFlowCoverageSummary(analyzedRecording!, generatedCode!)
    const scoreResult = scoreGeneratedTest(generatedCode!, {
      queryResults: mapParsedQueriesToResults(candidateParsed),
    })
    const candidateAssessment = { flowCoverage: candidateFlowCoverage, scoreResult }
    return { existingCode, existingAssessment, candidateAssessment, shouldOverwrite: false }
  }
)

export const writeOutputActor = fromPromise(
  async ({ input }: { input: WriteOutputActorInput }) => {
    await materializeBoundarySupport(input.boundarySupportPlan!)
    await writeTestFile(input.generatedCode!, input.outputPath!, {
      createDir: true,
      overwriteExisting: input.shouldOverwrite ?? false,
    })
  }
)

export const finalizeActor = fromPromise(
  async ({ input }: { input: FinalizeActorInput }) => {
    const { generatedCode, outputPath, projectRoot, filePath, scoreResult, packageProfile } = input
    const verification = verifySyntax(generatedCode!, outputPath!)
    if (!verification.valid) {
      throw new Error(`Post-write verification failed: ${verification.error}`)
    }
    try {
      await refreshTaroState(projectRoot)
      await appendGeneratedTestRecord(projectRoot, {
        packagePath: packageProfile?.packagePath ?? '.',
        recordingFile: filePath,
        testFile: outputPath!,
        scoreResult: scoreResult!,
      })
      process.stderr.write(
        pc.dim('[taro]') +
          ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? '.'}.` +
          '\n'
      )
    } catch {
      // state updates are best-effort
    }
  }
)
