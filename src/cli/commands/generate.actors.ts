// src/cli/commands/generate.actors.ts
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import pc from "picocolors";
import { fromPromise } from "xstate";

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
  RunHealthCommandsActorInput,
  SearchContextActorInput,
  ValidateFileActorInput,
  WriteOutputActorInput,
} from "#cli/commands/generate.utils.ts";
import {
  applyRepoRenderTarget,
  assessOutputAgainstRecording,
  auditBoundaryPolicy,
  buildFlowCoverageSummary,
  buildMarkerCoverageSummary,
  buildMarkerReviewDiagnostics,
  collectRepoContextSearchTerms,
  deriveContextRenderTargets,
  deriveOutputPath,
  findRecordingUrl,
  findRepoContextMatches,
  getPrimarySelector,
  hasInteractiveVisualAuthCapability,
  MANUAL_VISUAL_AUTH_TIMEOUT_MS,
  mapParsedQueriesToResults,
  maybeCaptureVisualState,
  mergeAnalyzedStepState,
  persistRecoveredVisualAuth,
  rebaseRenderHelperImportPath,
  reconcileExistingOutput,
  rehydrateSuitePlan,
  resolveJsGeneration,
  resolveOptionalFilePath,
  resolvePackageProfileFromContextMatches,
  resolveRenderTargetFile,
  resolveRepoRenderTarget,
  resolveVisualAuthStorageStatePath,
  stripSemanticMarkerStepsFromHelpers,
  stripSemanticMarkerStepsFromItGroups,
  stripSemanticMarkerStepsFromScenarios,
  toImportPath,
  toItGroups,
} from "#cli/commands/generate.utils.ts";
import { normalizeJsBaseline } from "#core/baseline-normalizer.ts";
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from "#core/boundary-support.ts";
import { loadComponentScoreContext } from "#core/component-score-context.ts";
import { emitQuerySummary, generateTestFromGroups } from "#core/generator.ts";
import { loadInput } from "#core/input-loader.ts";
import { parseJsRecording } from "#core/js-parser.ts";
import { analyzeMocks } from "#core/mock-intelligence.ts";
import { analyzeRecording } from "#core/recording-intelligence.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import { enrichCanonicalSemanticMarkers } from "#core/semantic-marker-enrichment.ts";
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from "#core/state.ts";
import { planJsSuite } from "#core/suite-planner.ts";
import { verifySyntax } from "#core/verifier.ts";
import { writeTestFile } from "#core/writer.ts";

export const validateFileActor = fromPromise(
  async ({ input }: { input: ValidateFileActorInput }) => {
    try {
      await access(input.filePath);
    } catch {
      throw new Error(`File not found or not accessible: ${input.filePath}`);
    }
  }
);

export const parseRecordingActor = fromPromise(
  async ({ input }: { input: ParseRecordingActorInput }) => {
    const parsedInput = await loadInput(input.filePath);
    const normalizedRecording = normalizeJsBaseline(parsedInput);
    const defaultOutputPath = deriveOutputPath(input.filePath);
    return { normalizedRecording, defaultOutputPath };
  }
);

export const loadStateActor = fromPromise(
  async ({ input }: { input: LoadStateActorInput }) => {
    const { projectRoot, commandOptions } = input;
    const hadState = await access(join(projectRoot, ".taro", "state.json"))
      .then(() => true)
      .catch(() => false);
    const bootstrappedState = await loadOrBootstrapTaroState(projectRoot);
    const overrides = await readTaroOverrides(projectRoot);
    const colocatedOutputPath = deriveOutputPath(input.filePath);
    const packageProfile = resolveTaroPackageProfile(
      bootstrappedState.state,
      projectRoot,
      colocatedOutputPath,
      overrides
    );
    const folderPattern = packageProfile?.folderPattern.value;
    const defaultOutputPath = deriveOutputPath(input.filePath, folderPattern);
    const explicitAuthPath = await resolveOptionalFilePath(
      projectRoot,
      commandOptions.auth
    );
    const explicitInstructionsPath = await resolveOptionalFilePath(
      projectRoot,
      commandOptions.instructions
    );
    if (explicitAuthPath && explicitInstructionsPath) {
      console.warn(
        pc.yellow(
          "[taro] Visual auth: both --auth and --instructions were provided; preferring --auth for this run."
        )
      );
    }
    const visualAuth = explicitAuthPath
      ? {
          strategy: "storageState" as const,
          path: explicitAuthPath.relativePath,
          detectedAt: "generate" as const,
          source: "manual" as const,
        }
      : explicitInstructionsPath
        ? {
            strategy: "instructions" as const,
            path: explicitInstructionsPath.relativePath,
            detectedAt: "generate" as const,
            source: "manual" as const,
          }
        : (packageProfile?.playwrightAuth ?? null);
    return {
      hadState,
      bootstrappedState,
      overrides,
      packageProfile,
      defaultOutputPath,
      explicitAuthPath,
      explicitInstructionsPath,
      visualAuth,
    };
  }
);

