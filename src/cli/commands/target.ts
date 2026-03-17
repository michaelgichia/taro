import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { cwd, stdin, stdout } from 'node:process'

import { Command } from 'commander'
import pc from 'picocolors'

import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from '#core/boundary-support.ts'
import { inferComponentTargetPlan } from '#core/component-targeting.ts'
import { emitQuerySummary, generateTestFromGroups } from '#core/generator.ts'
import { loadInput } from '#core/input-loader.ts'
import { analyzeRecording } from '#core/recording-intelligence.ts'
import { scoreGeneratedTest } from '#core/scorer.ts'
import { planJsSuite } from '#core/suite-planner.ts'
import {
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from '#core/state.ts'
import { verifySyntax } from '#core/verifier.ts'
import { writeTestFile } from '#core/writer.ts'
import { normalizeJsBaseline } from '#core/baseline-normalizer.ts'
import type { ResolvedTaroPackageProfile } from '#types/state.ts'
import type { QueryResult } from '#types/recording.ts'
import type { Finding } from '#core/findings-reporter.ts'

import {
  applyRepoRenderTarget,
  assessOutputAgainstRecording,
  auditBoundaryPolicy,
  buildFlowCoverageSummary,
  compareOutputAssessments,
  deriveOutputPath,
  finalizeGeneratedOutput,
  flushFindings,
  getPrimarySelector,
  hasInteractiveVisualAuthCapability,
  logExistingOutputDecision,
  mapParsedQueriesToResults,
  maybeAnalyzeMocks,
  maybeCaptureVisualState,
  rebaseRenderHelperImportPath,
  resolveJsGeneration,
  resolveOptionalFilePath,
  resolveVisualAuthStorageStatePath,
  toImportPath,
} from '#cli/commands/generate.utils.ts'
import { parseJsRecording } from '#core/js-parser.ts'

interface TargetCommandContext {
  input?: Pick<typeof stdin, 'isTTY'>
  output?: Pick<typeof stdout, 'isTTY'>
}

function log(message: string): void {
  process.stderr.write(message + '\n')
}

function isSupportedSourceFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath)
}

function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath)
}

function buildFallbackConventions(projectRoot: string) {
  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    importStyle: 'esm' as const,
    mockPattern: 'none' as const,
    testFiles: [],
    folderPattern: 'unknown' as const,
    fileExtension: 'ts' as const,
  }
}

async function loadPackageContext(params: {
  commandOptions: {
    auth?: string
    instructions?: string
  }
  outputPath: string
  projectRoot: string
}): Promise<{
  explicitAuthPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>
  explicitInstructionsPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>
  packageProfile: ResolvedTaroPackageProfile | null
  visualAuth: ResolvedTaroPackageProfile['playwrightAuth']
}> {
  const { commandOptions, outputPath, projectRoot } = params
  const hadState = await access(resolve(projectRoot, '.taro', 'state.json'))
    .then(() => true)
    .catch(() => false)

  if (!hadState) {
    await loadOrBootstrapTaroState(projectRoot)
  }

  const bootstrappedState = await loadOrBootstrapTaroState(projectRoot)
  const overrides = await readTaroOverrides(projectRoot)
  const packageProfile = resolveTaroPackageProfile(
    bootstrappedState.state,
    projectRoot,
    outputPath,
    overrides
  )

  if (packageProfile) {
    const staleness = await detectPackageProfileStaleness(projectRoot, packageProfile).catch(
      () => null
    )
    if (staleness?.stale) {
      await refreshTaroState(projectRoot).catch(() => undefined)
    }
  }

  const explicitAuthPath = await resolveOptionalFilePath(projectRoot, commandOptions.auth)
  const explicitInstructionsPath = await resolveOptionalFilePath(projectRoot, commandOptions.instructions)
  if (explicitAuthPath && explicitInstructionsPath) {
    console.warn(
      pc.yellow(
        '[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run.'
      )
    )
  }

  const visualAuth =
    explicitAuthPath
      ? {
          strategy: 'storageState' as const,
          path: explicitAuthPath.relativePath,
          detectedAt: 'generate' as const,
          source: 'manual' as const,
        }
      : explicitInstructionsPath
        ? {
            strategy: 'instructions' as const,
            path: explicitInstructionsPath.relativePath,
            detectedAt: 'generate' as const,
            source: 'manual' as const,
          }
        : packageProfile?.playwrightAuth ?? null

  return {
    explicitAuthPath,
    explicitInstructionsPath,
    packageProfile,
    visualAuth,
  }
}

