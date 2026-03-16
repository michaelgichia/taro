/**
 * Generate command
 * Internal runtime-only generation pipeline for Testing Library Recorder JS exports.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { cwd, stdin, stdout } from 'node:process'

import { Command } from 'commander'
import pc from 'picocolors'

import { normalizeJsBaseline } from '#core/baseline-normalizer.ts'
import { analyzeBoundaryIsolation } from '#core/boundary-intelligence.ts'
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from '#core/boundary-support.ts'
import { emitQuerySummary, generateTestFromGroups } from '#core/generator.ts'
import { loadInput } from '#core/input-loader.ts'
import { analyzeRecording } from '#core/recording-intelligence.ts'
import type { ReplayStepDebugTrace } from '#core/resolver.ts'
import type { SelectorResolutionResult } from '#types/recording.ts'
import { scoreGeneratedTest } from '#core/scorer.ts'
import { enrichCanonicalSemanticMarkers } from '#core/semantic-marker-enrichment.ts'
import {
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '#core/state.ts'
import type { TaroPlaywrightAuthProfile } from '#types/state.ts'
import { planJsSuite } from '#core/suite-planner.ts'
import { writeTestFile } from '#core/writer.ts'

import {
  applyRepoRenderTarget,
  assessOutputAgainstRecording,
  auditBoundaryPolicy,
  buildFlowCoverageSummary,
  buildMarkerCoverageSummary,
  buildMarkerReviewDiagnostics,
  collectRepoContextSearchTerms,
  compareOutputAssessments,
  deriveContextRenderTargets,
  deriveOutputPath,
  emitLowConfidenceBanner,
  emitMarkerCoverageSection,
  emitMarkerPlacementCorrections,
  emitRecoveredMarkerDiagnostics,
  emitScoreHints,
  emitUnresolvedMarkerWarnings,
  finalizeGeneratedOutput,
  findRepoContextMatches,
  findRecordingUrl,
  flushFindings,
  formatContextMatchesSummary,
  getPrimarySelector,
  logExistingOutputDecision,
  logScore,
  maybeCaptureVisualState,
  maybeAnalyzeMocks,
  mergeAnalyzedStepState,
  pathExists,
  persistRecoveredVisualAuth,
  rebaseRenderHelperImportPath,
  rehydrateSuitePlan,
  resolveJsGeneration,
  resolveOptionalFilePath,
  resolvePackageProfileFromContextMatches,
  resolveRepoRenderTarget,
  resolveRenderTargetFile,
  resolveVisualAuthStorageStatePath,
  stripSemanticMarkerStepsFromHelpers,
  stripSemanticMarkerStepsFromItGroups,
  stripSemanticMarkerStepsFromScenarios,
  summarizeAuthPreflight,
  summarizeBoundaryWarnings,
  summarizeCleanup,
  summarizeMockAnalysis,
  summarizePageConfirmedContext,
  summarizePlaywrightAuth,
  summarizeResolvedPackageProfile,
  summarizeSelectorWarnings,
  summarizeSuiteContracts,
  summarizeVisualState,
  toImportPath,
  toItGroups,
  type OutputAssessment,
  type SelectorDebugReporter,
} from '#cli/commands/generate.utils.ts'

export { generateCommandInternals } from '#cli/commands/generate.utils.ts'

interface GenerateCommandContext {
  input?: Pick<typeof stdin, 'isTTY'>
  output?: Pick<typeof stdout, 'isTTY'>
}

type DebugTraceRecord =
  | {
      kind: 'replay-attempt'
      action: string
      error?: string
      fallbackLocators?: string[]
      locatorSource: string
      locatorValue?: string
      pageTitle?: string
      pageUrl?: string
      playwrightAction: string
      result: string
      stepId?: string
      target?: string
      timeoutMs: number
    }
  | {
      kind: 'selector-resolution'
      cssSelector: string
      derivedQuery?: string
      inspectSource: string
      inspectionError?: string
      pageUrl?: string
      phase?: string
      reason?: string
      result: string
      stepId: string
    }
  | {
      kind: 'step-summary'
      action: string
      replayed: boolean
      selectorsResolved: number
      selectorsStillUnresolved: number
      stepId: string
      warningCount: number
    }
  | {
      kind: 'replay-browser-failure'
      authStrategy?: string
      error: string
      url: string
    }

/**
 * Writes an operational log line to stderr.
 *
 * Stdout is reserved for the findings envelope, so callers must use this helper
 * for routine status output from the generation pipeline.
 *
 * @param {string} msg - Supplies the already-formatted message to emit as a single stderr line.
 */
