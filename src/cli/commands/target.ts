import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { cwd, stdin, stdout } from "node:process";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import { Command } from "commander";
import pc from "picocolors";

import { auditBoundaryPolicy } from "#cli/commands/boundary-policy.ts";
import { applyRepoRenderTarget } from "#cli/commands/context-selection.ts";
import { flushFindings } from "#cli/commands/generate-findings.ts";
import { toImportPath } from "#cli/commands/generate-paths.ts";
import {
  finalizeGeneratedOutput,
  maybeAnalyzeMocks,
} from "#cli/commands/generate-postprocess.ts";
import { getPrimarySelector } from "#cli/commands/generate-recording.ts";
import {
  emitLowConfidenceBanner,
  logScore,
} from "#cli/commands/generate-reporting.ts";
import { logToStderr as log } from "#cli/commands/log.ts";
import {
  formatScore,
  parseMinScoreOption,
  passesScoreGate,
  resolveTargetScoreGateConfig,
  type ScoreGateConfig,
} from "#cli/commands/min-score.ts";
import { buildMockReviewFindings } from "#cli/commands/mock-review-findings.ts";
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
  createDirectoryLoopTracker,
  type DirectoryLoopTracker,
  readDirectoryLoopTracker,
  updateDirectoryLoopTrackerEntry,
  updateDirectoryLoopTrackerStatus,
  writeDirectoryLoopTracker,
} from "#cli/commands/target-directory-tracker.ts";
import {
  hasInteractiveVisualAuthCapability,
  maybeCaptureVisualState,
  resolveOptionalFilePath,
  resolveVisualAuthStorageStatePath,
} from "#cli/commands/visual-auth.ts";
import { normalizeJsBaseline } from "#core/baseline-normalizer.ts";
import { walkBabelAst as walk } from "#core/babel-utils.ts";
import {
  applyBoundarySupport,
  materializeBoundarySupport,
  planBoundarySupport,
} from "#core/boundary-support.ts";
import { loadComponentScoreContext } from "#core/component-score-context.ts";
import {
  inferComponentTargetPlan,
  resolveComponentDefinitionFromSource,
} from "#core/component-targeting.ts";
import type { Finding } from "#core/findings-reporter.ts";
import { emitQuerySummary, generateTestFromGroups } from "#core/generator.ts";
import { loadInput } from "#core/input-loader.ts";
import { parseJsRecording } from "#core/js-parser.ts";
import { analyzeRecording } from "#core/recording-intelligence.ts";
import {
  appendGeneratedTestRecord,
  detectPackageProfileStaleness,
  readTaroOverrides,
  refreshTaroState,
  resolveTaroPackageProfile,
  runLoadOrBootstrapStateWorkflow,
} from "#core/state.ts";
import { normalizeGeneratedTestHistoryPath } from "#core/state-paths.ts";
import { planJsSuite } from "#core/suite-planner.ts";
import { scoreTestQuality } from "#core/test-quality-scorer.ts";
import { verifySyntax } from "#core/verifier.ts";
import { writeTestFile } from "#core/writer.ts";
import type { QueryResult } from "#types/recording.ts";
import type { ScoreResult } from "#types/score.ts";
import type { ResolvedTaroPackageProfile } from "#types/state.ts";
import type { TaroFolderPattern } from "#types/state.ts";

interface TargetCommandContext {
  input?: Pick<typeof stdin, "isTTY">;
  output?: Pick<typeof stdout, "isTTY">;
  runDirectoryLoopComponent?: (
    params: DirectoryLoopComponentParams
  ) => Promise<{ exitCode: number }>;
}

interface CommandOptions {
  auth?: string;
  debugSelectors?: boolean;
  debugSelectorsJson?: string;
  directoryLoop?: boolean;
  interactiveAuth?: boolean;
  instructions?: string;
  minScore?: number;
  recording?: string;
  screenshots?: boolean;
}

interface RawCommandOptions extends Omit<CommandOptions, "minScore"> {
  minScore?: string;
}

interface DirectoryLoopComponentParams {
  commandOptions: CommandOptions;
  componentPath: string;
  projectRoot: string;
}

interface LatestGeneratedOutputStatus {
  grade: ScoreResult["grade"];
  overall: number;
  requiresReview: boolean;
}

const TEST_MIGRATION_AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

function isSupportedSourceFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath);
}