function prependBoundaryWarnings(code: string, warnings: string[]): string {
  if (warnings.length === 0) {
    return code
  }

  return [
    ...warnings.map((warning) => `// taro-boundary-warning: ${warning}`),
    code,
  ].join('\n')
}

function normalizeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.category}:${finding.message}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function createTargetCommand(context: TargetCommandContext = {}): Command {
  const target = new Command('__target')

  target
    .description('Internal runtime-only generator for explicit component-target RTL generation')
    .argument('<component-file>', 'Path to the component file that should be tested')
    .option('--recording <file>', 'Optional path to a recorder export file (.js)')
    .option(
      '-i, --interactive-auth',
      'Force interactive Playwright auth recovery even when stdio is not detected as TTY'
    )
    .option('--auth <file>', 'Path to a Playwright storageState JSON file for optional visual capture')
    .option(
      '--instructions <file>',
      'Path to a non-secret auth instructions file for optional visual capture'
    )
    .option('--no-screenshots', 'Skip optional Playwright screenshots and visual inspection')
    .option('--debug-selectors', 'Reserved for recorder-backed target generation diagnostics')
    .option(
      '--debug-selectors-json <file>',
      'Reserved for recorder-backed target generation diagnostics'
    )
    .action(async (componentFile: string) => {
        try {
          const projectRoot = cwd()
          const componentPath = resolve(componentFile)
          const commandOptions = target.opts<{
            auth?: string
            debugSelectors?: boolean
            debugSelectorsJson?: string
            interactiveAuth?: boolean
            instructions?: string
            recording?: string
            screenshots?: boolean
          }>()

          try {
            await access(componentPath)
          } catch {
            const message = pc.red('Error:') + ` File not found or not accessible: ${componentPath}`
            console.error(message)
            process.stderr.write(message + '\n')
            process.exit(2)
          }

          if (!isSupportedSourceFile(componentPath) || isTestFilePath(componentPath)) {
            const message =
              pc.red('Error:') +
              ` Target component must be a source module (.ts/.tsx/.js/.jsx), not a test file: ${componentPath}`
            console.error(message)
            process.stderr.write(message + '\n')
            process.exit(2)
          }

          const outputPath = deriveOutputPath(componentPath)
          const {
            packageProfile,
            visualAuth,
          } = await loadPackageContext({
            commandOptions,
            outputPath,
            projectRoot,
          })

          const targetPlan = await inferComponentTargetPlan({
            componentPath,
            outputPath,
            projectRoot,
          })
          const renderTarget = {
            ...targetPlan.renderTarget,
            importPath: toImportPath(dirname(outputPath), componentPath),
            sourceTestFile: componentPath,
          }
          const renderHelper = rebaseRenderHelperImportPath({
            projectRoot,
            outputPath,
            renderHelper: packageProfile?.effectiveRenderHelper ?? null,
          })
          const mockAnalysis = await maybeAnalyzeMocks(projectRoot, packageProfile ?? null)
          const findings: Finding[] = [...targetPlan.findings]

          let analyzedRecording = targetPlan.analyzedRecording
          let queryResults: QueryResult[] = targetPlan.queryResults

          if (commandOptions.debugSelectors || commandOptions.debugSelectorsJson) {
            log(
              pc.dim('[taro]') +
                ' Selector-debug options currently apply only to Recorder-backed replay; component-only inference will ignore them.'
            )
          }

          if (commandOptions.recording) {
            const recordingPath = resolve(projectRoot, commandOptions.recording)
            try {
              await access(recordingPath)
            } catch {
              const message = pc.red('Error:') + ` File not found or not accessible: ${recordingPath}`
              console.error(message)
              process.stderr.write(message + '\n')
              process.exit(2)
            }

            const parsedInput = await loadInput(recordingPath)
            const normalizedRecording = normalizeJsBaseline(parsedInput)
            const earlyAnalyzedRecording = analyzeRecording(normalizedRecording)
            const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
              {
                input: context.input ?? stdin,
                output: context.output ?? stdout,
              },
              commandOptions.interactiveAuth === true
            )
            const visualState = await maybeCaptureVisualState({
              analyzedRecording: earlyAnalyzedRecording,
              auth: visualAuth ?? null,
              authRecovery:
                commandOptions.screenshots === false
                  ? undefined
                  : {
                      enabled: interactiveVisualAuth,
                      instructionsPath:
                        visualAuth?.strategy === 'instructions' ? visualAuth.path : undefined,
                      persistedAuthPath: resolveVisualAuthStorageStatePath(projectRoot, visualAuth ?? null)
                        .relativePath,
                      saveStorageStatePath: resolveVisualAuthStorageStatePath(projectRoot, visualAuth ?? null)
                        .absolutePath,
                      timeoutMs: 5 * 60 * 1000,
                    },
              projectRoot,
              recording: normalizedRecording,
              selector: getPrimarySelector(normalizedRecording),
              skipScreenshotArtifacts: commandOptions.screenshots === false,
              url: earlyAnalyzedRecording.url,
            })

            analyzedRecording = visualState
              ? analyzeRecording({
                  ...normalizedRecording,
                  steps: normalizedRecording.steps,
                })
              : earlyAnalyzedRecording

            const suitePlan = planJsSuite({
              recording: normalizedRecording,
              analyzedRecording,
              mockAnalysis: mockAnalysis ?? null,
              fallbackTitle: analyzedRecording.title,
            })
            const jsSuitePlan = applyRepoRenderTarget(suitePlan, renderTarget)
            const resolvedJsGeneration = await resolveJsGeneration(
              normalizedRecording,
              jsSuitePlan.itGroups,
              visualAuth
                ? {
                    auth: {
                      path: resolve(projectRoot, visualAuth.path),
                      strategy: visualAuth.strategy,
                    },
                  }
                : undefined
            )

            queryResults = resolvedJsGeneration.queryResults ?? queryResults

            const conventions = packageProfile?.conventions ?? buildFallbackConventions(projectRoot)
            const boundarySupportPlan = await planBoundarySupport({
              projectRoot,
              outputPath,
              packageProfile: packageProfile ?? null,
              renderTargetFile: componentPath,
              renderTarget,
            })
            const generated = generateTestFromGroups(analyzedRecording.title, resolvedJsGeneration.itGroups, {
              outputPath,
              conventions,
              runner: packageProfile?.effectiveRunner ?? 'unknown',
              jestDomImportPath:
                packageProfile?.jestDomSetup?.value === 'global-setup' ? null : undefined,
              queryResults,
              helpers: jsSuitePlan.helpers,
              scenarios: jsSuitePlan.scenarios,
              renderTarget,
              renderHelper,
            })
            let code = applyBoundarySupport(generated.code, boundarySupportPlan)
            code = prependBoundaryWarnings(
              code,
              [
                ...jsSuitePlan.warnings,
                ...(await auditBoundaryPolicy(code, packageProfile ?? null, null)),
              ]
            )

            const candidateParsed = await parseJsRecording(code)
            const candidateAssessment = {
              flowCoverage: buildFlowCoverageSummary(analyzedRecording, code),
              scoreResult: scoreGeneratedTest(code, {
                queryResults: mapParsedQueriesToResults(candidateParsed),
              }),
            }

            let existingCode: string | null = null
            let shouldOverwrite = true
            try {
              existingCode = await readFile(outputPath, 'utf-8')
            } catch (error: unknown) {
              const errCode = (error as NodeJS.ErrnoException)?.code
              if (errCode && errCode !== 'ENOENT') {
                throw error
              }
            }

            if (existingCode) {
              const existingAssessment = await assessOutputAgainstRecording({
                analyzedRecording,
                code: existingCode,
              })
              shouldOverwrite = compareOutputAssessments(candidateAssessment, existingAssessment) > 0
              logExistingOutputDecision({
                outputPath,
                candidate: candidateAssessment,
                existing: existingAssessment,
                overwrite: shouldOverwrite,
              })
            }

            if (shouldOverwrite) {
              await materializeBoundarySupport(boundarySupportPlan)
              await writeTestFile(code, outputPath, {
                createDir: true,
                overwriteExisting: Boolean(existingCode),
              })
              const verification = verifySyntax(code, outputPath)
              if (!verification.valid) {
                throw new Error(`Post-write verification failed: ${verification.error}`)
              }
              emitQuerySummary(queryResults)
              log(
                pc.green(`[taro] ${existingCode ? 'Updated' : 'Created'}: ${outputPath}`)
              )
              await finalizeGeneratedOutput({
                code,
                outputPath,
                projectRoot,
                recordingFile: recordingPath,
                scoreResult: candidateAssessment.scoreResult,
                packageProfile: packageProfile ?? null,
              })
            }

            flushFindings(normalizeFindings(findings))
          }

          if (findings.some((finding) => finding.severity === 'BLOCKING')) {
            flushFindings(normalizeFindings(findings))
          }

          const conventions = packageProfile?.conventions ?? buildFallbackConventions(projectRoot)
          const boundarySupportPlan = await planBoundarySupport({
            projectRoot,
            outputPath,
            packageProfile: packageProfile ?? null,
            renderTargetFile: componentPath,
            renderTarget,
          })
          const generated = generateTestFromGroups(analyzedRecording.title, analyzedRecording.intentGroups, {
            outputPath,
            conventions,
            runner: packageProfile?.effectiveRunner ?? 'unknown',
            jestDomImportPath:
              packageProfile?.jestDomSetup?.value === 'global-setup' ? null : undefined,
            queryResults,
            renderTarget,
            renderHelper,
          })
          let code = applyBoundarySupport(generated.code, boundarySupportPlan)
          code = prependBoundaryWarnings(
            code,
            await auditBoundaryPolicy(code, packageProfile ?? null, null)
          )
          const scoreResult = scoreGeneratedTest(code, { queryResults })
          const candidateAssessment = {
            flowCoverage: buildFlowCoverageSummary(analyzedRecording, code),
            scoreResult,
          }

          let existingCode: string | null = null
          let shouldOverwrite = true
          try {
            existingCode = await readFile(outputPath, 'utf-8')
          } catch (error: unknown) {
            const errCode = (error as NodeJS.ErrnoException)?.code
            if (errCode && errCode !== 'ENOENT') {
              throw error
            }
          }

          if (existingCode) {
            const existingAssessment = await assessOutputAgainstRecording({
              analyzedRecording,
              code: existingCode,
            })
            shouldOverwrite = compareOutputAssessments(candidateAssessment, existingAssessment) > 0
            logExistingOutputDecision({
              outputPath,
              candidate: candidateAssessment,
              existing: existingAssessment,
              overwrite: shouldOverwrite,
            })
          }

          if (shouldOverwrite) {
            await materializeBoundarySupport(boundarySupportPlan)
            await writeTestFile(code, outputPath, {
              createDir: true,
              overwriteExisting: Boolean(existingCode),
            })
            const verification = verifySyntax(code, outputPath)
            if (!verification.valid) {
              throw new Error(`Post-write verification failed: ${verification.error}`)
            }
            emitQuerySummary(queryResults)
            log(pc.green(`[taro] ${existingCode ? 'Updated' : 'Created'}: ${outputPath}`))
            await finalizeGeneratedOutput({
              code,
              outputPath,
              projectRoot,
              recordingFile: componentPath,
              scoreResult,
              packageProfile: packageProfile ?? null,
            })
          }

          flushFindings(normalizeFindings(findings))
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'constructor' in error &&
            (error as { constructor?: { name?: string } }).constructor?.name === 'ProcessExitSignal'
          ) {
            throw error
          }

          const message =
            error instanceof Error ? error.message : 'Target generation failed with an unknown error.'
          console.error(pc.red('Error:') + ` ${message}`)
          process.stderr.write(pc.red('Error:') + ` ${message}\n`)
          process.exit(2)
        }
    })

  return target
}