export const captureVisualActor = fromPromise(
  async ({ input }: { input: CaptureVisualActorInput }) => {
    const {
      normalizedRecording,
      visualAuth,
      projectRoot,
      stdioContext,
      commandOptions,
    } = input;
    const earlyAnalyzedRecording = analyzeRecording(normalizedRecording!);
    const recordingUrl = findRecordingUrl(earlyAnalyzedRecording);
    const recoveryStorageStatePath = resolveVisualAuthStorageStatePath(
      projectRoot,
      visualAuth ?? null
    );
    const authInstructionsPath =
      visualAuth?.strategy === "instructions" ? visualAuth.path : undefined;
    const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
      stdioContext ?? {},
      commandOptions.interactiveAuth === true
    );
    const visualState = await maybeCaptureVisualState({
      analyzedRecording: earlyAnalyzedRecording,
      auth: visualAuth ?? null,
      authRecovery:
        commandOptions.screenshots !== false
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
    });
    return { earlyAnalyzedRecording, recordingUrl, visualState };
  }
);

export const searchContextActor = fromPromise(
  async ({ input }: { input: SearchContextActorInput }) => {
    const {
      normalizedRecording,
      visualState,
      projectRoot,
      defaultOutputPath,
      filePath,
    } = input;
    const contextSearchTerms = collectRepoContextSearchTerms(
      normalizedRecording!,
      visualState ?? null
    );
    const contextMatches = await findRepoContextMatches({
      projectRoot,
      terms: contextSearchTerms,
      excludePaths: [filePath!, defaultOutputPath!],
    });
    const enrichedRecording = await enrichCanonicalSemanticMarkers({
      contextMatches,
      projectRoot,
      recording: normalizedRecording!,
    });
    return { normalizedRecording: enrichedRecording, contextMatches };
  }
);

export const refineProfileActor = fromPromise(
  async ({ input }: { input: RefineProfileActorInput }) => {
    const {
      bootstrappedState,
      packageProfile,
      projectRoot,
      overrides,
      contextMatches,
    } = input;
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState!.state,
      currentProfile: packageProfile ?? null,
      projectRoot,
      overrides: overrides!,
      matches: contextMatches ?? [],
    });
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null;
    return {
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    };
  }
);

export const refreshProfileActor = fromPromise(
  async ({ input }: { input: RefreshProfileActorInput }) => {
    const { projectRoot, contextMatches } = input;
    const bootstrappedState = await refreshTaroState(projectRoot);
    const freshOverrides = await readTaroOverrides(projectRoot);
    const defaultOutputPath = ".";
    const baseProfile = resolveTaroPackageProfile(
      bootstrappedState.state,
      projectRoot,
      defaultOutputPath,
      freshOverrides
    );
    const contextProfile = resolvePackageProfileFromContextMatches({
      state: bootstrappedState.state,
      currentProfile: baseProfile,
      projectRoot,
      overrides: freshOverrides,
      matches: contextMatches ?? [],
    });
    const staleness = contextProfile.profile
      ? await detectPackageProfileStaleness(projectRoot, contextProfile.profile)
      : null;
    return {
      bootstrappedState,
      overrides: freshOverrides,
      packageProfile: contextProfile.profile,
      contextProfileReason: contextProfile.reason,
      staleness,
    };
  }
);