function log(msg: string): void {
  process.stderr.write(msg + '\n')
}

/**
 * Builds a selector replay reporter that mirrors debug traces to stderr and optionally persists them as JSONL.
 *
 * When `enabled` is false, the returned reporter becomes a no-op even if a JSON path is provided.
 * When `jsonPath` is set, `persist()` writes one serialized trace record per line.
 *
 * @param {{ enabled: boolean, jsonPath?: string }} options - Enables live tracing and, when `jsonPath` is set, records structured diagnostics for later inspection.
 * @returns {SelectorDebugReporter} A reporter with replay, selector, step-summary, and browser-failure hooks for the JS generation pipeline.
 */
function createSelectorDebugReporter(options: {
  enabled: boolean
  jsonPath?: string
}): SelectorDebugReporter {
  const records: DebugTraceRecord[] = []

  const emit = (record: DebugTraceRecord, line: string) => {
    if (!options.enabled) {
      return
    }

    log(line)
    if (options.jsonPath) {
      records.push(record)
    }
  }

  const formatValue = (value: string | number | boolean | undefined) =>
    JSON.stringify(value ?? '')

  return {
    enabled: options.enabled,
    traceReplay(debug) {
      if (!options.enabled || !debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'replay-attempt',
        action: debug.action,
        error: debug.error,
        fallbackLocators: debug.fallbackLocators,
        locatorSource: debug.locatorSource,
        locatorValue: debug.locatorValue,
        pageTitle: debug.pageTitle,
        pageUrl: debug.pageUrl,
        playwrightAction: debug.playwrightAction,
        result: debug.result,
        stepId: debug.stepId,
        target: debug.target,
        timeoutMs: debug.timeoutMs,
      }

      emit(
        record,
        [
          '[taro][replay]',
          `step=${debug.stepId ?? '(unknown)'}`,
          `action=${debug.action}`,
          `target=${formatValue(debug.target)}`,
          `url=${formatValue(debug.pageUrl)}`,
          `locatorSource=${debug.locatorSource}`,
          `locatorValue=${formatValue(debug.locatorValue)}`,
          `playwrightAction=${formatValue(debug.playwrightAction)}`,
          `timeoutMs=${debug.timeoutMs}`,
          `result=${debug.result}`,
          `error=${formatValue(debug.error)}`,
        ].join(' ')
      )
    },
    traceSelector(result) {
      if (!options.enabled || !result.debug) {
        return
      }

      const record: DebugTraceRecord = {
        kind: 'selector-resolution',
        cssSelector: result.debug.cssSelector,
        derivedQuery: result.debug.derivedQuery,
        inspectSource: result.debug.inspectSource,
        inspectionError: result.debug.inspectionError,
        pageUrl: result.debug.pageUrl,
        phase: result.debug.phase,
        reason:
          result.status === 'unresolved'
            ? result.reason
            : result.debug.reason,
        result: result.status,
        stepId: result.stepId,
      }

      emit(
        record,
        [
          '[taro][selector]',
          `step=${result.stepId}`,
          `css=${formatValue(result.debug.cssSelector)}`,
          `phase=${result.debug.phase ?? 'n/a'}`,
          `inspectSource=${result.debug.inspectSource}`,
          `url=${formatValue(result.debug.pageUrl)}`,
          `result=${result.status}`,
          `reason=${formatValue(
            result.status === 'unresolved' ? result.reason : result.debug.reason
          )}`,
          `inspectionError=${formatValue(result.debug.inspectionError)}`,
          `derivedQuery=${formatValue(result.debug.derivedQuery)}`,
        ].join(' ')
      )
    },
    traceStepSummary(record) {
      emit(
        {
          kind: 'step-summary',
          action: record.action,
          replayed: record.replayed,
          selectorsResolved: record.selectorsResolved,
          selectorsStillUnresolved: record.selectorsStillUnresolved,
          stepId: record.stepId,
          warningCount: record.warningCount,
        },
        [
          '[taro][step-summary]',
          `step=${record.stepId}`,
          `action=${record.action}`,
          `replayed=${record.replayed}`,
          `selectorsResolved=${record.selectorsResolved}`,
          `selectorsStillUnresolved=${record.selectorsStillUnresolved}`,
          `warningCount=${record.warningCount}`,
        ].join(' ')
      )
    },
    traceBrowserFailure(record) {
      emit(
        {
          kind: 'replay-browser-failure',
          authStrategy: record.authStrategy,
          error: record.error,
          url: record.url,
        },
        [
          '[taro][replay-browser]',
          `url=${formatValue(record.url)}`,
          `authStrategy=${formatValue(record.authStrategy)}`,
          `error=${formatValue(record.error)}`,
        ].join(' ')
      )
    },
    async persist() {
      if (!options.jsonPath) {
        return
      }

      await mkdir(dirname(options.jsonPath), { recursive: true })
      const body = records.map((record) => JSON.stringify(record)).join('\n')
      await writeFile(options.jsonPath, body.length > 0 ? `${body}\n` : '', 'utf-8')
    },
  }
}

