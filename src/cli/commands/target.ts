import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { cwd, stdin, stdout } from "node:process";

import { Command } from "commander";
import pc from "picocolors";

import { auditBoundaryPolicy } from "#cli/commands/boundary-policy.ts";
import { applyRepoRenderTarget } from "#cli/commands/context-selection.ts";
import {
  createDirectoryLoopTracker,
  type DirectoryLoopTracker,
  updateDirectoryLoopTrackerStatus,
  writeDirectoryLoopTracker,
} from "#cli/commands/target-directory-tracker.ts";
import { flushFindings } from "#cli/commands/generate-findings.ts";
import { toImportPath } from "#cli/commands/generate-paths.ts";
import {
  finalizeGeneratedOutput,
  maybeAnalyzeMocks,
} from "#cli/commands/generate-postprocess.ts";
import { getPrimarySelector } from "#cli/commands/generate-recording.ts";
import { logToStderr as log } from "#cli/commands/log.ts";
import {
  assessOutputAgainstRecording,
  buildFlowCoverageSummary,
  deriveOutputPath,
  logExistingOutputDecision,
  mapParsedQueriesToResults,
  rebaseRenderHelperImportPath,
  reconcileExistingOutput,
} from "#cli/commands/output-reconciliation.ts";
import { resolveJsGeneration } from "#cli/commands/selector-resolution.ts";
import {
  hasInteractiveVisualAuthCapability,
  maybeCaptureVisualState,
  resolveOptionalFilePath,
  resolveVisualAuthStorageStatePath,
} from "#cli/commands/visual-auth.ts";
import { normalizeJsBaseline } from "#core/baseline-normalizer.ts";
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from "#core/boundary-support.ts";
import { loadComponentScoreContext } from "#core/component-score-context.ts";
import { inferComponentTargetPlan } from "#core/component-targeting.ts";
import type { Finding } from "#core/findings-reporter.ts";
import { emitQuerySummary, generateTestFromGroups } from "#core/generator.ts";
import { loadInput } from "#core/input-loader.ts";
import { parseJsRecording } from "#core/js-parser.ts";
import { analyzeRecording } from "#core/recording-intelligence.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import {
  detectPackageProfileStaleness,
  loadOrBootstrapTaroState,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
} from "#core/state.ts";
import { planJsSuite } from "#core/suite-planner.ts";
import { verifySyntax } from "#core/verifier.ts";
import { writeTestFile } from "#core/writer.ts";
import type { QueryResult } from "#types/recording.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";
import type { TaroFolderPattern } from "#types/state.ts";

interface TargetCommandContext {
  input?: Pick<typeof stdin, "isTTY">;
  output?: Pick<typeof stdout, "isTTY">;
}

interface CommandOptions {
  auth?: string;
  debugSelectors?: boolean;
  debugSelectorsJson?: string;
  directoryLoop?: boolean;
  interactiveAuth?: boolean;
  instructions?: string;
  recording?: string;
  screenshots?: boolean;
}

function isSupportedSourceFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath);
}

function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function buildFallbackConventions(projectRoot: string) {
  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    importStyle: "esm" as const,
    mockPattern: "none" as const,
    testFiles: [],
    folderPattern: "unknown" as const,
    fileExtension: "ts" as const,
  };
}

async function loadPackageContext(params: {
  commandOptions: { auth?: string; instructions?: string };
  targetPath: string;
  projectRoot: string;
}): Promise<{
  explicitAuthPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>;
  explicitInstructionsPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>;
  packageProfile: ResolvedTaroPackageProfile | null;
  visualAuth: ResolvedTaroPackageProfile["playwrightAuth"];
}> {
  const { commandOptions, targetPath, projectRoot } = params;
  const hadState = await access(resolve(projectRoot, ".taro", "state.json"))
    .then(() => true)
    .catch(() => false);

  if (!hadState) {
    await loadOrBootstrapTaroState(projectRoot);
  }

  const bootstrappedState = await loadOrBootstrapTaroState(projectRoot);
  const overrides = await readTaroOverrides(projectRoot);
  const packageProfile = resolveTaroPackageProfile(
    bootstrappedState.state,
    projectRoot,
    targetPath,
    overrides
  );

  if (packageProfile) {
    const staleness = await detectPackageProfileStaleness(
      projectRoot,
      packageProfile
    ).catch(() => null);
    if (staleness?.stale) {
      await refreshTaroState(projectRoot).catch(() => undefined);
    }
  }

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
    explicitAuthPath,
    explicitInstructionsPath,
    packageProfile,
    visualAuth,
  };
}