export const analyzeRecordingActor = fromPromise(
  async ({ input }: { input: AnalyzeRecordingActorInput }) => {
    const {
      normalizedRecording,
      packageProfile,
      projectRoot,
      visualState,
      visualAuth,
      explicitAuthPath,
      explicitInstructionsPath,
    } = input;
    const analyzedRecording = analyzeRecording(normalizedRecording!);
    const markerAwareRecording = mergeAnalyzedStepState(
      normalizedRecording!,
      analyzedRecording
    );
    const recoveredVisualAuth = await persistRecoveredVisualAuth({
      packageProfile: packageProfile ?? null,
      projectRoot,
      visualState: visualState ?? null,
    });

    // Persist explicit auth (--auth or --instructions flag) if a package profile is available
    const explicitAuth = explicitAuthPath ?? explicitInstructionsPath;
    if (explicitAuth && visualAuth) {
      if (!packageProfile) {
        console.warn(
          pc.yellow(
            "Visual auth: using the explicit auth path for this run, but no package profile was available to persist it."
          )
        );
      } else {
        try {
          const persisted = await persistPlaywrightAuthProfile(
            projectRoot,
            packageProfile.packagePath,
            visualAuth
          );
          if (persisted) {
            process.stderr.write(
              pc.dim("[taro]") +
                ` Persisted visual auth for package ${packageProfile.packagePath}: ${visualAuth.strategy}=${visualAuth.path}` +
                "\n"
            );
          } else {
            console.warn(
              pc.yellow(
                "Visual auth: resolved the auth path for this run but could not persist it in state."
              )
            );
          }
        } catch {
          console.warn(
            pc.yellow(
              "Visual auth: resolved the auth path for this run but could not persist it in state."
            )
          );
        }
      }
    }

    const updatedVisualAuth = recoveredVisualAuth ?? visualAuth ?? null;
    return {
      analyzedRecording,
      markerAwareRecording,
      recoveredVisualAuth,
      visualAuth: updatedVisualAuth,
    };
  }
);

export const analyzeMocksActor = fromPromise(
  async ({ input }: { input: AnalyzeMocksActorInput }) => {
    const mockAnalysis = await (async () => {
      try {
        return await analyzeMocks(input.projectRoot, {
          packageProfile: input.packageProfile ?? null,
        });
      } catch {
        return null;
      }
    })();
    return { mockAnalysis };
  }
);

export const planGenerationActor = fromPromise(
  async ({ input }: { input: PlanGenerationActorInput }) => {
    const {
      markerAwareRecording,
      analyzedRecording,
      mockAnalysis,
      normalizedRecording,
      packageProfile,
      projectRoot,
      defaultOutputPath,
      contextMatches,
      visualState,
    } = input;
    const contextRenderTargets = deriveContextRenderTargets({
      projectRoot,
      outputPath: defaultOutputPath!,
      matches: contextMatches ?? [],
    });
    const repoRenderTargets = [
      ...contextRenderTargets,
      ...(packageProfile?.renderTargets ?? []),
    ];
    const rawJsSuitePlan = planJsSuite({
      recording: markerAwareRecording!,
      analyzedRecording: analyzedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      fallbackTitle: normalizedRecording!.title,
    });
    const repoRenderTarget = resolveRepoRenderTarget({
      candidates: repoRenderTargets,
      packageProfile,
      recording: normalizedRecording!,
      mockAnalysis: mockAnalysis ?? null,
      suitePlan: rawJsSuitePlan,
      visualState: visualState ?? null,
    });
    const resolvedRenderTargetFile = await resolveRenderTargetFile({
      projectRoot,
      renderTarget: repoRenderTarget,
    });
    const outputPath = resolvedRenderTargetFile
      ? deriveOutputPath(resolvedRenderTargetFile)
      : defaultOutputPath!;
    const generationRenderTarget =
      repoRenderTarget && resolvedRenderTargetFile
        ? {
            ...repoRenderTarget,
            importPath: toImportPath(
              dirname(outputPath),
              resolvedRenderTargetFile
            ),
          }
        : repoRenderTarget;
    const generationRenderHelper = rebaseRenderHelperImportPath({
      projectRoot,
      outputPath,
      renderHelper: packageProfile?.effectiveRenderHelper ?? null,
    });
    const boundarySupportPlan = await planBoundarySupport({
      projectRoot,
      outputPath,
      packageProfile: packageProfile ?? null,
      renderTargetFile: resolvedRenderTargetFile,
      renderTarget: repoRenderTarget,
    });
    const componentScoreContext = resolvedRenderTargetFile
      ? await loadComponentScoreContext(resolvedRenderTargetFile)
      : null;
    const jsSuitePlan = rawJsSuitePlan
      ? applyRepoRenderTarget(rawJsSuitePlan, repoRenderTarget)
      : null;
    return {
      jsSuitePlan,
      outputPath,
      resolvedRenderTargetFile,
      boundarySupportPlan,
      generationRenderTarget,
      componentScoreContext,
      generationRenderHelper,
    };
  }
);