function isTestFilePath(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function isRelativeModuleSpecifier(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

function passesTargetOutputGate(
  scoreResult: { requiresReview: boolean; overall: number; total: number },
  scoreGate: ScoreGateConfig
): boolean {
  return passesScoreGate(scoreResult, scoreGate);
}

function resolveTargetTrackerEntryStatus(params: {
  hasAcceptedExistingOutput: boolean;
  previousStatus: DirectoryLoopTracker["entries"][number]["status"] | undefined;
}): DirectoryLoopTracker["entries"][number]["status"] {
  if (params.hasAcceptedExistingOutput) {
    return "completed";
  }

  if (params.previousStatus === "in-progress") {
    return "in-progress";
  }

  return "pending";
}

function selectNextTargetTrackerEntry(tracker: DirectoryLoopTracker): {
  entry: DirectoryLoopTracker["entries"][number] | null;
  pendingCount: number;
} {
  const inProgressEntry = tracker.entries.find(
    (entry) => entry.status === "in-progress"
  );
  const pendingEntries = tracker.entries.filter(
    (entry) => entry.status === "pending"
  );

  return {
    entry: inProgressEntry ?? pendingEntries[0] ?? null,
    pendingCount: pendingEntries.length + (inProgressEntry ? 1 : 0),
  };
}

function buildTargetTrackerFollowUpComments(params: {
  executionError?: unknown;
  exitCode?: number;
  latestOutputStatus?: LatestGeneratedOutputStatus;
  outputExists: boolean;
  scoreGate: ScoreGateConfig;
}): string[] {
  const comments: string[] = [];

  if (params.executionError instanceof Error) {
    comments.push(`Target execution failed: ${params.executionError.message}`);
  } else if (params.executionError) {
    comments.push("Target execution failed with an unknown error.");
  }

  if (!params.outputExists) {
    comments.push("No generated test output was produced.");
  }

  if (params.latestOutputStatus && params.outputExists) {
    if (params.latestOutputStatus.overall < params.scoreGate.minScore) {
      comments.push(
        `Generated output did not clear the target gate (${formatScore(params.latestOutputStatus.overall)}/100, ${params.latestOutputStatus.grade}).`
      );
    }

    if (
      params.latestOutputStatus.requiresReview &&
      params.scoreGate.enforceRequiresReview
    ) {
      comments.push(
        `Manual review required (${formatScore(params.latestOutputStatus.overall)}/100, ${params.latestOutputStatus.grade}).`
      );
    }

    if (comments.length === 0) {
      comments.push("No follow-up required.");
    }
  } else if (params.outputExists) {
    comments.push(
      "Generated output exists, but no latest score record was found."
    );
  }

  if (params.exitCode && params.exitCode !== 0) {
    comments.push(`Per-file target run exited with code ${params.exitCode}.`);
  }

  return [...new Set(comments)];
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

function normalizeComponentScoreContextForOutput(params: {
  componentPath: string;
  componentScoreContext: Awaited<ReturnType<typeof loadComponentScoreContext>>;
  outputPath: string;
}) {
  const { componentPath, componentScoreContext, outputPath } = params;
  if (!componentScoreContext) {
    return componentScoreContext;
  }

  const componentDir = dirname(componentPath);
  const outputDir = dirname(outputPath);
  const normalizeImportTarget = (target: string) =>
    target.startsWith("./") || target.startsWith("../")
      ? toImportPath(outputDir, resolve(componentDir, target))
      : target;

  return {
    ...componentScoreContext,
    componentImportReferences:
      componentScoreContext.componentImportReferences?.map((reference) => ({
        ...reference,
        target: normalizeImportTarget(reference.target),
      })) ?? [],
    dynamicImportTargets:
      componentScoreContext.dynamicImportTargets?.map(normalizeImportTarget) ??
      [],
  };
}

async function loadPackageContext(params: {
  commandOptions: { auth?: string; instructions?: string };
  targetPath: string;
  projectRoot: string;
}): Promise<{
  explicitAuthPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>;
  explicitInstructionsPath: Awaited<ReturnType<typeof resolveOptionalFilePath>>;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile: ResolvedTaroPackageProfile | null;
  visualAuth: ResolvedTaroPackageProfile["playwrightAuth"];
}> {
  const { commandOptions, targetPath, projectRoot } = params;
  const hadState = await access(resolve(projectRoot, ".taro", "state.json"))
    .then(() => true)
    .catch(() => false);

  if (!hadState) {
    await runLoadOrBootstrapStateWorkflow(projectRoot);
  }

  const bootstrappedState = await runLoadOrBootstrapStateWorkflow(projectRoot);
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
    overrides,
    packageProfile,
    visualAuth,
  };
}

function isTargetConventionFolderPattern(
  folderPattern?: TaroFolderPattern | null
): folderPattern is "__tests__" | "tests" {
  return folderPattern === "__tests__" || folderPattern === "tests";
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

async function resolveTargetOutputPathFromContext(params: {
  componentPath: string;
  packageProfile?: ResolvedTaroPackageProfile | null;
}): Promise<string> {
  const { componentPath, packageProfile } = params;
  const localFolderPattern =
    await detectLocalOutputFolderPattern(componentPath);
  const folderPattern =
    localFolderPattern ??
    (isTargetConventionFolderPattern(packageProfile?.folderPattern.value)
      ? packageProfile.folderPattern.value
      : "tests");

  return deriveOutputPath(componentPath, folderPattern);
}

function toMovedRelativeModuleSpecifier(
  fromDir: string,
  absoluteTargetPath: string
): string {
  const relativePath = relative(fromDir, absoluteTargetPath).replace(/\\/g, "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function isMockCallExpression(node: t.CallExpression): boolean {
  if (!t.isMemberExpression(node.callee) || node.callee.computed) {
    return false;
  }

  if (!t.isIdentifier(node.callee.object) || !t.isIdentifier(node.callee.property)) {
    return false;
  }

  return (
    (node.callee.object.name === "vi" || node.callee.object.name === "jest") &&
    ["doMock", "mock", "unmock"].includes(node.callee.property.name)
  );
}

function isRelativeModuleSpecifierCall(node: t.CallExpression): boolean {
  if (t.isImport(node.callee)) {
    return true;
  }

  if (t.isIdentifier(node.callee, { name: "require" })) {
    return true;
  }

  return isMockCallExpression(node);
}

function rewriteRelativeModuleSpecifiersForMove(params: {
  newPath: string;
  oldPath: string;
  source: string;
}): string {
  const { newPath, oldPath, source } = params;
  const oldDir = dirname(oldPath);
  const newDir = dirname(newPath);
  const replacements: Array<{ end: number; start: number; value: string }> = [];
  const addReplacement = (literal: t.StringLiteral) => {
    if (
      typeof literal.start !== "number" ||
      typeof literal.end !== "number" ||
      !isRelativeModuleSpecifier(literal.value)
    ) {
      return;
    }

    const start = literal.start;
    const end = literal.end;
    const absoluteTargetPath = resolve(oldDir, literal.value);
    const nextValue = toMovedRelativeModuleSpecifier(
      newDir,
      absoluteTargetPath
    );
    const quote = source[start] === "'" ? "'" : '"';
    replacements.push({
      end,
      start,
      value: `${quote}${nextValue}${quote}`,
    });
  };

  let ast: t.File;
  try {
    ast = babelParser.parse(source, {
      errorRecovery: true,
      plugins: TEST_MIGRATION_AST_PLUGINS,
      sourceType: "unambiguous",
    });
  } catch {
    return source;
  }

  walk(ast, (node) => {
    if (
      (t.isImportDeclaration(node) ||
        t.isExportAllDeclaration(node) ||
        t.isExportNamedDeclaration(node)) &&
      node.source
    ) {
      addReplacement(node.source);
      return;
    }

    if (t.isCallExpression(node) && isRelativeModuleSpecifierCall(node)) {
      const firstArg = node.arguments[0];
      if (t.isStringLiteral(firstArg)) {
        addReplacement(firstArg);
      }
    }
  });

  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce(
      (nextSource, replacement) =>
        `${nextSource.slice(0, replacement.start)}${replacement.value}${nextSource.slice(replacement.end)}`,
      source
    );
}

async function moveImmediateDirectoryLoopTestsIntoTestsFolder(
  directoryPath: string
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const testsDir = join(directoryPath, "tests");
  const movedFiles: string[] = [];
  const testFiles = entries
    .filter((entry) => entry.isFile() && isTestFilePath(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (testFiles.length === 0) {
    return movedFiles;
  }

  await mkdir(testsDir, { recursive: true });

  for (const fileName of testFiles) {
    const oldPath = join(directoryPath, fileName);
    const newPath = join(testsDir, fileName);
    const destinationExists = await access(newPath)
      .then(() => true)
      .catch(() => false);
    if (destinationExists) {
      log(
        pc.yellow(
          `[taro] Skipping test relocation because destination already exists: ${newPath}`
        )
      );
      continue;
    }

    const source = await readFile(oldPath, "utf-8");
    const rewrittenSource = rewriteRelativeModuleSpecifiersForMove({
      newPath,
      oldPath,
      source,
    });
    await writeFile(oldPath, rewrittenSource, "utf-8");
    await rename(oldPath, newPath);
    movedFiles.push(newPath);
  }

  return movedFiles;
}

async function appendSelectedTargetOutputRecord(params: {
  componentPath: string;
  outputPath: string;
  packageProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  scoreResult: ScoreResult;
}): Promise<void> {
  const { componentPath, outputPath, packageProfile, projectRoot, scoreResult } =
    params;

  try {
    await appendGeneratedTestRecord(projectRoot, {
      packagePath: packageProfile?.packagePath ?? ".",
      recordingFile: componentPath,
      testFile: outputPath,
      scoreResult,
    });
    log(
      pc.dim("[taro]") +
        ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? "."}.`
    );
  } catch {
    // State updates are best-effort; generation should still report findings.
  }
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

async function runHealthCommand(
  command: string,
  projectRoot: string
): Promise<{ command: string; exitCode: number }> {
  return await new Promise((resolveRun) => {
    const child = spawn(command, {
      shell: true,
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().trimEnd().split("\n")) {
        if (line.length > 0) {
          process.stderr.write(pc.dim("[taro:health]") + " " + line + "\n");
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().trimEnd().split("\n")) {
        if (line.length > 0) {
          process.stderr.write(pc.dim("[taro:health]") + " " + line + "\n");
        }
      }
    });
    child.on("close", (code) => resolveRun({ command, exitCode: code ?? 1 }));
  });
}

async function runHealthCommands(params: {
  healthCommands?: string[];
  projectRoot: string;
}): Promise<Array<{ command: string; exitCode: number }>> {
  const healthCommands = params.healthCommands ?? [];
  if (healthCommands.length === 0) {
    return [];
  }

  process.stderr.write(pc.dim("[taro]") + " Running health checks...\n");

  const failedCommands: Array<{ command: string; exitCode: number }> = [];
  for (const command of healthCommands) {
    process.stderr.write(pc.dim("[taro:health]") + ` $ ${command}\n`);
    const result = await runHealthCommand(command, params.projectRoot);
    if (result.exitCode !== 0) {
      process.stderr.write(
        pc.yellow(
          `[taro:health] ⚠ '${command}' exited with code ${result.exitCode}`
        ) + "\n"
      );
      failedCommands.push(result);
    } else {
      process.stderr.write(pc.dim(`[taro:health] ✓ ${command}`) + "\n");
    }
  }

  return failedCommands;
}

function buildPostWriteGateFindings(params: {
  failedHealthCommands?: Array<{ command: string; exitCode: number }>;
  outputPath: string;
  scoreGate: ScoreGateConfig;
  scoreResult: ScoreResult;
}): Finding[] {
  const findings: Finding[] = [];
  if (params.scoreResult.total < params.scoreGate.minScore) {
    const requiredLabel = params.scoreGate.enforceRequiresReview
      ? `${formatScore(params.scoreGate.minScore)}/100 quality gate`
      : `--min-score ${formatScore(params.scoreGate.minScore)}/100`;
    findings.push({
      severity: "BLOCKING",
      category: "quality",
      message:
        `Generated test scored ${formatScore(params.scoreResult.total)}/100, below the required ` +
        `${requiredLabel}: ${params.outputPath}`,
    });
  }

  if (
    params.scoreResult.requiresReview &&
    params.scoreGate.enforceRequiresReview
  ) {
    findings.push({
      severity: "BLOCKING",
      category: "follow-up",
      message:
        `Generated test still requires manual review (${params.scoreResult.total}/100, ` +
        `${params.scoreResult.grade}): ${params.outputPath}`,
    });
  }

  for (const failedCommand of params.failedHealthCommands ?? []) {
    findings.push({
      severity: "BLOCKING",
      category: "health",
      message:
        `Post-write health command failed for ${params.outputPath}: ` +
        `'${failedCommand.command}' exited with code ${failedCommand.exitCode}.`,
    });
  }

  return findings;
}

async function readLatestGeneratedOutputStatuses(
  projectRoot: string
): Promise<Map<string, LatestGeneratedOutputStatus>> {
  const bootstrap = await runLoadOrBootstrapStateWorkflow(projectRoot);
  const latestStatuses = new Map<
    string,
    LatestGeneratedOutputStatus & { createdAtMs: number }
  >();

  for (const record of bootstrap.state.generatedTests) {
    const normalizedPath = normalizeGeneratedTestHistoryPath(
      projectRoot,
      record.testFile
    );
    const createdAtMs = Number.isFinite(Date.parse(record.createdAt))
      ? Date.parse(record.createdAt)
      : 0;
    const previous = latestStatuses.get(normalizedPath);

    if (
      !previous ||
      createdAtMs > previous.createdAtMs ||
      (createdAtMs === previous.createdAtMs &&
        record.quality.overall >= previous.overall)
    ) {
      latestStatuses.set(normalizedPath, {
        createdAtMs,
        grade: record.quality.grade,
        overall: record.quality.overall,
        requiresReview: record.requiresReview,
      });
    }
  }

  return new Map(
    [...latestStatuses.entries()].map(([path, status]) => [
      path,
      {
        grade: status.grade,
        overall: status.overall,
        requiresReview: status.requiresReview,
      },
    ])
  );
}

async function readTargetDirectoryLoopEntryOutcome(params: {
  outputPath: string;
  projectRoot: string;
}): Promise<{
  latestOutputStatus: LatestGeneratedOutputStatus | undefined;
  outputExists: boolean;
}> {
  const outputExists = await access(params.outputPath)
    .then(() => true)
    .catch(() => false);
  const latestOutputStatuses = await readLatestGeneratedOutputStatuses(
    params.projectRoot
  );

  return {
    latestOutputStatus: latestOutputStatuses.get(
      normalizeGeneratedTestHistoryPath(params.projectRoot, params.outputPath)
    ),
    outputExists,
  };
}

async function maybeAcceptExistingOutputForBlockedTarget(params: {
  componentPath: string;
  componentScoreContext: Awaited<ReturnType<typeof loadComponentScoreContext>>;
  outputPath: string;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  scoreGate: ScoreGateConfig;
}): Promise<Finding[] | null> {
  let existingCode: string | null = null;
  try {
    existingCode = await readFile(params.outputPath, "utf-8");
  } catch (error: unknown) {
    const errCode = (error as NodeJS.ErrnoException)?.code;
    if (errCode && errCode !== "ENOENT") {
      throw error;
    }
  }

  if (!existingCode) {
    return null;
  }

  const verification = verifySyntax(existingCode, params.outputPath);
  if (!verification.valid) {
    return null;
  }

  const scoreResult = scoreTestQuality(existingCode, {
    ...(params.componentScoreContext ?? {}),
    queryResults: [],
  });
  const failedHealthCommands = await runHealthCommands({
    healthCommands: params.overrides.healthCommands,
    projectRoot: params.projectRoot,
  });
  const gateFindings = buildPostWriteGateFindings({
    failedHealthCommands,
    outputPath: params.outputPath,
    scoreGate: params.scoreGate,
    scoreResult,
  });

  if (gateFindings.some((finding) => finding.severity === "BLOCKING")) {
    return normalizeFindings(gateFindings);
  }

  log(
    pc.dim("[taro]") +
      ` Reusing existing target output because component inference is blocked: ${params.outputPath}`
  );
  await finalizeGeneratedOutput({
    code: existingCode,
    outputPath: params.outputPath,
    projectRoot: params.projectRoot,
    recordingFile: params.componentPath,
    scoreResult,
    packageProfile: params.packageProfile,
  });
  logScore(scoreResult);
  emitLowConfidenceBanner(scoreResult);

  return [];
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

async function collectComponentSourceFiles(
  dirPath: string
): Promise<{ skippedFiles: string[]; sourceFiles: string[] }> {
  const sourceFiles = await collectSourceFiles(dirPath);
  const componentSourceFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf-8").catch(() => null);
    const fallbackName =
      basename(filePath).replace(/\.[cm]?[jt]sx?$/u, "") || "Component";
    const definition =
      source === null
        ? null
        : resolveComponentDefinitionFromSource(source, fallbackName);

    if (definition) {
      componentSourceFiles.push(filePath);
    } else {
      skippedFiles.push(filePath);
    }
  }

  return { skippedFiles, sourceFiles: componentSourceFiles };
}

async function generateForFile(params: {
  componentPath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
  context: TargetCommandContext;
}): Promise<Finding[]> {
  const { componentPath, projectRoot, commandOptions, context } = params;
  const scoreGate = resolveTargetScoreGateConfig(commandOptions.minScore);

  const { overrides, packageProfile, visualAuth } = await loadPackageContext({
    commandOptions,
    targetPath: componentPath,
    projectRoot,
  });
  const outputPath = await resolveTargetOutputPathFromContext({
    componentPath,
    packageProfile,
  });

  const targetPlan = await inferComponentTargetPlan({
    componentPath,
    outputPath,
    projectRoot,
  });
  const componentScoreContext = await loadComponentScoreContext(componentPath);
  const normalizedComponentScoreContext =
    normalizeComponentScoreContextForOutput({
      componentPath,
      componentScoreContext,
      outputPath,
    });
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
    const boundaryPolicyWarnings = await auditBoundaryPolicy(
      code,
      packageProfile ?? null,
      null
    );
    const suiteWarnings = [...jsSuitePlan.warnings];
    code = prependBoundaryWarnings(code, [
      ...jsSuitePlan.warnings,
      ...boundaryPolicyWarnings,
    ]);

    const candidateParsed = await parseJsRecording(code).catch(() => null);
    const candidateAssessment = {
      flowCoverage: buildFlowCoverageSummary(analyzedRecording, code),
      scoreResult: scoreTestQuality(code, {
        ...(normalizedComponentScoreContext ?? {}),
        queryResults: candidateParsed
          ? mapParsedQueriesToResults(candidateParsed, code)
          : [],
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
        componentScoreContext: normalizedComponentScoreContext,
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

    let failedHealthCommands: Array<{ command: string; exitCode: number }> = [];
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
      log(pc.green("[taro] ✓ post-write verified"));
      logScore(outputResolution.outputAssessment.scoreResult);
      emitLowConfidenceBanner(outputResolution.outputAssessment.scoreResult);
      failedHealthCommands = await runHealthCommands({
        healthCommands: overrides.healthCommands,
        projectRoot,
      });
    }

    return normalizeFindings([
      ...findings,
      ...buildMockReviewFindings({
        boundaryPolicyWarnings,
        candidateSelected:
          outputResolution.shouldWrite && commandOptions.directoryLoop !== true,
        mockAnalysis: mockAnalysis ?? null,
        outputPath,
        selectedCode: outputResolution.outputCode,
        suiteWarnings,
      }),
      ...buildPostWriteGateFindings({
        failedHealthCommands,
        outputPath,
        scoreGate,
        scoreResult: outputResolution.outputAssessment.scoreResult,
      }),
    ]);
  }

  if (findings.some((finding) => finding.severity === "BLOCKING")) {
    const existingOutputFindings =
      await maybeAcceptExistingOutputForBlockedTarget({
        componentPath,
        componentScoreContext: normalizedComponentScoreContext,
        outputPath,
        overrides,
        packageProfile: packageProfile ?? null,
        projectRoot,
        scoreGate,
      });

    if (existingOutputFindings) {
      return existingOutputFindings;
    }

    if (!allowsDraftOutput) {
      return normalizeFindings(findings);
    }
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
  const boundaryPolicyWarnings = await auditBoundaryPolicy(
    code,
    packageProfile ?? null,
    null
  );
  code = prependBoundaryWarnings(code, boundaryPolicyWarnings);
  const scoreResult = scoreTestQuality(code, {
    ...(normalizedComponentScoreContext ?? {}),
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
      componentScoreContext: normalizedComponentScoreContext,
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

  let failedHealthCommands: Array<{ command: string; exitCode: number }> = [];
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
    log(pc.green("[taro] ✓ post-write verified"));
    logScore(outputResolution.outputAssessment.scoreResult);
    emitLowConfidenceBanner(outputResolution.outputAssessment.scoreResult);
    failedHealthCommands = await runHealthCommands({
      healthCommands: overrides.healthCommands,
      projectRoot,
    });
  } else if (existingCode) {
    await appendSelectedTargetOutputRecord({
      componentPath,
      outputPath,
      packageProfile: packageProfile ?? null,
      projectRoot,
      scoreResult: outputResolution.outputAssessment.scoreResult,
    });
  }

  return normalizeFindings([
    ...findings,
    ...buildMockReviewFindings({
      boundaryPolicyWarnings,
      candidateSelected:
        outputResolution.shouldWrite && commandOptions.directoryLoop !== true,
      mockAnalysis: mockAnalysis ?? null,
      outputPath,
      selectedCode: outputResolution.outputCode,
      suiteWarnings: [],
    }),
    ...buildPostWriteGateFindings({
      failedHealthCommands,
      outputPath,
      scoreGate,
      scoreResult: outputResolution.outputAssessment.scoreResult,
    }),
  ]);
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
  return resolveTargetOutputPathFromContext({
    componentPath,
    packageProfile,
  });
}

async function buildDirectoryLoopTracker(params: {
  sourceFiles: string[];
  componentPath: string;
  projectRoot: string;
  commandOptions: CommandOptions;
  previousTracker?: DirectoryLoopTracker;
}): Promise<DirectoryLoopTracker> {
  const scoreGate = resolveTargetScoreGateConfig(
    params.commandOptions.minScore
  );
  const previousTracker =
    params.previousTracker ??
    (await readDirectoryLoopTracker({
      directoryPath: params.componentPath,
      projectRoot: params.projectRoot,
    }));
  const latestOutputStatuses = await readLatestGeneratedOutputStatuses(
    params.projectRoot
  );
  const entries: Array<{
    componentPath: string;
    currentScoreThreshold: number | null;
    followUpComments: string[];
    outputPath: string;
    status: DirectoryLoopTracker["entries"][number]["status"];
    updatedScoreThreshold: number | null;
  }> = [];

  const preserveCurrentScoreThresholds = params.previousTracker !== undefined;

  for (const filePath of params.sourceFiles) {
    const outputPath = await resolveTargetOutputPath({
      componentPath: filePath,
      projectRoot: params.projectRoot,
      commandOptions: params.commandOptions,
    });
    const previousEntry = previousTracker?.entries.find(
      (entry) => resolve(params.projectRoot, entry.componentPath) === filePath
    );
    const hasExistingOutput = await access(outputPath)
      .then(() => true)
      .catch(() => false);
    const latestOutputStatus = latestOutputStatuses.get(
      normalizeGeneratedTestHistoryPath(params.projectRoot, outputPath)
    );
    const hasAcceptedExistingOutput =
      hasExistingOutput &&
      latestOutputStatus !== undefined &&
      passesTargetOutputGate(
        {
          requiresReview: latestOutputStatus.requiresReview,
          overall: latestOutputStatus.overall,
          total: latestOutputStatus.overall,
        },
        scoreGate
      );

    entries.push({
      componentPath: filePath,
      currentScoreThreshold: preserveCurrentScoreThresholds
        ? (previousEntry?.currentScoreThreshold ??
          latestOutputStatus?.overall ??
          null)
        : (latestOutputStatus?.overall ?? null),
      followUpComments:
        previousEntry?.followUpComments ??
        buildTargetTrackerFollowUpComments({
          latestOutputStatus,
          outputExists: hasExistingOutput,
          scoreGate,
        }),
      outputPath,
      status: resolveTargetTrackerEntryStatus({
        hasAcceptedExistingOutput,
        previousStatus: previousEntry?.status,
      }),
      updatedScoreThreshold: previousEntry?.updatedScoreThreshold ?? null,
    });
  }

  return createDirectoryLoopTracker({
    directoryPath: params.componentPath,
    entries,
    projectRoot: params.projectRoot,
  });
}

function buildSingleTargetArgs(
  componentPath: string,
  commandOptions: CommandOptions
): string[] {
  const args = [componentPath];

  if (commandOptions.recording) {
    args.push("--recording", commandOptions.recording);
  }

  if (commandOptions.interactiveAuth) {
    args.push("--interactive-auth");
  }

  if (commandOptions.auth) {
    args.push("--auth", commandOptions.auth);
  }

  if (commandOptions.instructions) {
    args.push("--instructions", commandOptions.instructions);
  }

  if (commandOptions.screenshots === false) {
    args.push("--no-screenshots");
  }

  if (commandOptions.debugSelectors) {
    args.push("--debug-selectors");
  }

  if (commandOptions.debugSelectorsJson) {
    args.push("--debug-selectors-json", commandOptions.debugSelectorsJson);
  }

  if (typeof commandOptions.minScore === "number") {
    args.push("--min-score", String(commandOptions.minScore));
  }

  return args;
}

async function runDirectoryLoopComponentInSubprocess(
  params: DirectoryLoopComponentParams
): Promise<{ exitCode: number }> {
  const entrypoint = process.argv[1];
  if (!entrypoint || /vitest|vite-node/u.test(entrypoint)) {
    throw new Error(
      "Directory loop subprocess entrypoint is unavailable in the current runtime."
    );
  }

  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        entrypoint,
        "__target",
        ...buildSingleTargetArgs(params.componentPath, params.commandOptions),
      ],
      { cwd: params.projectRoot, stdio: "inherit" }
    );

    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectRun(
          new Error(
            `Directory loop target subprocess was interrupted by signal ${signal}.`
          )
        );
        return;
      }

      resolveRun({ exitCode: code ?? 1 });
    });
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
    .option(
      "--min-score <number>",
      "Minimum accepted Taro score (0-100). When provided, Taro gates on score only."
    )
    .action(async (componentFile: string) => {
      try {
        const rawProjectRoot = cwd();
        const projectRoot = await realpath(rawProjectRoot).catch(
          () => rawProjectRoot
        );
        const rawComponentPath = resolve(componentFile);
        const rawCommandOptions = target.opts<RawCommandOptions>();
        const minScore = parseMinScoreOption(rawCommandOptions.minScore);
        const commandOptions: CommandOptions = {
          ...rawCommandOptions,
          minScore: minScore ?? undefined,
        };

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
        const runDirectoryLoopComponent =
          context.runDirectoryLoopComponent ??
          runDirectoryLoopComponentInSubprocess;

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

          const relocatedTestFiles =
            await moveImmediateDirectoryLoopTestsIntoTestsFolder(componentPath);
          const { skippedFiles, sourceFiles } =
            await collectComponentSourceFiles(componentPath);

          if (sourceFiles.length === 0) {
            log(
              pc.yellow(
                `[taro] No JSX component source files found in: ${componentPath}`
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
          const directoryLoopScoreGate = resolveTargetScoreGateConfig(
            commandOptions.minScore
          );
          await writeDirectoryLoopTracker(tracker);

          log(pc.dim("[taro]") + " Directory loop mode enabled");
          if (relocatedTestFiles.length > 0) {
            log(
              pc.dim("[taro]") +
                ` Moved ${relocatedTestFiles.length} existing test file${relocatedTestFiles.length === 1 ? "" : "s"} into ${join(componentPath, "tests")}`
            );
          }
          if (skippedFiles.length > 0) {
            log(
              pc.dim("[taro]") +
                ` Skipping ${skippedFiles.length} non-component source file${skippedFiles.length === 1 ? "" : "s"} in ${componentPath}`
            );
          }
          log(
            pc.dim("[taro]") + ` Directory loop tracker: ${tracker.trackerPath}`
          );

          while (true) {
            const { entry, pendingCount } =
              selectNextTargetTrackerEntry(tracker);

            if (!entry) {
              const failedEntries = tracker.entries.filter(
                (candidate) => candidate.status === "failed"
              );

              if (tracker.entries.length > 0) {
                if (failedEntries.length === 0) {
                  log(
                    pc.dim("[taro]") +
                      " Directory loop tracker is complete; no pending component source files remain."
                  );
                } else {
                  log(
                    pc.yellow(
                      `[taro] Directory loop completed with ${failedEntries.length} failed component file${failedEntries.length === 1 ? "" : "s"}.`
                    )
                  );

                  for (const failedEntry of failedEntries) {
                    const reason =
                      failedEntry.followUpComments[0] ??
                      "Target output did not clear the accepted-output gate.";
                    log(
                      pc.yellow(
                        `[taro] Failed: ${failedEntry.componentPath} (${reason})`
                      )
                    );
                  }
                }
              } else {
                log(
                  pc.yellow(
                    `[taro] No pending component source files found in: ${componentPath}`
                  )
                );
              }

              process.exit(failedEntries.length > 0 ? 1 : 0);
            }

            log(
              pc.dim("[taro]") +
                ` Processing ${pendingCount} pending component file${pendingCount === 1 ? "" : "s"} in ${componentPath}`
            );

            tracker = updateDirectoryLoopTrackerStatus(tracker, {
              componentPath: resolve(projectRoot, entry.componentPath),
              projectRoot,
              status: "in-progress",
            });
            await writeDirectoryLoopTracker(tracker);

            let runResult: { error?: unknown; exitCode: number };
            try {
              const result = await runDirectoryLoopComponent({
                commandOptions,
                componentPath: entry.componentPath,
                projectRoot,
              });
              runResult = { exitCode: result.exitCode };
            } catch (error) {
              runResult = { error, exitCode: 1 };
            }

            const outputPath = resolve(projectRoot, entry.outputPath);
            const { latestOutputStatus, outputExists } =
              await readTargetDirectoryLoopEntryOutcome({
                outputPath,
                projectRoot,
              });
            const hasAcceptedOutput =
              outputExists &&
              latestOutputStatus !== undefined &&
              passesTargetOutputGate(
                {
                  requiresReview: latestOutputStatus.requiresReview,
                  overall: latestOutputStatus.overall,
                  total: latestOutputStatus.overall,
                },
                directoryLoopScoreGate
              );
            const followUpComments = buildTargetTrackerFollowUpComments({
              executionError: runResult.error,
              exitCode: runResult.exitCode,
              latestOutputStatus,
              outputExists,
              scoreGate: directoryLoopScoreGate,
            });

            tracker = updateDirectoryLoopTrackerEntry(tracker, {
              componentPath: resolve(projectRoot, entry.componentPath),
              followUpComments,
              projectRoot,
              status:
                runResult.exitCode === 0 && hasAcceptedOutput
                  ? "completed"
                  : "failed",
              updatedScoreThreshold: latestOutputStatus?.overall,
            });
            await writeDirectoryLoopTracker(tracker);

            if (runResult.exitCode !== 0 || !hasAcceptedOutput) {
              const continuationReason =
                followUpComments[0] ??
                "Target output did not clear the accepted-output gate.";
              log(
                pc.yellow(
                  `[taro] Directory loop marked ${entry.componentPath} as failed (${continuationReason}). Continuing.`
                )
              );
            }
          }
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