function isConcreteFolderPattern(
  folderPattern?: TaroFolderPattern | null
): folderPattern is "colocated" | "__tests__" | "tests" {
  return (
    folderPattern === "colocated" ||
    folderPattern === "__tests__" ||
    folderPattern === "tests"
  );
}

async function hasImmediateTestFiles(dirPath: string): Promise<boolean> {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(
    () => null
  );
  if (!entries) {
    return false;
  }

  return entries.some(
    (entry) =>
      entry.isFile() && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
  );
}

async function detectLocalOutputFolderPattern(
  componentPath: string
): Promise<TaroFolderPattern | null> {
  const componentDir = dirname(componentPath);
  const componentName =
    basename(componentPath).replace(/\.[cm]?[jt]sx?$/u, "") || "Component";

  const explicitCandidates: Array<[TaroFolderPattern, string]> = [
    ["tests", join(componentDir, "tests", `${componentName}.test.tsx`)],
    ["__tests__", join(componentDir, "__tests__", `${componentName}.test.tsx`)],
    ["colocated", join(componentDir, `${componentName}.test.tsx`)],
  ];

  for (const [folderPattern, filePath] of explicitCandidates) {
    const exists = await access(filePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return folderPattern;
    }
  }

  if (await hasImmediateTestFiles(join(componentDir, "tests"))) {
    return "tests";
  }

  if (await hasImmediateTestFiles(join(componentDir, "__tests__"))) {
    return "__tests__";
  }

  return null;
}

function prependBoundaryWarnings(code: string, warnings: string[]): string {
  if (warnings.length === 0) {
    return code;
  }

  return [
    ...warnings.map((warning) => `// taro-boundary-warning: ${warning}`),
    code,
  ].join("\n");
}

function normalizeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.category}:${finding.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function collectSourceFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (filePath) => isSupportedSourceFile(filePath) && !isTestFilePath(filePath)
    )
    .sort();
}