export const resolveSelectorsActor = fromPromise(
  async ({ input }: { input: ResolveSelectorsActorInput }) => {
    const {
      markerAwareRecording,
      jsSuitePlan,
      analyzedRecording,
      normalizedRecording,
      visualAuth,
      projectRoot,
      debugReporter,
    } = input;
    const itGroups =
      jsSuitePlan?.itGroups ??
      toItGroups(analyzedRecording!, normalizedRecording!.title);
    const resolvedJsGeneration = await resolveJsGeneration(
      markerAwareRecording!,
      itGroups,
      {
        auth: visualAuth
          ? {
              path: resolve(projectRoot, visualAuth.path),
              strategy: visualAuth.strategy,
            }
          : undefined,
        debugReporter,
      }
    );
    return { resolvedJsGeneration };
  }
);

export const generateCodeActor = fromPromise(
  async ({ input }: { input: GenerateCodeActorInput }) => {
    const {
      normalizedRecording,
      resolvedJsGeneration,
      jsSuitePlan,
      outputPath,
      packageProfile,
      boundarySupportPlan,
      generationRenderTarget,
      componentScoreContext,
      generationRenderHelper,
      analyzedRecording,
    } = input;
    const conventions = packageProfile?.conventions ?? {
      scannedAt: new Date().toISOString(),
      projectRoot: "",
      importStyle: "esm" as const,
      mockPattern: "none" as const,
      testFiles: [],
      folderPattern: "unknown" as const,
      fileExtension: "ts" as const,
    };
    const hydratedSuitePlan = jsSuitePlan
      ? rehydrateSuitePlan(jsSuitePlan, resolvedJsGeneration!.recording.steps)
      : null;
    const generationHelpers = hydratedSuitePlan
      ? stripSemanticMarkerStepsFromHelpers(hydratedSuitePlan.helpers)
      : undefined;
    const generationScenarios =
      hydratedSuitePlan && generationHelpers
        ? stripSemanticMarkerStepsFromScenarios(
            hydratedSuitePlan.scenarios,
            generationHelpers
          )
        : undefined;
    const generationItGroups = stripSemanticMarkerStepsFromItGroups(
      resolvedJsGeneration!.itGroups
    );
    const generated = generateTestFromGroups(
      normalizedRecording!.title,
      generationItGroups,
      {
        outputPath: outputPath!,
        conventions,
        runner: packageProfile?.effectiveRunner ?? "unknown",
        jestDomImportPath:
          packageProfile?.jestDomSetup?.value === "global-setup"
            ? null
            : undefined,
        queryResults: resolvedJsGeneration?.queryResults ?? [],
        helpers: generationHelpers,
        scenarios: generationScenarios,
        renderTarget: generationRenderTarget ?? undefined,
        renderHelper: generationRenderHelper ?? undefined,
      }
    );
    let code = applyBoundarySupport(generated.code, boundarySupportPlan!);
    const boundaryPolicyWarnings = await auditBoundaryPolicy(
      code,
      packageProfile ?? null,
      null
    );
    if (hydratedSuitePlan?.warnings.length) {
      code = [
        ...hydratedSuitePlan.warnings.map(
          (w) => `// taro-boundary-warning: ${w}`
        ),
        code,
      ].join("\n");
    }
    if (boundaryPolicyWarnings.length > 0) {
      code = [
        ...boundaryPolicyWarnings.map((w) => `// taro-boundary-warning: ${w}`),
        code,
      ].join("\n");
    }
    const markerCoverage = buildMarkerCoverageSummary({
      analyzedRecording: analyzedRecording!,
      suitePlan: hydratedSuitePlan,
    });
    const markerDiagnostics = buildMarkerReviewDiagnostics(hydratedSuitePlan);
    const scoreResult = scoreGeneratedTest(code, {
      ...(componentScoreContext ?? {}),
      queryResults: resolvedJsGeneration?.queryResults ?? [],
      markerCoverage,
      markerDiagnostics,
    });
    const flowCoverage = buildFlowCoverageSummary(analyzedRecording!, code);
    const candidateAssessment = { flowCoverage, scoreResult };
    emitQuerySummary(resolvedJsGeneration?.queryResults ?? []);
    return {
      generatedCode: code,
      hydratedSuitePlan,
      scoreResult,
      boundaryPolicyWarnings,
      candidateAssessment,
    };
  }
);