/**
 * Checks whether this command run can support interactive visual-auth recovery.
 *
 * A forced interactive flag bypasses stdio TTY detection.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles to inspect instead of the process globals.
 * @param {boolean} [forceInteractiveAuth=false] - Forces interactive auth support even when stdin or stdout is not a TTY.
 * @returns {boolean} `true` when interactive auth recovery is allowed for this run.
 */
function hasInteractiveVisualAuthCapabilityLocal(
  context: GenerateCommandContext = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean((context.input ?? stdin).isTTY && (context.output ?? stdout).isTTY)
  )
}

/**
 * Creates the internal `__generate` CLI command for recorder-to-RTL generation.
 *
 * The command loads the recorder export, grounds it against repo state and optional visual evidence,
 * resolves selectors, generates the test file, updates Taro state, and exits through the findings envelope.
 *
 * @param {GenerateCommandContext} [context={}] - Supplies optional stdio handles used to detect whether interactive auth recovery is possible.
 * @returns {Command} The configured Commander command instance for internal JS generation.
 */
export function createGenerateCommand(context: GenerateCommandContext = {}): Command {
  const generate = new Command('__generate')

  generate
    .description('Internal runtime-only generator for Testing Library Recorder JS exports')
    .argument('<file>', 'Path to the recorder export file (.js)')
    .option('-i, --interactive-auth', 'Force interactive Playwright auth recovery even when stdio is not detected as TTY')
    .option('--auth <file>', 'Path to a Playwright storageState JSON file for optional visual capture')
    .option('--instructions <file>', 'Path to a non-secret auth instructions file for optional visual capture')
    .option('--no-screenshots', 'Skip optional Playwright screenshots and visual inspection')
    .option('--debug-selectors', 'Emit detailed selector resolution and Playwright replay diagnostics')
    .option('--debug-selectors-json <file>', 'Write selector resolution and Playwright replay diagnostics as JSONL')
    .action(async (file: string) => {
      const filePath = resolve(file)
      const projectRoot = cwd()
      const findings: import('#core/findings-reporter.ts').Finding[] = []
      const commandOptions = generate.opts<{
        auth?: string
        debugSelectors?: boolean
        debugSelectorsJson?: string
        interactiveAuth?: boolean
        instructions?: string
        screenshots?: boolean
      }>()
      const screenshotsEnabled = commandOptions.screenshots !== false
      const debugReporter = createSelectorDebugReporter({
        enabled: Boolean(commandOptions.debugSelectors || commandOptions.debugSelectorsJson),
        jsonPath: commandOptions.debugSelectorsJson
          ? resolve(projectRoot, commandOptions.debugSelectorsJson)
          : undefined,
      })

      // Fail fast before any repo analysis so the command never mutates state for a missing recording.
      try {
        await access(filePath)
      } catch {
        console.error(
          pc.red('Error:') + ` File not found or not accessible: ${pc.bold(filePath)}`
        )
        process.exit(2)
      }

      let parsedInput: Awaited<ReturnType<typeof loadInput>>
      try {
        parsedInput = await loadInput(filePath)
      } catch (err) {
        console.error(
          pc.red('Error:') + ` Failed to parse recording: ${pc.bold(filePath)}\n${String(err)}`
        )
        process.exit(2)
      }

      let normalizedRecording = normalizeJsBaseline(parsedInput)
      const hadState = await access(join(projectRoot, '.taro', 'state.json'))
        .then(() => true)
        .catch(() => false)
      const defaultOutputPath = deriveOutputPath(filePath)
      let bootstrappedState = await loadOrBootstrapTaroState(projectRoot)
      let overrides = await readTaroOverrides(projectRoot)
      let packageProfile = resolveTaroPackageProfile(
        bootstrappedState.state,
        projectRoot,
        defaultOutputPath,
        overrides
      )
      const explicitAuthPath = await resolveOptionalFilePath(projectRoot, commandOptions.auth)
      const explicitInstructionsPath = await resolveOptionalFilePath(
        projectRoot,
        commandOptions.instructions
      )
      if (explicitAuthPath && explicitInstructionsPath) {
        console.warn(
          pc.yellow('[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run.')
        )
      }
      // Explicit CLI auth always overrides learned profile auth so one-off recovery can be tested safely.
      let visualAuth: TaroPlaywrightAuthProfile | null =
        explicitAuthPath
          ? {
              strategy: 'storageState',
              path: explicitAuthPath.relativePath,
              detectedAt: 'generate',
              source: 'manual',
            }
          : explicitInstructionsPath
            ? {
                strategy: 'instructions',
                path: explicitInstructionsPath.relativePath,
                detectedAt: 'generate',
                source: 'manual',
              }
            : packageProfile?.playwrightAuth ?? null
      const authInstructionsPath =
        explicitInstructionsPath?.relativePath ??
        (visualAuth?.strategy === 'instructions' ? visualAuth.path : undefined)
      const interactiveVisualAuth = hasInteractiveVisualAuthCapabilityLocal(
        context,
        commandOptions.interactiveAuth === true
      )
      const recoveryStorageStatePath = resolveVisualAuthStorageStatePath(
        projectRoot,
        visualAuth
      )
      const earlyAnalyzedRecording = analyzeRecording(normalizedRecording)
      const recordingUrl = findRecordingUrl(earlyAnalyzedRecording)
      // Run visual preflight before repo grounding so live route/landmark evidence can influence package and render-target selection.
      let visualState = await maybeCaptureVisualState({
        analyzedRecording: earlyAnalyzedRecording,
        auth: visualAuth,
        authRecovery: screenshotsEnabled
          ? {
              enabled: interactiveVisualAuth,
              instructionsPath: authInstructionsPath,
              persistedAuthPath: recoveryStorageStatePath.relativePath,
              saveStorageStatePath: recoveryStorageStatePath.absolutePath,
              timeoutMs: 5 * 60 * 1000,
            }
          : undefined,
        projectRoot,
        recording: normalizedRecording,
        selector: getPrimarySelector(normalizedRecording),
        skipScreenshotArtifacts: !screenshotsEnabled,
        url: recordingUrl,
      })
      if (!screenshotsEnabled) {
        log(
          pc.dim('[taro]') +
            ' Screenshot artifacts skipped (--no-screenshots); Playwright page confirmation still ran.'
        )
      }
      summarizeAuthPreflight({
        auth: visualAuth,
        url: recordingUrl,
        visualState,
      })
      summarizeVisualState(visualState)
      summarizePageConfirmedContext(visualState)
      const contextSearchTerms = collectRepoContextSearchTerms(normalizedRecording, visualState)
      const contextMatches = await findRepoContextMatches({
        projectRoot,
        terms: contextSearchTerms,
        excludePaths: [filePath, defaultOutputPath],
      })
      normalizedRecording = await enrichCanonicalSemanticMarkers({
        contextMatches,
        projectRoot,
        recording: normalizedRecording,
      })
      const contextProfile = resolvePackageProfileFromContextMatches({
        state: bootstrappedState.state,
        currentProfile: packageProfile,
        projectRoot,
        overrides,
        matches: contextMatches,
      })
      packageProfile = contextProfile.profile
      let contextProfileReason = contextProfile.reason

      if (bootstrappedState.summary.warnings.length > 0) {
        for (const warning of bootstrappedState.summary.warnings) {
          console.warn(pc.yellow(`[taro] State: ${warning}`))
        }
      }

      if (packageProfile) {
        const staleness = await detectPackageProfileStaleness(projectRoot, packageProfile)
        if (staleness.stale) {
          // Refresh stale learned state before generation so helper imports and boundary policy come from current repo reality.
          log(
            pc.dim('[taro]') +
              ` Detected stale package profile ${packageProfile.packagePath}; refreshing before generation.`
          )
          if (staleness.reason) {
            console.warn(pc.yellow(`[taro] State: ${staleness.reason}`))
          }
          bootstrappedState = await refreshTaroState(projectRoot)
          overrides = await readTaroOverrides(projectRoot)
          packageProfile = resolveTaroPackageProfile(
            bootstrappedState.state,
            projectRoot,
            defaultOutputPath,
            overrides
          )
          const refreshedContextProfile = resolvePackageProfileFromContextMatches({
            state: bootstrappedState.state,
            currentProfile: packageProfile,
            projectRoot,
            overrides,
            matches: contextMatches,
          })
          packageProfile = refreshedContextProfile.profile
          contextProfileReason = refreshedContextProfile.reason
        }
      }

      const conventions =
        packageProfile?.conventions ?? {
          scannedAt: new Date().toISOString(),
          projectRoot,
          importStyle: 'esm',
          mockPattern: 'none',
          testFiles: [],
          folderPattern: 'unknown',
          fileExtension: 'ts',
      }
      const contextRenderTargets = deriveContextRenderTargets({
        projectRoot,
        outputPath: defaultOutputPath,
        matches: contextMatches,
      })
      // Learned render targets and context-derived guesses are combined so repo evidence can fill gaps in state.
      const repoRenderTargets = [...contextRenderTargets, ...(packageProfile?.renderTargets ?? [])]

      if ((explicitAuthPath || explicitInstructionsPath) && packageProfile && visualAuth) {
        const persisted = await persistPlaywrightAuthProfile(
          projectRoot,
          packageProfile.packagePath,
          visualAuth
        )
        if (persisted) {
          log(
            pc.dim('[taro]') +
              ` Persisted visual auth for package ${packageProfile.packagePath}: ${visualAuth.strategy}=${visualAuth.path}`
          )
        } else {
          console.warn(
            pc.yellow('[taro] Visual auth: resolved the auth path for this run but could not persist it in state.')
          )
        }
      } else if ((explicitAuthPath || explicitInstructionsPath) && !packageProfile && visualAuth) {
        console.warn(
          pc.yellow('[taro] Visual auth: using the explicit auth path for this run, but no package profile was available to persist it.')
        )
      }

      if (!hadState) {
        log(pc.dim('[taro]') + ' Bootstrapped .taro/state.json from current repo tests.')
      }
      if (contextMatches.length > 0) {
        log(
          pc.dim('[taro]') +
            ` Context matches: ${formatContextMatchesSummary(contextMatches)}`
        )
      }
      if (packageProfile?.appliedOverrides.length) {
        log(
          pc.dim('[taro]') +
            ` Applied overrides for ${packageProfile.packagePath}: ${packageProfile.appliedOverrides.join(', ')}`
        )
      }
      if (contextProfileReason && packageProfile) {
        log(
          pc.dim('[taro]') +
            ` Context-selected package profile ${packageProfile.packagePath}: ${contextProfileReason}.`
        )
      }
      summarizeResolvedPackageProfile(packageProfile)
      summarizePlaywrightAuth(packageProfile)

      log(
        pc.green('Parsed:') +
          ` ${pc.bold(normalizedRecording.title)} — ${normalizedRecording.steps.length} steps` +
          `, ${normalizedRecording.baseline?.itGroups.length ?? 0} test group(s)`
      )

      const analyzedRecording = analyzeRecording(normalizedRecording)
      const markerAwareRecording = mergeAnalyzedStepState(normalizedRecording, analyzedRecording)
      summarizeCleanup(analyzedRecording)
      const recoveredVisualAuth = await persistRecoveredVisualAuth({
        packageProfile,
        projectRoot,
        visualState,
      })
      if (recoveredVisualAuth) {
        visualAuth = recoveredVisualAuth
      }
      const mockAnalysis = await maybeAnalyzeMocks(projectRoot, packageProfile)
      summarizeMockAnalysis(mockAnalysis)
      const rawJsSuitePlan = planJsSuite({
        recording: markerAwareRecording,
        analyzedRecording,
        mockAnalysis,
        fallbackTitle: normalizedRecording.title,
      })

      // Repo render-target selection affects both the output location and the boundary support plan.
      const repoRenderTarget = resolveRepoRenderTarget({
        candidates: repoRenderTargets,
        packageProfile,
        recording: normalizedRecording,
        mockAnalysis,
        suitePlan: rawJsSuitePlan,
        visualState,
      })
      const resolvedRenderTargetFile = await resolveRenderTargetFile({
        projectRoot,
        renderTarget: repoRenderTarget,
      })
      const outputPath = resolvedRenderTargetFile
        ? deriveOutputPath(resolvedRenderTargetFile)
        : defaultOutputPath
      const generationRenderTarget =
        repoRenderTarget && resolvedRenderTargetFile
          ? {
              ...repoRenderTarget,
              importPath: toImportPath(dirname(outputPath), resolvedRenderTargetFile),
            }
          : repoRenderTarget
      const generationRenderHelper = rebaseRenderHelperImportPath({
        projectRoot,
        outputPath,
        renderHelper: packageProfile?.effectiveRenderHelper ?? null,
      })
      const boundarySupportPlan = await planBoundarySupport({
        projectRoot,
        outputPath,
        packageProfile,
        renderTargetFile: resolvedRenderTargetFile,
        renderTarget: repoRenderTarget,
      })

      if (boundarySupportPlan.warnings.length > 0) {
        for (const warning of boundarySupportPlan.warnings) {
          console.warn(pc.yellow(`[taro] Boundary support: ${warning}`))
        }
      }

      const jsSuitePlan = rawJsSuitePlan
        ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
        : null

      if (jsSuitePlan) {
        summarizeBoundaryWarnings(jsSuitePlan.warnings)
        summarizeSuiteContracts(jsSuitePlan)
      }

      const resolvedJsGeneration = await resolveJsGeneration(
        markerAwareRecording,
        jsSuitePlan?.itGroups ?? toItGroups(analyzedRecording, normalizedRecording.title),
        {
          auth: visualAuth
            ? { path: resolve(projectRoot, visualAuth.path), strategy: visualAuth.strategy }
            : undefined,
          debugReporter,
        }
      )

      if (resolvedJsGeneration) {
        summarizeSelectorWarnings(resolvedJsGeneration.warnings)
      }

      const hydratedSuitePlan = jsSuitePlan
        ? rehydrateSuitePlan(
            jsSuitePlan,
            resolvedJsGeneration?.recording.steps ?? markerAwareRecording.steps
          )
        : jsSuitePlan
      const generationHelpers = hydratedSuitePlan
        ? stripSemanticMarkerStepsFromHelpers(hydratedSuitePlan.helpers)
        : undefined
      const generationScenarios =
        hydratedSuitePlan && generationHelpers
          ? stripSemanticMarkerStepsFromScenarios(hydratedSuitePlan.scenarios, generationHelpers)
          : undefined
      const generationItGroups = stripSemanticMarkerStepsFromItGroups(resolvedJsGeneration.itGroups)

      const generated = generateTestFromGroups(normalizedRecording.title, generationItGroups, {
        outputPath,
        conventions,
        runner: packageProfile?.effectiveRunner ?? 'unknown',
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        helpers: generationHelpers,
        scenarios: generationScenarios,
        renderTarget: generationRenderTarget,
        renderHelper: generationRenderHelper,
      })
      generated.code = applyBoundarySupport(generated.code, boundarySupportPlan)
      // Boundary warnings are injected into the file so downstream reviewers see policy issues even outside CLI output.
      const boundaryPolicyWarnings = await auditBoundaryPolicy(
        generated.code,
        packageProfile,
        resolvedRenderTargetFile
      )
      const markerCoverage = buildMarkerCoverageSummary({
        analyzedRecording,
        suitePlan: hydratedSuitePlan,
      })

      if (hydratedSuitePlan?.warnings.length) {
        generated.code = [
          ...hydratedSuitePlan.warnings.map((warning) => `// taro-boundary-warning: ${warning}`),
          generated.code,
        ].join('\n')
      }
      if (boundaryPolicyWarnings.length > 0) {
        generated.code = [
          ...boundaryPolicyWarnings.map((warning) => `// taro-boundary-warning: ${warning}`),
          generated.code,
        ].join('\n')
      }

      emitQuerySummary(resolvedJsGeneration?.queryResults ?? [])

      const markerDiagnostics = buildMarkerReviewDiagnostics(hydratedSuitePlan)
      const candidateFlowCoverage = buildFlowCoverageSummary(analyzedRecording, generated.code)
      const scoreResult = scoreGeneratedTest(generated.code, {
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        markerCoverage,
        markerDiagnostics,
      })
      const boundaryIssues = analyzeBoundaryIsolation(generated.code)
      const candidateAssessment: OutputAssessment = {
        flowCoverage: candidateFlowCoverage,
        scoreResult,
      }

      let shouldOverwriteExistingOutput = false
      if (await pathExists(outputPath)) {
        try {
          const existingCode = await readFile(outputPath, 'utf-8')
          const existingAssessment = await assessOutputAgainstRecording({
            analyzedRecording,
            code: existingCode,
          })
          // Existing output is only replaced when the new generation is measurably better on coverage or quality.
          shouldOverwriteExistingOutput =
            compareOutputAssessments(candidateAssessment, existingAssessment) > 0
          logExistingOutputDecision({
            outputPath,
            candidate: candidateAssessment,
            existing: existingAssessment,
            overwrite: shouldOverwriteExistingOutput,
          })

          if (!shouldOverwriteExistingOutput) {
            await debugReporter.persist()
            flushFindings(findings)
          }
        } catch (error) {
          console.warn(
            pc.yellow(
              `[taro] Existing output could not be assessed cleanly, so Taro will preserve it instead of overwriting blindly.`
            )
          )
          console.warn(pc.yellow(`[taro] Assessment detail: ${String(error)}`))
          await debugReporter.persist()
          flushFindings(findings)
        }
      }

      logScore(scoreResult)
      emitMarkerCoverageSection(scoreResult)
      emitRecoveredMarkerDiagnostics(hydratedSuitePlan)
      emitMarkerPlacementCorrections(hydratedSuitePlan)
      emitUnresolvedMarkerWarnings(hydratedSuitePlan)
      for (const warning of boundaryPolicyWarnings) {
        console.warn(pc.yellow(`[taro] Boundary policy: ${warning}`))
      }
      if (boundarySupportPlan.requiresReview) {
        console.warn(
          pc.yellow(
            '[taro] Boundary support requires manual review because one or more collaborators were scaffolded with generic defaults.'
          )
        )
      }
      emitLowConfidenceBanner(scoreResult)
      emitScoreHints(scoreResult, resolvedJsGeneration?.queryResults ?? [], boundaryIssues)

      try {
        // Materialize shared boundary helpers before writing the test that imports them.
        await materializeBoundarySupport(boundarySupportPlan)
        const result = await writeTestFile(generated.code, outputPath, {
          createDir: true,
          overwriteExisting: shouldOverwriteExistingOutput,
        })
        await finalizeGeneratedOutput({
          code: generated.code,
          outputPath: result.filePath,
          projectRoot,
          recordingFile: filePath,
          scoreResult,
          packageProfile,
        })
        const action = result.overwritten ? pc.yellow('Updated') : pc.green('Created')
        log(`${action}: ${pc.bold(result.filePath)}`)
      } catch (err) {
        await debugReporter.persist()
        process.stderr.write(pc.red('Error:') + ` ${String(err)}` + '\n')
        process.exit(2)
      }
      await debugReporter.persist()
      flushFindings(findings)
    })

  return generate
}