async function generateForFile(params: {
  componentPath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
  context: TargetCommandContext;
}): Promise<Finding[]> {
  const { componentPath, projectRoot, commandOptions, context } = params;

  const { packageProfile, visualAuth } = await loadPackageContext({
    commandOptions,
    targetPath: componentPath,
    projectRoot,
  });
  const localFolderPattern =
    await detectLocalOutputFolderPattern(componentPath);
  const outputPath = deriveOutputPath(
    componentPath,
    localFolderPattern ??
      (isConcreteFolderPattern(packageProfile?.folderPattern.value)
        ? packageProfile.folderPattern.value
        : undefined)
  );

  const targetPlan = await inferComponentTargetPlan({
    componentPath,
    outputPath,
    projectRoot,
  });
  const componentScoreContext = await loadComponentScoreContext(componentPath);
  const renderTarget = {
    ...targetPlan.renderTarget,
    importPath: toImportPath(dirname(outputPath), componentPath),
    sourceTestFile: componentPath,
  };
  const renderHelper = rebaseRenderHelperImportPath({
    projectRoot,
    outputPath,
    renderHelper: packageProfile?.effectiveRenderHelper ?? null,
  });
  const mockAnalysis = await maybeAnalyzeMocks(
    projectRoot,
    packageProfile ?? null
  );
  const findings: Finding[] = [...targetPlan.findings];

  let analyzedRecording = targetPlan.analyzedRecording;
  let queryResults: QueryResult[] = targetPlan.queryResults;
  const allowsDraftOutput =
    targetPlan.renderExpression?.includes("UNRESOLVED_COMPONENT_PROPS") ??
    false;

  if (commandOptions.debugSelectors || commandOptions.debugSelectorsJson) {
    log(
      pc.dim("[taro]") +
        " Selector-debug options currently apply only to Recorder-backed replay; component-only inference will ignore them."
    );
  }

  if (commandOptions.recording) {
    const recordingPath = resolve(projectRoot, commandOptions.recording);
    try {
      await access(recordingPath);
    } catch {
      throw new Error(`File not found or not accessible: ${recordingPath}`);
    }

    const parsedInput = await loadInput(recordingPath);
    const normalizedRecording = normalizeJsBaseline(parsedInput);
    const earlyAnalyzedRecording = analyzeRecording(normalizedRecording);
    const interactiveVisualAuth = hasInteractiveVisualAuthCapability(
      { input: context.input ?? stdin, output: context.output ?? stdout },
      commandOptions.interactiveAuth === true
    );
    const visualState = await maybeCaptureVisualState({
      analyzedRecording: earlyAnalyzedRecording,
      auth: visualAuth ?? null,
      authRecovery:
        commandOptions.screenshots === false
          ? undefined
          : {
              enabled: interactiveVisualAuth,
              instructionsPath:
                visualAuth?.strategy === "instructions"
                  ? visualAuth.path
                  : undefined,
              persistedAuthPath: resolveVisualAuthStorageStatePath(
                projectRoot,
                visualAuth ?? null
              ).relativePath,
              saveStorageStatePath: resolveVisualAuthStorageStatePath(
                projectRoot,
                visualAuth ?? null
              ).absolutePath,
              timeoutMs: 5 * 60 * 1000,
            },
      projectRoot,
      recording: normalizedRecording,
      selector: getPrimarySelector(normalizedRecording),
      skipScreenshotArtifacts: commandOptions.screenshots === false,
      url: earlyAnalyzedRecording.url,
    });

    analyzedRecording = visualState
      ? analyzeRecording({
          ...normalizedRecording,
          steps: normalizedRecording.steps,
        })
      : earlyAnalyzedRecording;

    const suitePlan = planJsSuite({
      recording: normalizedRecording,
      analyzedRecording,
      mockAnalysis: mockAnalysis ?? null,
      fallbackTitle: analyzedRecording.title,
    });
    const jsSuitePlan = applyRepoRenderTarget(suitePlan, renderTarget);
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
    );

    queryResults = resolvedJsGeneration.queryResults ?? queryResults;

    const conventions =
      packageProfile?.conventions ?? buildFallbackConventions(projectRoot);
    const boundarySupportPlan = await planBoundarySupport({
      projectRoot,
      outputPath,
      packageProfile: packageProfile ?? null,
      renderTargetFile: componentPath,
      renderTarget,
    });
    const generated = generateTestFromGroups(
      analyzedRecording.title,
      resolvedJsGeneration.itGroups,
      {
        outputPath,
        conventions,
        runner: packageProfile?.effectiveRunner ?? "unknown",
        jestDomImportPath:
          packageProfile?.jestDomSetup?.value === "global-setup"
            ? null
            : undefined,
        queryResults,
        helpers: jsSuitePlan.helpers,
        scenarios: jsSuitePlan.scenarios,
        renderTarget,
        renderHelper,
      }
    );
    let code = applyBoundarySupport(generated.code, boundarySupportPlan);
    code = prependBoundaryWarnings(code, [
      ...jsSuitePlan.warnings,
      ...(await auditBoundaryPolicy(code, packageProfile ?? null, null)),
    ]);

    const candidateParsed = await parseJsRecording(code);
    const candidateAssessment = {
      flowCoverage: buildFlowCoverageSummary(analyzedRecording, code),
      scoreResult: scoreGeneratedTest(code, {
        ...(componentScoreContext ?? {}),
        queryResults: mapParsedQueriesToResults(candidateParsed, code),
      }),
    };

    let existingCode: string | null = null;
    try {
      existingCode = await readFile(outputPath, "utf-8");
    } catch (error: unknown) {
      const errCode = (error as NodeJS.ErrnoException)?.code;
      if (errCode && errCode !== "ENOENT") {
        throw error;
      }
    }

    let existingAssessment = null;
    if (existingCode) {
      existingAssessment = await assessOutputAgainstRecording({
        analyzedRecording,
        code: existingCode,
        componentScoreContext,
      });
    }
    const outputResolution = await reconcileExistingOutput({
      analyzedRecording,
      candidateAssessment,
      candidateCode: code,
      existingAssessment,
      existingCode,
    });

    if (existingCode && existingAssessment) {
      logExistingOutputDecision({
        outputPath,
        candidate: candidateAssessment,
        existing: existingAssessment,
        overwrite: outputResolution.shouldWrite,
        resolution: outputResolution,
      });
    }

    if (outputResolution.shouldWrite) {
      const outputCode = outputResolution.outputCode;
      await materializeBoundarySupport(boundarySupportPlan);
      await writeTestFile(outputCode, outputPath, {
        createDir: true,
        overwriteExisting: Boolean(existingCode),
      });
      const verification = verifySyntax(outputCode, outputPath);
      if (!verification.valid) {
        throw new Error(
          `Post-write verification failed: ${verification.error}`
        );
      }
      emitQuerySummary(queryResults);
      log(
        pc.green(
          `[taro] ${existingCode ? "Updated" : "Created"}: ${outputPath}`
        )
      );
      await finalizeGeneratedOutput({
        code: outputCode,
        outputPath,
        projectRoot,
        recordingFile: commandOptions.recording
          ? resolve(projectRoot, commandOptions.recording)
          : componentPath,
        scoreResult: outputResolution.outputAssessment.scoreResult,
        packageProfile: packageProfile ?? null,
      });
    }

    return normalizeFindings(findings);
  }

  if (
    findings.some((finding) => finding.severity === "BLOCKING") &&
    !allowsDraftOutput
  ) {
    return normalizeFindings(findings);
  }

  const conventions =
    packageProfile?.conventions ?? buildFallbackConventions(projectRoot);
  const boundarySupportPlan = await planBoundarySupport({
    projectRoot,
    outputPath,
    packageProfile: packageProfile ?? null,
    renderTargetFile: componentPath,
    renderTarget,
  });
  const generated = generateTestFromGroups(
    analyzedRecording.title,
    analyzedRecording.intentGroups,
    {
      additionalImports: targetPlan.additionalImports,
      outputPath,
      conventions,
      enableSetupOverrides: targetPlan.enableSetupOverrides,
      runner: packageProfile?.effectiveRunner ?? "unknown",
      jestDomImportPath:
        packageProfile?.jestDomSetup?.value === "global-setup"
          ? null
          : undefined,
      moduleStatements: targetPlan.moduleStatements,
      queryResults,
      renderExpression: targetPlan.renderExpression,
      renderTarget,
      renderHelper,
      scenarios: targetPlan.scenarios,
    }
  );
  let code = applyBoundarySupport(generated.code, boundarySupportPlan);
  code = prependBoundaryWarnings(
    code,
    await auditBoundaryPolicy(code, packageProfile ?? null, null)
  );
  const scoreResult = scoreGeneratedTest(code, {
    ...(componentScoreContext ?? {}),
    queryResults,
  });
  const candidateAssessment = {
    flowCoverage: buildFlowCoverageSummary(analyzedRecording, code),
    scoreResult,
  };

  let existingCode: string | null = null;
  try {
    existingCode = await readFile(outputPath, "utf-8");
  } catch (error: unknown) {
    const errCode = (error as NodeJS.ErrnoException)?.code;
    if (errCode && errCode !== "ENOENT") {
      throw error;
    }
  }

  let existingAssessment = null;
  if (existingCode) {
    existingAssessment = await assessOutputAgainstRecording({
      analyzedRecording,
      code: existingCode,
      componentScoreContext,
    });
  }
  const outputResolution = await reconcileExistingOutput({
    analyzedRecording,
    candidateAssessment,
    candidateCode: code,
    existingAssessment,
    existingCode,
  });

  if (existingCode && existingAssessment) {
    logExistingOutputDecision({
      outputPath,
      candidate: candidateAssessment,
      existing: existingAssessment,
      overwrite: outputResolution.shouldWrite,
      resolution: outputResolution,
    });
  }

  if (outputResolution.shouldWrite) {
    const outputCode = outputResolution.outputCode;
    await materializeBoundarySupport(boundarySupportPlan);
    await writeTestFile(outputCode, outputPath, {
      createDir: true,
      overwriteExisting: Boolean(existingCode),
    });
    const verification = verifySyntax(outputCode, outputPath);
    if (!verification.valid) {
      throw new Error(`Post-write verification failed: ${verification.error}`);
    }
    emitQuerySummary(queryResults);
    log(
      pc.green(`[taro] ${existingCode ? "Updated" : "Created"}: ${outputPath}`)
    );
    await finalizeGeneratedOutput({
      code: outputCode,
      outputPath,
      projectRoot,
      recordingFile: componentPath,
      scoreResult: outputResolution.outputAssessment.scoreResult,
      packageProfile: packageProfile ?? null,
    });
  }

  return normalizeFindings(findings);
}