export const assessOutputActor = fromPromise(
  async ({ input }: { input: AssessOutputActorInput }) => {
    const {
      outputPath,
      generatedCode,
      analyzedRecording,
      candidateAssessment,
    } = input;
    let existingCode: string | null = null;
    try {
      existingCode = await readFile(outputPath!, "utf-8");
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        const outputResolution = await reconcileExistingOutput({
          analyzedRecording: analyzedRecording!,
          candidateAssessment: candidateAssessment!,
          candidateCode: generatedCode!,
          existingAssessment: null,
          existingCode: null,
        });
        return {
          existingCode: null,
          existingAssessment: null,
          outputResolution,
        };
      }
      // Other errors (EISDIR, EACCES, etc.) — cannot assess, preserve existing
      throw err;
    }
    const existingAssessment = await assessOutputAgainstRecording({
      analyzedRecording: analyzedRecording!,
      code: existingCode,
      componentScoreContext: input.componentScoreContext ?? null,
    });
    const resolvedCandidateAssessment = candidateAssessment ?? {
      flowCoverage: buildFlowCoverageSummary(
        analyzedRecording!,
        generatedCode!
      ),
      scoreResult: scoreGeneratedTest(generatedCode!, {
        ...(input.componentScoreContext ?? {}),
        queryResults: mapParsedQueriesToResults(
          await parseJsRecording(generatedCode!),
          generatedCode!
        ),
      }),
    };
    const outputResolution = await reconcileExistingOutput({
      analyzedRecording: analyzedRecording!,
      candidateAssessment: resolvedCandidateAssessment,
      candidateCode: generatedCode!,
      existingAssessment,
      existingCode,
    });
    return { existingCode, existingAssessment, outputResolution };
  }
);

export const writeOutputActor = fromPromise(
  async ({ input }: { input: WriteOutputActorInput }) => {
    await materializeBoundarySupport(input.boundarySupportPlan!);
    await writeTestFile(input.generatedCode!, input.outputPath!, {
      createDir: true,
      overwriteExisting: input.shouldOverwrite ?? false,
    });
  }
);

export const finalizeActor = fromPromise(
  async ({ input }: { input: FinalizeActorInput }) => {
    const {
      generatedCode,
      outputPath,
      projectRoot,
      filePath,
      scoreResult,
      packageProfile,
    } = input;
    const verification = verifySyntax(generatedCode!, outputPath!);
    if (!verification.valid) {
      throw new Error(`Post-write verification failed: ${verification.error}`);
    }
    try {
      await appendGeneratedTestRecord(projectRoot, {
        packagePath: packageProfile?.packagePath ?? ".",
        recordingFile: filePath,
        testFile: outputPath!,
        scoreResult: scoreResult!,
      });
      process.stderr.write(
        pc.dim("[taro]") +
          ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? "."}.` +
          "\n"
      );
    } catch {
      // state updates are best-effort
    }
  }
);

function runCommand(cmd: string, cwd: string): Promise<{ exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      shell: true,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().trimEnd().split("\n")) {
        process.stderr.write(pc.dim("[taro:health]") + " " + line + "\n");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().trimEnd().split("\n")) {
        process.stderr.write(pc.dim("[taro:health]") + " " + line + "\n");
      }
    });
    child.on("close", (code) => resolve({ exitCode: code ?? 1 }));
  });
}

export const runHealthCommandsActor = fromPromise(
  async ({ input }: { input: RunHealthCommandsActorInput }) => {
    const { overrides, projectRoot } = input;
    const commands = overrides?.healthCommands;
    if (!commands || commands.length === 0) return;
    process.stderr.write(pc.dim("[taro]") + " Running health checks...\n");
    for (const cmd of commands) {
      process.stderr.write(pc.dim("[taro:health]") + ` $ ${cmd}\n`);
      const { exitCode } = await runCommand(cmd, projectRoot);
      if (exitCode !== 0) {
        process.stderr.write(
          pc.yellow(`[taro:health] ⚠ '${cmd}' exited with code ${exitCode}`) +
            "\n"
        );
      } else {
        process.stderr.write(pc.dim(`[taro:health] ✓ ${cmd}`) + "\n");
      }
    }
  }
);