async function resolveTargetOutputPath(params: {
  componentPath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
}): Promise<string> {
  const { componentPath, projectRoot, commandOptions } = params;
  const { packageProfile } = await loadPackageContext({
    commandOptions,
    targetPath: componentPath,
    projectRoot,
  });
  const localFolderPattern =
    await detectLocalOutputFolderPattern(componentPath);

  return deriveOutputPath(
    componentPath,
    localFolderPattern ??
      (isConcreteFolderPattern(packageProfile?.folderPattern.value)
        ? packageProfile.folderPattern.value
        : undefined)
  );
}

async function buildDirectoryLoopTracker(params: {
  sourceFiles: string[];
  componentPath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
}): Promise<DirectoryLoopTracker> {
  const entries: Array<{
    componentPath: string;
    outputPath: string;
    status: "completed" | "pending";
  }> = [];
  for (const filePath of params.sourceFiles) {
    const outputPath = await resolveTargetOutputPath({
      componentPath: filePath,
      projectRoot: params.projectRoot,
      commandOptions: params.commandOptions,
    });
    const hasExistingOutput = await access(outputPath)
      .then(() => true)
      .catch(() => false);

    entries.push({
      componentPath: filePath,
      outputPath,
      status: hasExistingOutput ? "completed" : "pending",
    });
  }

  return createDirectoryLoopTracker({
    directoryPath: params.componentPath,
    entries,
    projectRoot: params.projectRoot,
  });
}

export function createTargetCommand(
  context: TargetCommandContext = {}
): Command {
  const target = new Command("__target");

  target
    .description(
      "Internal runtime-only generator for explicit component-target RTL generation"
    )
    .argument(
      "<component-file>",
      "Path to the component file or directory that should be tested"
    )
    .option(
      "--directory-loop",
      "Treat directory input as an explicit iterative target loop"
    )
    .option(
      "--recording <file>",
      "Optional path to a recorder export file (.js)"
    )
    .option(
      "-i, --interactive-auth",
      "Force interactive Playwright auth recovery even when stdio is not detected as TTY"
    )
    .option(
      "--auth <file>",
      "Path to a Playwright storageState JSON file for optional visual capture"
    )
    .option(
      "--instructions <file>",
      "Path to a non-secret auth instructions file for optional visual capture"
    )
    .option(
      "--no-screenshots",
      "Skip optional Playwright screenshots and visual inspection"
    )
    .option(
      "--debug-selectors",
      "Reserved for recorder-backed target generation diagnostics"
    )
    .option(
      "--debug-selectors-json <file>",
      "Reserved for recorder-backed target generation diagnostics"
    )
    .action(async (componentFile: string) => {
      try {
        const rawProjectRoot = cwd();
        const projectRoot = await realpath(rawProjectRoot).catch(
          () => rawProjectRoot
        );
        const rawComponentPath = resolve(componentFile);
        const commandOptions = target.opts<CommandOptions>();

        const pathStat = await stat(rawComponentPath).catch(() => null);
        if (!pathStat) {
          const message =
            pc.red("Error:") +
            ` File not found or not accessible: ${rawComponentPath}`;
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        const componentPath = await realpath(rawComponentPath).catch(
          () => rawComponentPath
        );

        if (pathStat.isDirectory()) {
          if (!commandOptions.directoryLoop) {
            const message =
              pc.red("Error:") +
              " Directory input requires --directory-loop. Pass a single component file for one-off generation.";
            console.error(message);
            process.stderr.write(message + "\n");
            process.exit(2);
          }

          if (commandOptions.recording) {
            const message =
              pc.red("Error:") +
              " --recording is not compatible with directory input. Pass a single component file when using --recording.";
            console.error(message);
            process.stderr.write(message + "\n");
            process.exit(2);
          }

          const sourceFiles = await collectSourceFiles(componentPath);

          if (sourceFiles.length === 0) {
            log(
              pc.yellow(
                `[taro] No component source files found in: ${componentPath}`
              )
            );
            flushFindings([]);
          }

          let tracker = await buildDirectoryLoopTracker({
            sourceFiles,
            componentPath,
            projectRoot,
            commandOptions,
          });
          await writeDirectoryLoopTracker(tracker);

          log(
            pc.dim("[taro]") + " Directory loop mode enabled"
          );
          log(
            pc.dim("[taro]") +
              ` Directory loop tracker: ${tracker.trackerPath}`
          );

          const pendingEntries = tracker.entries.filter(
            (entry) => entry.status !== "completed"
          );

          if (pendingEntries.length === 0) {
            log(
              pc.yellow(
                `[taro] No pending component source files found in: ${componentPath}`
              )
            );
            flushFindings([]);
          }

          log(
            pc.dim("[taro]") +
              ` Processing ${pendingEntries.length} pending component file${pendingEntries.length === 1 ? "" : "s"} in ${componentPath}`
          );

          const allFindings: Finding[] = [];
          for (const entry of pendingEntries) {
            tracker = updateDirectoryLoopTrackerStatus(tracker, {
              componentPath: entry.componentPath,
              projectRoot,
              status: "in-progress",
            });
            await writeDirectoryLoopTracker(tracker);

            try {
              const findings = await generateForFile({
                componentPath: entry.componentPath,
                projectRoot,
                commandOptions,
                context,
              });
              allFindings.push(...findings);

              const hasGeneratedOutput = await access(entry.outputPath)
                .then(() => true)
                .catch(() => false);
              if (hasGeneratedOutput) {
                tracker = updateDirectoryLoopTrackerStatus(tracker, {
                  componentPath: entry.componentPath,
                  projectRoot,
                  status: "completed",
                });
                await writeDirectoryLoopTracker(tracker);
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              log(
                pc.red(
                  `[taro] Error processing ${entry.componentPath}: ${message}`
                )
              );
              allFindings.push({
                severity: "BLOCKING",
                category: "component-target",
                message: `Failed to generate test for ${entry.componentPath}: ${message}`,
              });
            }
          }

          flushFindings(normalizeFindings(allFindings));
        }

        if (commandOptions.directoryLoop) {
          const message =
            pc.red("Error:") +
            " --directory-loop is only valid when the target path is a directory.";
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        if (
          !isSupportedSourceFile(componentPath) ||
          isTestFilePath(componentPath)
        ) {
          const message =
            pc.red("Error:") +
            ` Target component must be a source module (.ts/.tsx/.js/.jsx), not a test file: ${componentPath}`;
          console.error(message);
          process.stderr.write(message + "\n");
          process.exit(2);
        }

        const findings = await generateForFile({
          componentPath,
          projectRoot,
          commandOptions,
          context,
        });

        flushFindings(normalizeFindings(findings));
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "constructor" in error &&
          (error as { constructor?: { name?: string } }).constructor?.name ===
            "ProcessExitSignal"
        ) {
          throw error;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Target generation failed with an unknown error.";
        console.error(pc.red("Error:") + ` ${message}`);
        process.stderr.write(pc.red("Error:") + ` ${message}\n`);
        process.exit(2);
      }
    });

  return target;
}
