/**
 * Generate command utilities
 * Pure helpers, types, and XState machine types extracted from generate.ts
 */

import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import pc from "picocolors";

import { analyzeBoundaryIsolation } from "#core/boundary-intelligence.ts";
import {
  discoverBoundaryImportsFromSource,
  inferBoundaryPattern,
} from "#core/boundary-learning.ts";
import { planBoundarySupport } from "#core/boundary-support.ts";
import {
  type Finding,
  formatFindingsBlock,
  hasBlockingFindings,
} from "#core/findings-reporter.ts";
import { type JsParseResult, parseJsRecording } from "#core/js-parser.ts";
import type { MockAnalysis } from "#core/mock-intelligence.ts";
import { analyzeMocks } from "#core/mock-intelligence.ts";
import { isTestIdQueryMethod } from "#core/query-policy.ts";
import { findVisualCaptureCandidates } from "#core/recording-intelligence.ts";
import type {
  CaptureVisualStateAuthOptions,
  ReplayStepDebugTrace,
} from "#core/resolver.ts";
import {
  captureVisualState,
  createPageInspector,
  openCapturePage,
  replayStep,
  resolveSelector,
  urlsMateriallyDiffer,
} from "#core/resolver.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import {
  appendGeneratedTestRecord,
  loadOrBootstrapTaroState,
  persistPlaywrightAuthProfile,
  readTaroOverrides,
  resolveTaroPackageProfile,
} from "#core/state.ts";
import type { JsSuitePlan } from "#core/suite-planner.ts";
import { verifySyntax } from "#core/verifier.ts";
import type {
  AnalyzedRecording,
  ItGroup,
  NormalizedRecording,
  NormalizedStep,
  PlannedMarkerAssertion,
  QueryDescriptor,
  QueryResult,
  SelectorDescriptor,
  SelectorResolutionPhase,
  SelectorResolutionResult,
  SemanticMarkerAssertionUnresolvedReason,
  StepId,
  UnresolvedSelectorResolutionResult,
  UnresolvedSemanticMarkerAssertionResolution,
  VisualState,
} from "#types/recording.ts";
import type {
  ComponentScoreContext,
  MarkerCoverageTotals,
  MarkerReviewDiagnostics,
  ScoreResult,
} from "#types/score.ts";
import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroFolderPattern,
  TaroPlaywrightAuthProfile,
} from "#types/state.ts";

export interface SelectorDebugReporter {
  enabled: boolean;
  persist(): Promise<void>;
  traceBrowserFailure(record: {
    authStrategy?: string;
    error: string;
    url: string;
  }): void;
  traceReplay(debug?: ReplayStepDebugTrace): void;
  traceSelector(result: SelectorResolutionResult): void;
  traceStepSummary(record: {
    action: string;
    replayed: boolean;
    selectorsResolved: number;
    selectorsStillUnresolved: number;
    stepId: string;
    warningCount: number;
  }): void;
}

export interface RepoContextMatch {
  filePath: string;
  matchedTerms: string[];
  kind: "source" | "test";
  score: number;
}

export interface FlowCoverageSummary {
  totalSteps: number;
  coveredSteps: number;
  coveredStepIds: string[];
  uncoveredStepIds: string[];
}

export interface OutputAssessment {
  flowCoverage: FlowCoverageSummary;
  scoreResult: ScoreResult;
}

export interface ExistingOutputResolution {
  mergeApplied: boolean;
  mergedTestCount: number;
  outputAssessment: OutputAssessment;
  outputCode: string;
  preferredSource: "candidate" | "existing";
  shouldWrite: boolean;
}

export type AuthPreflightStatus =
  | "not_required"
  | "unknown_recipe"
  | "authenticated"
  | "failed";

/**
 * Writes an operational log line to stderr.
 */
function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

/**
 * Emits the findings envelope to stdout and terminates the process with the matching exit code.
 */
export function flushFindings(findings: Finding[]): never {
  if (findings.length > 0) {
    process.stdout.write(formatFindingsBlock(findings) + "\n");
  }
  process.exit(hasBlockingFindings(findings) ? 1 : 0);
}

const EMPTY_MARKER_DIAGNOSTICS: MarkerReviewDiagnostics = {
  canonicalRecoveries: 0,
  placementConflicts: 0,
  placementCorrections: 0,
};
export const MANUAL_VISUAL_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH =
  ".taro/playwright/.auth/user.json";
const PAGE_CONFIRMED_CONTEXT_TERM_BONUS = 50;

const CONTEXT_SEARCH_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".taro",
  "coverage",
  ".next",
  ".nuxt",
]);

const CONTEXT_SEARCH_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const GENERIC_CONTEXT_TERMS = new Set([
  "add",
  "back",
  "cancel",
  "close",
  "continue",
  "done",
  "next",
  "open",
  "save",
  "submit",
]);

const UNRESOLVED_MARKER_REASON_GUIDANCE: Record<
  SemanticMarkerAssertionUnresolvedReason,
  string
> = {
  "missing-marker-candidate":
    "Semantic marker candidate metadata is missing. Re-record or keep marker metadata intact.",
  "missing-anchor":
    "Marker has no reliable anchor step. Re-record with marker near the intended assertion moment.",
  "missing-query":
    "Recorder evidence is missing an accessible query. Capture a clearer role/name or visible text.",
  "unsupported-proof-subject":
    "Marker proof subject is unsupported for safe RTL conversion. Use role/name or visible text proof.",
  "ambiguous-field-context":
    "Field context is ambiguous. Capture a single, specific field label or value target.",
  "unsupported-field-context":
    "Field context could not map to a trusted RTL field query. Record a clearer label/placeholder.",
  "generic-container":
    "Marker points to a generic container. Capture the concrete user-facing element instead.",
  "css-only-evidence":
    "Marker is backed only by CSS-like evidence. Capture semantic role/name or visible text evidence.",
  "icon-only-target":
    "Marker target is icon-only and ambiguous. Capture surrounding accessible text context.",
  "hidden-evidence":
    "Marker evidence depends on hidden/implementation selectors. Capture user-visible evidence instead.",
  "boundary-placement-conflict":
    "Marker could not be assigned to a single safe scenario. Keep the checkpoint near the intended state change or repair the scenario split.",
};

/**
 * Derives the default generated test path for a recorder export.
 * When folderPattern is '__tests__' or 'tests', the test file is placed in the
 * corresponding subdirectory of the source file's directory to match the
 * project's existing convention.
 */
export function deriveOutputPath(
  inputPath: string,
  folderPattern?: TaroFolderPattern
): string {
  const dir = dirname(inputPath);
  const name = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, "");
  if (folderPattern === "__tests__") {
    return join(dir, "__tests__", `${name}.test.tsx`);
  }
  if (folderPattern === "tests") {
    return join(dir, "tests", `${name}.test.tsx`);
  }
  return join(dir, `${name}.test.tsx`);
}

/**
 * Checks whether a path already points at a test or spec file.
 */
export function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

/**
 * Checks whether an import specifier is relative to its source file.
 */
export function isRelativeImportPath(importPath: string): boolean {
  return importPath.startsWith("./") || importPath.startsWith("../");
}

/**
 * Checks whether a filesystem path is accessible to the current process.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a relative import from a source file to the most likely on-disk module path.
 */
export async function resolveImportedFilePath(params: {
  projectRoot: string;
  sourceFile: string;
  importPath: string;
}): Promise<string | null> {
  const { projectRoot, sourceFile, importPath } = params;
  if (!isRelativeImportPath(importPath)) {
    return null;
  }

  const sourceDir = dirname(resolve(projectRoot, sourceFile));
  const rawTargetPath = resolve(sourceDir, importPath);
  const candidates = [
    rawTargetPath,
    `${rawTargetPath}.ts`,
    `${rawTargetPath}.tsx`,
    `${rawTargetPath}.js`,
    `${rawTargetPath}.jsx`,
    join(rawTargetPath, "index.ts"),
    join(rawTargetPath, "index.tsx"),
    join(rawTargetPath, "index.js"),
    join(rawTargetPath, "index.jsx"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return rawTargetPath;
}

/**
 * Resolves the concrete source file that should anchor generation for a repo render target.
 */
export async function resolveRenderTargetFile(params: {
  projectRoot: string;
  renderTarget: RepoRenderTargetCandidate | null;
}): Promise<string | null> {
  const { projectRoot, renderTarget } = params;
  if (!renderTarget) {
    return null;
  }

  if (!isTestFilePath(renderTarget.sourceTestFile)) {
    return resolve(projectRoot, renderTarget.sourceTestFile);
  }

  return resolveImportedFilePath({
    projectRoot,
    sourceFile: renderTarget.sourceTestFile,
    importPath: renderTarget.importPath,
  });
}

/**
 * Rebases a learned render-helper import so it remains valid from a new output directory.
 */
export function rebaseRenderHelperImportPath(params: {
  projectRoot: string;
  outputPath: string;
  renderHelper: ResolvedTaroPackageProfile["effectiveRenderHelper"];
}): ResolvedTaroPackageProfile["effectiveRenderHelper"] {
  const { projectRoot, outputPath, renderHelper } = params;
  if (
    !renderHelper ||
    !isRelativeImportPath(renderHelper.importPath) ||
    !isTestFilePath(renderHelper.sourceTestFile)
  ) {
    return renderHelper;
  }

  const absoluteImportPath = resolve(
    dirname(resolve(projectRoot, renderHelper.sourceTestFile)),
    renderHelper.importPath
  );

  return {
    ...renderHelper,
    importPath: toImportPath(dirname(outputPath), absoluteImportPath),
  };
}

/**
 * Checks whether a string looks like CSS selector syntax rather than user-facing text.
 */
export function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  );
}

/**
 * Normalizes repo-context text and filters out terms that are too generic to search reliably.
 */
export function normalizeContextTerm(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    normalized.length < 4 ||
    looksLikeSelectorLikeString(normalized)
  ) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (!/\s/.test(normalized) && GENERIC_CONTEXT_TERMS.has(lower)) {
    return null;
  }

  return normalized;
}

/**
 * Normalizes text for case-insensitive substring comparison.
 */
export function normalizeComparableText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized ? normalized : null;
}

/**
 * Checks whether a coverage token is too generic to count as meaningful evidence.
 */
export function isGenericCoverageToken(token: string): boolean {
  return (
    GENERIC_CONTEXT_TERMS.has(token) ||
    [
      "screen",
      "within",
      "document",
      "location.href",
      "document.title",
      "button",
      "textbox",
      "heading",
      "dialog",
      "combobox",
      "listitem",
      "link",
      "checkbox",
      "radio",
      "switch",
      "option",
      "getbyrole",
      "findbyrole",
      "querybyrole",
      "getbytext",
      "findbytext",
      "querybytext",
    ].includes(token)
  );
}

/**
 * Extracts normalized comparison tokens from user-facing text or quoted code fragments.
 */
export function collectComparableTokens(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  const tokens = new Set<string>();
  const normalized = normalizeComparableText(value);
  const register = (candidate?: string | null) => {
    const comparable = normalizeComparableText(candidate);
    if (
      !comparable ||
      comparable.length < 2 ||
      looksLikeSelectorLikeString(comparable) ||
      isGenericCoverageToken(comparable)
    ) {
      return;
    }

    tokens.add(comparable);
  };

  if (!/\bscreen\.|\bwithin\(|\bdocument\./i.test(value)) {
    register(normalized);
  }

  const quotedMatches = value.matchAll(/['"`]([^'"`\n]{2,120})['"`]/g);
  for (const match of quotedMatches) {
    register(match[1]);
  }

  return [...tokens];
}

/**
 * Collects the primary and secondary coverage tokens that represent a recorder step.
 */
export function collectStepCoverageTokens(step: NormalizedStep): {
  measurable: boolean;
  primary: string[];
  secondary: string[];
} {
  if (
    step.action === "navigate" ||
    step.action === "scroll" ||
    step.action === "waitForSelector"
  ) {
    return { measurable: false, primary: [], secondary: [] };
  }

  if (
    step.action === "assert" &&
    (step.target === "location.href" || step.target === "document.title")
  ) {
    return { measurable: false, primary: [], secondary: [] };
  }

  const primary = new Set<string>();
  const secondary = new Set<string>();
  const registerPrimary = (value?: string | null) => {
    for (const token of collectComparableTokens(value)) {
      primary.add(token);
    }
  };
  const registerSecondary = (value?: string | null) => {
    for (const token of collectComparableTokens(value)) {
      secondary.add(token);
    }
  };

  registerPrimary(step.target);
  registerPrimary(step.semanticMarkerCandidate?.proofText);
  registerPrimary(step.semanticMarkerCandidate?.target);
  registerPrimary(step.semanticMarkerCandidate?.query?.target);
  registerPrimary(step.semanticMarkerCandidate?.query?.name);
  registerPrimary(step.unresolvedSemanticMarker?.proofText);
  registerPrimary(step.unresolvedSemanticMarker?.target);
  registerPrimary(step.unresolvedSemanticMarker?.query?.target);
  registerPrimary(step.unresolvedSemanticMarker?.query?.name);

  if (
    step.action === "fill" ||
    step.action === "select" ||
    step.action === "assert"
  ) {
    registerSecondary(step.value);
  }

  const hasEvidence = primary.size > 0 || secondary.size > 0;
  return {
    measurable: hasEvidence,
    primary: [...primary],
    secondary: [...secondary],
  };
}

/**
 * Checks whether normalized generated code contains a specific coverage token.
 */
export function codeIncludesCoverageToken(
  normalizedCode: string,
  token: string
): boolean {
  return normalizedCode.includes(token);
}

/**
 * Summarizes how much of a recorded flow is reflected by the generated code.
 */
export function buildFlowCoverageSummary(
  analyzedRecording: AnalyzedRecording,
  code: string
): FlowCoverageSummary {
  const normalizedCode = normalizeComparableText(code) ?? "";
  let totalSteps = 0;
  let coveredSteps = 0;
  const coveredStepIds: string[] = [];
  const uncoveredStepIds: string[] = [];

  for (const step of analyzedRecording.steps) {
    const coverageTokens = collectStepCoverageTokens(step);
    if (!coverageTokens.measurable) {
      continue;
    }

    totalSteps += 1;
    const hasPrimaryCoverage =
      coverageTokens.primary.length === 0 ||
      coverageTokens.primary.some((token) =>
        codeIncludesCoverageToken(normalizedCode, token)
      );
    const hasSecondaryCoverage =
      coverageTokens.secondary.length === 0 ||
      coverageTokens.secondary.some((token) =>
        codeIncludesCoverageToken(normalizedCode, token)
      );
    const matched = hasPrimaryCoverage && hasSecondaryCoverage;

    if (matched) {
      coveredSteps += 1;
      coveredStepIds.push(step.id ?? `${step.action}-${totalSteps}`);
    } else {
      uncoveredStepIds.push(step.id ?? `${step.action}-${totalSteps}`);
    }
  }

  return { totalSteps, coveredSteps, coveredStepIds, uncoveredStepIds };
}

/**
 * Converts parsed query descriptors into scorer-friendly query results.
 */
function inferQueryResultsFromCode(code: string): QueryResult[] {
  const queryRegex =
    /\b(?<method>(?:get|find|query)(?:All)?By(?:Role|Text|LabelText|PlaceholderText|DisplayValue|AltText|Title|TestId))\s*\(/g;

  return [...code.matchAll(queryRegex)].map((match) => ({
    method: match.groups?.method ?? "unknown",
    query: match[0]?.trim() ?? "unknown",
    quality: "fragile" as const,
  }));
}

export function mapParsedQueriesToResults(
  parsed: JsParseResult,
  code?: string
): QueryResult[] {
  const parsedQueries = parsed.queries.map((query) => ({
    method: query.method,
    query:
      query.raw ?? query.target ?? query.name ?? query.role ?? query.method,
    quality: query.quality ?? "fragile",
    line: query.line,
  }));

  if (parsedQueries.length > 0 || !code) {
    return parsedQueries;
  }

  return inferQueryResultsFromCode(code);
}

/**
 * Scores generated code against both recorder flow coverage and query-quality heuristics.
 */
export async function assessOutputAgainstRecording(params: {
  analyzedRecording: AnalyzedRecording;
  code: string;
  componentScoreContext?: ComponentScoreContext | null;
}): Promise<OutputAssessment> {
  const parsed = await parseJsRecording(params.code);
  const flowCoverage = buildFlowCoverageSummary(
    params.analyzedRecording,
    params.code
  );
  const scoreResult = scoreGeneratedTest(params.code, {
    ...(params.componentScoreContext ?? {}),
    queryResults: mapParsedQueriesToResults(parsed, params.code),
  });

  return { flowCoverage, scoreResult };
}

/**
 * Compares two output assessments to decide which generated file is stronger.
 */
export function compareOutputAssessments(
  candidate: OutputAssessment,
  existing: OutputAssessment
): number {
  if (
    candidate.scoreResult.requiresReview !== existing.scoreResult.requiresReview
  ) {
    return candidate.scoreResult.requiresReview ? -1 : 1;
  }

  const blockerDelta =
    existing.scoreResult.blockers.length -
    candidate.scoreResult.blockers.length;
  if (blockerDelta !== 0) {
    return blockerDelta;
  }

  const scoreDelta = candidate.scoreResult.total - existing.scoreResult.total;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const coverageDelta =
    candidate.flowCoverage.coveredSteps - existing.flowCoverage.coveredSteps;
  if (coverageDelta !== 0) {
    return coverageDelta;
  }

  const totalStepsDelta =
    candidate.flowCoverage.totalSteps - existing.flowCoverage.totalSteps;
  if (totalStepsDelta !== 0) {
    return totalStepsDelta;
  }

  return candidate.scoreResult.total - existing.scoreResult.total;
}

/**
 * Logs why Taro will keep or replace an existing generated test file.
 */
export function logExistingOutputDecision(params: {
  outputPath: string;
  candidate: OutputAssessment;
  existing: OutputAssessment;
  overwrite: boolean;
  resolution?: ExistingOutputResolution | null;
}): void {
  const { outputPath, candidate, existing, overwrite, resolution } = params;
  log(pc.dim("[taro]") + ` Existing output detected: ${outputPath}`);
  log(
    pc.dim("[taro]") +
      ` Recorder flow coverage — existing ${existing.flowCoverage.coveredSteps}/${existing.flowCoverage.totalSteps}, ` +
      `candidate ${candidate.flowCoverage.coveredSteps}/${candidate.flowCoverage.totalSteps}`
  );
  log(
    pc.dim("[taro]") +
      ` Quality — existing ${existing.scoreResult.total}/100 (${existing.scoreResult.grade}), ` +
      `candidate ${candidate.scoreResult.total}/100 (${candidate.scoreResult.grade})`
  );

  if (resolution?.mergeApplied) {
    log(
      pc.dim("[taro]") +
        ` Preserved ${resolution.mergedTestCount} distinct test block${resolution.mergedTestCount === 1 ? "" : "s"} from the alternate suite.`
    );
  }

  if (overwrite) {
    log(
      pc.yellow(
        `[taro] Existing output will be updated because Taro kept the preferred suite${resolution?.mergeApplied ? " and merged distinct tests from the alternate draft." : "."}`
      )
    );
    return;
  }

  log(
    pc.green(
      `[taro] Keeping the existing test because it remains the preferred suite and there were no additional distinct tests to preserve.`
    )
  );
}

interface ParsedTestModule {
  code: string;
  container: TestContainer;
  imports: t.ImportDeclaration[];
  program: t.Program;
}

interface TestContainer {
  body: t.Statement[];
  kind: "describe" | "program";
  statement: t.Statement | null;
  title: string | null;
}

interface MergeTestModulesResult {
  code: string;
  mergedTestCount: number;
}

function parseTestModule(code: string): ParsedTestModule | null {
  try {
    const ast = babelParser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    const topLevelDescribe = ast.program.body.find((node) => {
      return t.isStatement(node) && getDescribeBodyStatements(node) !== null;
    });

    const describeBody =
      topLevelDescribe && t.isStatement(topLevelDescribe)
        ? getDescribeBodyStatements(topLevelDescribe)
        : null;

    return {
      code,
      container: describeBody
        ? {
            body: describeBody,
            kind: "describe",
            statement: topLevelDescribe as t.Statement,
            title: extractCallTitle(
              (topLevelDescribe as t.ExpressionStatement).expression
            ),
          }
        : {
            body: ast.program.body.filter((node): node is t.Statement =>
              t.isStatement(node)
            ),
            kind: "program",
            statement: null,
            title: null,
          },
      imports: ast.program.body.filter((node): node is t.ImportDeclaration =>
        t.isImportDeclaration(node)
      ),
      program: ast.program,
    };
  } catch {
    return null;
  }
}

function getDescribeBodyStatements(
  statement: t.Statement
): t.Statement[] | null {
  if (
    !t.isExpressionStatement(statement) ||
    !t.isCallExpression(statement.expression)
  ) {
    return null;
  }

  if (!isNamedCall(statement.expression, ["describe"])) {
    return null;
  }

  const callback = statement.expression.arguments[1];
  if (
    !callback ||
    (!t.isFunctionExpression(callback) &&
      !t.isArrowFunctionExpression(callback))
  ) {
    return null;
  }

  return t.isBlockStatement(callback.body) ? callback.body.body : null;
}

function isDirectTestStatement(statement: t.Statement): boolean {
  return (
    t.isExpressionStatement(statement) &&
    t.isCallExpression(statement.expression) &&
    isNamedCall(statement.expression, ["it", "test"])
  );
}

function isNamedCall(node: t.CallExpression, names: string[]): boolean {
  let callee: t.Expression | t.V8IntrinsicIdentifier = node.callee;
  while (t.isMemberExpression(callee) && !callee.computed) {
    callee = callee.object;
  }
  return t.isIdentifier(callee) && names.includes(callee.name);
}

function extractCallTitle(node: t.Expression): string | null {
  if (!t.isCallExpression(node)) {
    return null;
  }

  const titleArg = node.arguments[0];
  if (t.isStringLiteral(titleArg)) {
    return titleArg.value;
  }
  if (t.isTemplateLiteral(titleArg) && titleArg.expressions.length === 0) {
    return titleArg.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function normalizeCodeFragment(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sliceNodeSource(
  code: string,
  node: t.Node | null | undefined
): string | null {
  if (!node || typeof node.start !== "number" || typeof node.end !== "number") {
    return null;
  }
  return code.slice(node.start, node.end);
}

function collectStatementBindingNames(statement: t.Statement): string[] {
  const bindings = new Set<string>();
  const registerPattern = (
    pattern: t.LVal | t.Identifier | t.RestElement | t.PatternLike
  ) => {
    if (t.isIdentifier(pattern)) {
      bindings.add(pattern.name);
      return;
    }
    if (t.isRestElement(pattern)) {
      registerPattern(pattern.argument as t.PatternLike);
      return;
    }
    if (t.isAssignmentPattern(pattern)) {
      registerPattern(pattern.left);
      return;
    }
    if (t.isObjectPattern(pattern)) {
      for (const property of pattern.properties) {
        if (t.isRestElement(property)) {
          registerPattern(property.argument as t.PatternLike);
          continue;
        }
        if (t.isObjectProperty(property)) {
          registerPattern(property.value as t.PatternLike);
        }
      }
      return;
    }
    if (t.isArrayPattern(pattern)) {
      for (const element of pattern.elements) {
        if (element) {
          registerPattern(element as t.PatternLike);
        }
      }
    }
  };

  if (t.isVariableDeclaration(statement)) {
    for (const declaration of statement.declarations) {
      registerPattern(declaration.id);
    }
  } else if (
    t.isFunctionDeclaration(statement) ||
    t.isClassDeclaration(statement)
  ) {
    if (statement.id) {
      bindings.add(statement.id.name);
    }
  }

  return [...bindings];
}

function collectImportBindingNames(declaration: t.ImportDeclaration): string[] {
  return declaration.specifiers.map((specifier) => specifier.local.name);
}

function collectTopLevelBindings(module: ParsedTestModule): Set<string> {
  const bindings = new Set<string>();
  for (const declaration of module.imports) {
    for (const name of collectImportBindingNames(declaration)) {
      bindings.add(name);
    }
  }
  for (const statement of module.program.body) {
    if (!t.isStatement(statement)) {
      continue;
    }
    for (const name of collectStatementBindingNames(statement)) {
      bindings.add(name);
    }
  }
  return bindings;
}

function collectContainerBindings(container: TestContainer): Set<string> {
  const bindings = new Set<string>();
  for (const statement of container.body) {
    for (const name of collectStatementBindingNames(statement)) {
      bindings.add(name);
    }
  }
  return bindings;
}

function collectTopLevelSupportStatements(
  module: ParsedTestModule
): t.Statement[] {
  return module.program.body.filter((node): node is t.Statement => {
    if (!t.isStatement(node)) {
      return false;
    }
    if (module.container.statement === node) {
      return false;
    }
    return !isDirectTestStatement(node);
  });
}

function collectContainerSupportStatements(
  container: TestContainer
): t.Statement[] {
  return container.body.filter(
    (statement) => !isDirectTestStatement(statement)
  );
}

function collectComparableTestTokens(snippet: string): string[] {
  return collectComparableTokens(snippet).filter(
    (token) => !/^https?:\/\//.test(token)
  );
}

function comparableTokenMatches(left: string, right: string): boolean {
  return left === right || left.includes(right) || right.includes(left);
}

function testStatementsAreEquivalent(params: {
  baseCode: string;
  baseStatement: t.Statement;
  otherCode: string;
  otherStatement: t.Statement;
}): boolean {
  const baseSnippet =
    sliceNodeSource(params.baseCode, params.baseStatement) ?? "";
  const otherSnippet =
    sliceNodeSource(params.otherCode, params.otherStatement) ?? "";
  if (!baseSnippet || !otherSnippet) {
    return false;
  }

  if (
    normalizeCodeFragment(baseSnippet) === normalizeCodeFragment(otherSnippet)
  ) {
    return true;
  }

  const baseTokens = collectComparableTestTokens(baseSnippet);
  const otherTokens = collectComparableTestTokens(otherSnippet);
  if (baseTokens.length === 0 || otherTokens.length === 0) {
    return false;
  }

  return (
    baseTokens.every((token) =>
      otherTokens.some((candidate) => comparableTokenMatches(token, candidate))
    ) &&
    otherTokens.every((token) =>
      baseTokens.some((candidate) => comparableTokenMatches(token, candidate))
    )
  );
}

function collectDistinctTests(
  base: ParsedTestModule,
  other: ParsedTestModule
): t.Statement[] {
  const baseTests = base.container.body.filter(isDirectTestStatement);

  return other.container.body.filter((statement) => {
    if (!isDirectTestStatement(statement)) {
      return false;
    }

    return !baseTests.some((baseStatement) =>
      testStatementsAreEquivalent({
        baseCode: base.code,
        baseStatement,
        otherCode: other.code,
        otherStatement: statement,
      })
    );
  });
}

function collectSupportSnippetAdditions(params: {
  baseCode: string;
  baseBindings: Set<string>;
  baseStatements: t.Statement[];
  otherCode: string;
  otherStatements: t.Statement[];
}): string[] {
  const { baseCode, baseBindings, baseStatements, otherCode, otherStatements } =
    params;
  const existingStatements = new Set(
    baseStatements
      .map((statement) =>
        normalizeCodeFragment(sliceNodeSource(baseCode, statement) ?? "")
      )
      .filter(Boolean)
  );
  const additions: string[] = [];

  for (const statement of otherStatements) {
    const snippet = sliceNodeSource(otherCode, statement)?.trim();
    if (!snippet) {
      continue;
    }
    const normalized = normalizeCodeFragment(snippet);
    if (!normalized || existingStatements.has(normalized)) {
      continue;
    }

    const bindingNames = collectStatementBindingNames(statement);
    if (bindingNames.some((name) => baseBindings.has(name))) {
      continue;
    }

    additions.push(snippet);
    existingStatements.add(normalized);
    for (const name of bindingNames) {
      baseBindings.add(name);
    }
  }

  return additions;
}

function planImportAdditions(
  base: ParsedTestModule,
  other: ParsedTestModule
): string[] {
  const existingSnippets = new Set(
    base.imports
      .map((declaration) =>
        normalizeCodeFragment(sliceNodeSource(base.code, declaration) ?? "")
      )
      .filter(Boolean)
  );
  const existingBindings = collectTopLevelBindings(base);
  const additions: string[] = [];

  for (const declaration of other.imports) {
    const normalized = normalizeCodeFragment(
      sliceNodeSource(other.code, declaration) ?? ""
    );
    if (normalized && existingSnippets.has(normalized)) {
      continue;
    }

    if (declaration.specifiers.length === 0) {
      if (
        base.imports.some(
          (entry) => entry.source.value === declaration.source.value
        )
      ) {
        continue;
      }
      const snippet = sliceNodeSource(other.code, declaration)?.trim();
      if (snippet) {
        additions.push(snippet);
        existingSnippets.add(normalized);
      }
      continue;
    }

    const defaultSpecifier = declaration.specifiers.find((specifier) =>
      t.isImportDefaultSpecifier(specifier)
    );
    const namespaceSpecifier = declaration.specifiers.find((specifier) =>
      t.isImportNamespaceSpecifier(specifier)
    );
    const namedSpecifiers = declaration.specifiers.filter(
      (specifier): specifier is t.ImportSpecifier =>
        t.isImportSpecifier(specifier)
    );

    const missingDefault =
      defaultSpecifier && !existingBindings.has(defaultSpecifier.local.name)
        ? defaultSpecifier.local.name
        : null;
    const missingNamespace =
      namespaceSpecifier && !existingBindings.has(namespaceSpecifier.local.name)
        ? namespaceSpecifier.local.name
        : null;
    const missingNamed = namedSpecifiers.filter(
      (specifier) => !existingBindings.has(specifier.local.name)
    );

    if (!missingDefault && !missingNamespace && missingNamed.length === 0) {
      continue;
    }

    const segments: string[] = [];
    if (missingDefault) {
      segments.push(missingDefault);
      existingBindings.add(missingDefault);
    }
    if (missingNamespace) {
      segments.push(`* as ${missingNamespace}`);
      existingBindings.add(missingNamespace);
    }
    if (missingNamed.length > 0) {
      segments.push(
        `{ ${missingNamed
          .map((specifier) => {
            const imported = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value;
            existingBindings.add(specifier.local.name);
            return imported === specifier.local.name
              ? imported
              : `${imported} as ${specifier.local.name}`;
          })
          .join(", ")} }`
      );
    }

    additions.push(
      `import ${segments.join(", ")} from '${String(declaration.source.value)}'`
    );
  }

  return additions;
}

function insertAfterImports(
  code: string,
  imports: t.ImportDeclaration[],
  additions: string[]
): string {
  if (additions.length === 0) {
    return code;
  }

  const block = additions.join("\n");
  if (imports.length === 0) {
    return `${block}\n\n${code.trimStart()}`;
  }

  const insertionIndex = imports[imports.length - 1]?.end ?? 0;
  const before = code.slice(0, insertionIndex).replace(/\s*$/, "");
  const after = code.slice(insertionIndex).replace(/^\s*/, "");
  return `${before}\n${block}\n\n${after}`;
}

function findTopLevelInsertionIndex(module: ParsedTestModule): number {
  if (module.container.statement?.start != null) {
    return module.container.statement.start;
  }

  const firstTest = module.program.body.find(
    (node) => t.isStatement(node) && isDirectTestStatement(node)
  );
  return firstTest?.start ?? module.code.length;
}

function insertBeforeTopLevelContainer(
  code: string,
  module: ParsedTestModule,
  additions: string[]
): string {
  if (additions.length === 0) {
    return code;
  }

  const insertionIndex = findTopLevelInsertionIndex(module);
  const before = code.slice(0, insertionIndex).replace(/\s*$/, "");
  const after = code.slice(insertionIndex).replace(/^\s*/, "");
  return `${before}\n\n${additions.join("\n\n")}\n\n${after}`;
}

function insertIntoContainer(
  code: string,
  module: ParsedTestModule,
  additions: string[]
): string {
  if (additions.length === 0) {
    return code;
  }

  if (module.container.kind === "program") {
    return `${code.replace(/\s*$/, "")}\n\n${additions.join("\n\n")}\n`;
  }

  const statement = module.container.statement;
  if (
    !statement ||
    !t.isExpressionStatement(statement) ||
    !t.isCallExpression(statement.expression)
  ) {
    return code;
  }

  const callback = statement.expression.arguments[1];
  if (
    !callback ||
    (!t.isFunctionExpression(callback) &&
      !t.isArrowFunctionExpression(callback))
  ) {
    return code;
  }
  if (!t.isBlockStatement(callback.body) || callback.body.end == null) {
    return code;
  }

  const insertionIndex = callback.body.end - 1;
  const before = code.slice(0, insertionIndex).replace(/\s*$/, "");
  const after = code.slice(insertionIndex);
  return `${before}\n\n${additions.join("\n\n")}\n${after}`;
}

function appendTopLevelDescribe(
  code: string,
  statement: t.Statement,
  otherCode: string
): string {
  const snippet = sliceNodeSource(otherCode, statement)?.trim();
  if (!snippet) {
    return code;
  }
  return `${code.replace(/\s*$/, "")}\n\n${snippet}\n`;
}

function mergeDistinctTestBlocks(params: {
  baseCode: string;
  otherCode: string;
}): MergeTestModulesResult {
  const baseModule = parseTestModule(params.baseCode);
  const otherModule = parseTestModule(params.otherCode);
  if (!baseModule || !otherModule) {
    return { code: params.baseCode, mergedTestCount: 0 };
  }

  const distinctTests = collectDistinctTests(baseModule, otherModule);
  if (distinctTests.length === 0) {
    return { code: params.baseCode, mergedTestCount: 0 };
  }

  let nextCode = params.baseCode;
  nextCode = insertAfterImports(
    nextCode,
    baseModule.imports,
    planImportAdditions(baseModule, otherModule)
  );

  let refreshedBase = parseTestModule(nextCode);
  if (!refreshedBase) {
    return { code: params.baseCode, mergedTestCount: 0 };
  }

  const sameContainer =
    refreshedBase.container.kind === otherModule.container.kind &&
    normalizeCodeFragment(refreshedBase.container.title ?? "") ===
      normalizeCodeFragment(otherModule.container.title ?? "");

  const topLevelSupportAdditions = collectSupportSnippetAdditions({
    baseBindings: collectTopLevelBindings(refreshedBase),
    baseCode: refreshedBase.code,
    baseStatements: collectTopLevelSupportStatements(refreshedBase),
    otherCode: otherModule.code,
    otherStatements: collectTopLevelSupportStatements(otherModule),
  });
  nextCode = insertBeforeTopLevelContainer(
    nextCode,
    refreshedBase,
    topLevelSupportAdditions
  );

  refreshedBase = parseTestModule(nextCode);
  if (!refreshedBase) {
    return { code: params.baseCode, mergedTestCount: 0 };
  }

  if (!sameContainer && otherModule.container.statement) {
    return {
      code: appendTopLevelDescribe(
        nextCode,
        otherModule.container.statement,
        otherModule.code
      ),
      mergedTestCount: distinctTests.length,
    };
  }

  const containerSupportAdditions = collectSupportSnippetAdditions({
    baseBindings: collectContainerBindings(refreshedBase.container),
    baseCode: refreshedBase.code,
    baseStatements: collectContainerSupportStatements(refreshedBase.container),
    otherCode: otherModule.code,
    otherStatements: collectContainerSupportStatements(otherModule.container),
  });
  const testAdditions = distinctTests
    .map((statement) => sliceNodeSource(otherModule.code, statement)?.trim())
    .filter((snippet): snippet is string => Boolean(snippet));

  return {
    code: insertIntoContainer(nextCode, refreshedBase, [
      ...containerSupportAdditions,
      ...testAdditions,
    ]),
    mergedTestCount: testAdditions.length,
  };
}

export async function reconcileExistingOutput(params: {
  analyzedRecording: AnalyzedRecording;
  candidateAssessment: OutputAssessment;
  candidateCode: string;
  existingAssessment: OutputAssessment | null;
  existingCode: string | null;
}): Promise<ExistingOutputResolution> {
  const {
    analyzedRecording,
    candidateAssessment,
    candidateCode,
    existingAssessment,
    existingCode,
  } = params;
  if (!existingCode || !existingAssessment) {
    return {
      mergeApplied: false,
      mergedTestCount: 0,
      outputAssessment: candidateAssessment,
      outputCode: candidateCode,
      preferredSource: "candidate",
      shouldWrite: true,
    };
  }

  const comparison = compareOutputAssessments(
    candidateAssessment,
    existingAssessment
  );
  const candidateWins =
    comparison > 0 ||
    (comparison === 0 &&
      normalizeCodeFragment(candidateCode) !==
        normalizeCodeFragment(existingCode));
  const preferredSource = candidateWins ? "candidate" : "existing";
  const preferredCode = candidateWins ? candidateCode : existingCode;
  const alternateCode = candidateWins ? existingCode : candidateCode;
  const merged =
    preferredSource === "existing"
      ? mergeDistinctTestBlocks({
          baseCode: preferredCode,
          otherCode: alternateCode,
        })
      : { code: preferredCode, mergedTestCount: 0 };
  const mergeApplied =
    normalizeCodeFragment(merged.code) !== normalizeCodeFragment(preferredCode);
  const outputCode = mergeApplied ? merged.code : preferredCode;
  const outputAssessment = mergeApplied
    ? await assessOutputAgainstRecording({
        analyzedRecording,
        code: outputCode,
      })
    : candidateWins
      ? candidateAssessment
      : existingAssessment;

  return {
    mergeApplied,
    mergedTestCount: merged.mergedTestCount,
    outputAssessment,
    outputCode,
    preferredSource,
    shouldWrite: preferredSource === "candidate" || mergeApplied,
  };
}

/**
 * Scores a repo-context term by how specific it is likely to be.
 */
export function scoreContextTerm(term: string): number {
  let score = term.length;
  if (/\s/.test(term)) {
    score += 10;
  }
  if (/[()/:+-]/.test(term)) {
    score += 4;
  }
  if (/\d/.test(term)) {
    score += 2;
  }

  return score;
}

/**
 * Extracts the best user-facing context term from the focused visual element.
 */
export function collectVisualElementContextTerm(
  visualState: VisualState
): string | null {
  const candidates = [
    visualState.element?.ariaLabel,
    visualState.element?.labelText,
    visualState.element?.innerText,
    visualState.element?.altText,
    visualState.element?.title,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeContextTerm(candidate ?? undefined);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * Collects repo-grounding terms that Playwright confirmed on the page.
 */
export function collectPageConfirmedContextTerms(
  visualState: VisualState | null
): string[] {
  if (!visualState) {
    return [];
  }

  const terms = new Set<string>();
  const register = (value?: string | null) => {
    const normalized = normalizeContextTerm(value ?? undefined);
    if (normalized) {
      terms.add(normalized);
    }
  };

  for (const landmark of visualState.matchedLandmarks ?? []) {
    register(landmark);
  }

  if (
    visualState.status === "auth-interrupted" ||
    visualState.status === "auth-recovery-failed" ||
    visualState.status === "auth-recovery-timed-out"
  ) {
    return [...terms];
  }

  register(visualState.dialog?.title);
  for (const action of visualState.dialog?.actions ?? []) {
    register(action);
  }
  register(collectVisualElementContextTerm(visualState));

  return [...terms];
}

/**
 * Logs a short summary of the strongest page-confirmed repo-context terms.
 */
export function summarizePageConfirmedContext(
  visualState: VisualState | null
): void {
  const confirmedTerms = collectPageConfirmedContextTerms(visualState);
  if (confirmedTerms.length === 0) {
    return;
  }

  log(
    pc.dim("[taro]") +
      ` Page-confirmed context: ${confirmedTerms.slice(0, 3).join(" | ")}`
  );
}

/**
 * Collects and ranks the recorder terms that should drive repo-context matching.
 */
export function collectRepoContextSearchTerms(
  recording: NormalizedRecording,
  visualState: VisualState | null = null
): string[] {
  const termScores = new Map<string, number>();

  const registerTerm = (value?: string, bonus = 0) => {
    const term = normalizeContextTerm(value);
    if (!term) {
      return;
    }

    termScores.set(
      term,
      (termScores.get(term) ?? 0) + scoreContextTerm(term) + bonus
    );
  };

  for (const confirmedTerm of collectPageConfirmedContextTerms(visualState)) {
    registerTerm(confirmedTerm, PAGE_CONFIRMED_CONTEXT_TERM_BONUS);
  }

  registerTerm(recording.title);
  for (const step of recording.steps) {
    registerTerm(step.target);
    registerTerm(step.value);
  }

  return [...termScores.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([term]) => term)
    .slice(0, 8);
}

/**
 * Scans the repository for source and test files that match the strongest recording context terms.
 */
export async function findRepoContextMatches(params: {
  projectRoot: string;
  terms: string[];
  excludePaths: string[];
}): Promise<RepoContextMatch[]> {
  const { projectRoot, terms, excludePaths } = params;
  if (terms.length === 0) {
    return [];
  }

  const normalizedTerms = terms.map((term) => ({
    raw: term,
    lower: term.toLowerCase(),
    weight: scoreContextTerm(term),
  }));
  const comparableProjectRoot = normalizeComparablePath(resolve(projectRoot));
  const excluded = new Set(
    excludePaths.map((value) => normalizeComparablePath(resolve(value)))
  );
  const excludedRelativePaths = new Set(
    excludePaths
      .map((value) =>
        relative(
          comparableProjectRoot,
          normalizeComparablePath(resolve(value))
        ).replace(/\\/g, "/")
      )
      .filter((value) => value && !value.startsWith(".."))
  );
  const matches: RepoContextMatch[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!CONTEXT_SEARCH_SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (
        !entry.isFile() ||
        !CONTEXT_SEARCH_EXTENSIONS.has(extname(entry.name))
      ) {
        continue;
      }

      const resolvedPath = normalizeComparablePath(resolve(fullPath));
      const relativePath = relative(
        comparableProjectRoot,
        resolvedPath
      ).replace(/\\/g, "/");
      if (
        excluded.has(resolvedPath) ||
        excludedRelativePaths.has(relativePath)
      ) {
        continue;
      }

      let content: string;
      try {
        content = await readFile(resolvedPath, "utf-8");
      } catch {
        continue;
      }

      if (content.length > 500_000) {
        continue;
      }

      const lowered = content.toLowerCase();
      const matchedTerms = normalizedTerms
        .filter((term) => lowered.includes(term.lower))
        .map((term) => term.raw);

      if (matchedTerms.length === 0) {
        continue;
      }

      const score = normalizedTerms
        .filter((term) => matchedTerms.includes(term.raw))
        .reduce((sum, term) => sum + term.weight, 0);

      matches.push({
        filePath: relativePath,
        matchedTerms,
        kind: /\.(test|spec)\.[jt]sx?$/u.test(entry.name) ? "test" : "source",
        score,
      });
    }
  }

  await walk(projectRoot);

  return matches
    .sort((left, right) => {
      return (
        right.score - left.score ||
        right.matchedTerms.length - left.matchedTerms.length ||
        left.filePath.localeCompare(right.filePath)
      );
    })
    .slice(0, 10);
}

/**
 * Formats the top repo-context matches into a compact log-friendly summary.
 */
export function formatContextMatchesSummary(
  matches: RepoContextMatch[]
): string {
  return matches
    .slice(0, 3)
    .map(
      (match) =>
        `${match.filePath} [${match.matchedTerms.slice(0, 2).join(", ")}]`
    )
    .join(" | ");
}

/**
 * Normalizes a path for equality comparisons across macOS `/private/var` aliases.
 */
export function normalizeComparablePath(value: string): string {
  return value.replace(/^\/private(?=\/var\/)/u, "");
}

/**
 * Resolves the most relevant learned package profile from repo-context matches.
 */
export function resolvePackageProfileFromContextMatches(params: {
  state: Awaited<ReturnType<typeof loadOrBootstrapTaroState>>["state"];
  currentProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  overrides: Awaited<ReturnType<typeof readTaroOverrides>>;
  matches: RepoContextMatch[];
}): { profile: ResolvedTaroPackageProfile | null; reason: string | null } {
  const { state, currentProfile, projectRoot, overrides, matches } = params;
  if (matches.length === 0) {
    return { profile: currentProfile, reason: null };
  }

  const scores = new Map<string, { score: number; filePath: string }>();
  const packagePaths = Object.keys(state.packages).sort(
    (left, right) => right.length - left.length
  );

  for (const match of matches) {
    const matchingPackagePath = packagePaths.find((packagePath) => {
      return (
        packagePath !== "." &&
        (match.filePath === packagePath ||
          match.filePath.startsWith(`${packagePath}/`))
      );
    });

    if (!matchingPackagePath) {
      continue;
    }

    const existing = scores.get(matchingPackagePath);
    if (existing) {
      existing.score += match.score;
      continue;
    }

    scores.set(matchingPackagePath, {
      score: match.score,
      filePath: match.filePath,
    });
  }

  const bestMatch = [...scores.entries()].sort(
    (left, right) =>
      right[1].score - left[1].score || left[0].localeCompare(right[0])
  )[0];

  if (!bestMatch) {
    return { profile: currentProfile, reason: null };
  }

  const [packagePath, info] = bestMatch;
  if (currentProfile?.packagePath === packagePath || info.score <= 0) {
    return { profile: currentProfile, reason: null };
  }

  const resolvedProfile = resolveTaroPackageProfile(
    state,
    projectRoot,
    join(projectRoot, packagePath, "__taro-context-match__.test.tsx"),
    overrides
  );

  if (!resolvedProfile) {
    return { profile: currentProfile, reason: null };
  }

  return {
    profile: resolvedProfile,
    reason: `${info.filePath} matched recording text evidence`,
  };
}

/**
 * Converts an absolute file path into a relative import specifier from a directory.
 */
export function toImportPath(
  fromDir: string,
  absoluteFilePath: string
): string {
  const withoutExtension = normalizeComparablePath(absoluteFilePath).replace(
    /\.[^.]+$/u,
    ""
  );
  const relativePath = relative(
    normalizeComparablePath(fromDir),
    withoutExtension
  ).replace(/\\/g, "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

/**
 * Checks whether a filename stem looks like a component or module symbol suitable as a render target.
 */
export function isLikelyRenderTargetSymbol(symbol: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/u.test(symbol);
}

/**
 * Derives repo render-target candidates from source files that matched recording context.
 */
export function deriveContextRenderTargets(params: {
  projectRoot: string;
  outputPath: string;
  matches: RepoContextMatch[];
}): RepoRenderTargetCandidate[] {
  const { projectRoot, outputPath, matches } = params;
  const candidates: RepoRenderTargetCandidate[] = [];
  const seen = new Set<string>();
  const outputDir = dirname(outputPath);

  for (const match of matches) {
    if (match.kind !== "source") {
      continue;
    }

    const absolutePath = join(projectRoot, match.filePath);
    const symbol = basename(match.filePath).replace(/\.[^.]+$/u, "");
    if (!isLikelyRenderTargetSymbol(symbol)) {
      continue;
    }

    const importPath = toImportPath(outputDir, absolutePath);
    const dedupeKey = `${symbol}|${importPath}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    candidates.push({
      symbol,
      importPath,
      sourceTestFile: match.filePath,
      helperNames: [],
      usesWithin: false,
      evidenceTerms: match.matchedTerms,
    });
  }

  return candidates;
}

/**
 * Logs the overall generated-test score and its dimension breakdown.
 */
export function logScore(scoreResult: ScoreResult): void {
  const markerCoverageSummary =
    `markers: detected=${scoreResult.markerCoverage.detected}, ` +
    `emitted=${scoreResult.markerCoverage.emitted}, ` +
    `unresolved=${scoreResult.markerCoverage.unresolved}`;
  log(
    pc.dim("[taro]") +
      ` Score: ${scoreResult.total}/100 (${scoreResult.grade}) — ` +
      `query: ${scoreResult.dimensions.queryQuality}, ` +
      `assertions: ${scoreResult.dimensions.assertionSpecificity}, ` +
      `structure: ${scoreResult.dimensions.testStructure}, ` +
      `boundary: ${scoreResult.dimensions.boundaryIsolation}, ` +
      markerCoverageSummary
  );
}

/**
 * Logs semantic-marker coverage totals and warns when the quality gate is failing.
 */
export function emitMarkerCoverageSection(scoreResult: ScoreResult): void {
  const gateStatus =
    scoreResult.markerQualityGate.status === "warn"
      ? pc.yellow("WARN")
      : pc.green("PASS");
  log(pc.dim("[taro]") + " Marker coverage:");
  log(pc.dim("[taro]") + `   detected: ${scoreResult.markerCoverage.detected}`);
  log(pc.dim("[taro]") + `   emitted: ${scoreResult.markerCoverage.emitted}`);
  log(
    pc.dim("[taro]") + `   unresolved: ${scoreResult.markerCoverage.unresolved}`
  );
  log(
    pc.dim("[taro]") +
      `   QUAL-02 gate: ${gateStatus} (${scoreResult.markerQualityGate.reason})`
  );

  if (scoreResult.markerQualityGate.failing) {
    console.warn(
      pc.yellow(`[taro] QUAL-02 WARN: ${scoreResult.markerQualityGate.message}`)
    );
  }
}

/**
 * Collects every planned marker assertion across all suite scenarios.
 */
export function collectPlannedMarkerAssertions(
  suitePlan: JsSuitePlan
): PlannedMarkerAssertion[] {
  return suitePlan.scenarios.flatMap(
    (scenario) => scenario.markerAssertions ?? []
  );
}

/**
 * Builds marker-review diagnostics from a suite plan.
 */
export function buildMarkerReviewDiagnostics(
  suitePlan: JsSuitePlan | null
): MarkerReviewDiagnostics {
  if (!suitePlan) {
    return EMPTY_MARKER_DIAGNOSTICS;
  }

  let canonicalRecoveries = 0;
  let placementCorrections = 0;

  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    if (markerAssertion.diagnostics?.canonicalRecovery) {
      canonicalRecoveries += 1;
    }
    if (markerAssertion.diagnostics?.placementCorrection) {
      placementCorrections += 1;
    }
  }

  const placementConflicts = collectUnresolvedMarkerAssertions(
    suitePlan
  ).filter((marker) => marker.reason === "boundary-placement-conflict").length;

  return { canonicalRecoveries, placementConflicts, placementCorrections };
}

/**
 * Logs canonical semantic-marker recovery events once per marker step.
 */
export function emitRecoveredMarkerDiagnostics(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const seenMarkerStepIds = new Set<string>();
  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    const recovery = markerAssertion.diagnostics?.canonicalRecovery;
    if (!recovery || seenMarkerStepIds.has(markerAssertion.markerStepId)) {
      continue;
    }

    seenMarkerStepIds.add(markerAssertion.markerStepId);
    log(
      pc.dim("[taro]") +
        ` MKR-01 canonical-copy marker=${markerAssertion.markerStepId} ` +
        `file=${recovery.sourceFile} from="${recovery.fromText}" to="${recovery.toText}"`
    );
  }
}

/**
 * Warns when marker assertions had to be moved between scenarios.
 */
export function emitMarkerPlacementCorrections(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const seenMarkerStepIds = new Set<string>();
  for (const markerAssertion of collectPlannedMarkerAssertions(suitePlan)) {
    const placementCorrection =
      markerAssertion.diagnostics?.placementCorrection;
    if (
      !placementCorrection ||
      seenMarkerStepIds.has(markerAssertion.markerStepId)
    ) {
      continue;
    }

    seenMarkerStepIds.add(markerAssertion.markerStepId);
    console.warn(
      pc.yellow(
        `[taro] MKR-02 placement-correction marker=${markerAssertion.markerStepId} from="${placementCorrection.fromScenarioName}" to="${placementCorrection.toScenarioName}"`
      )
    );
  }
}

/**
 * Normalizes the most helpful hint text for an unresolved marker assertion.
 */
export function normalizeUnresolvedMarkerHint(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const hint =
    marker.proofText ??
    marker.target ??
    marker.query?.raw ??
    marker.selector?.selector;
  const normalized = hint?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : "none";
}

/**
 * Resolves the most specific source line available for an unresolved marker assertion.
 */
export function formatUnresolvedMarkerLine(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const line = marker.line ?? marker.sourceContext.line;
  return Number.isFinite(line) ? String(line) : "unknown";
}

/**
 * Formats an unresolved semantic-marker warning for stderr output.
 */
export function formatUnresolvedMarkerWarning(
  marker: UnresolvedSemanticMarkerAssertionResolution
): string {
  const line = formatUnresolvedMarkerLine(marker);
  const hint = normalizeUnresolvedMarkerHint(marker);
  const guidance = UNRESOLVED_MARKER_REASON_GUIDANCE[marker.reason];

  return (
    `MKR-03 unresolved-marker marker=${marker.markerStepId} ` +
    `line: ${line} reason=${marker.reason} ` +
    `detail="${guidance}" hint="${hint}"`
  );
}

/**
 * Collects unique unresolved semantic-marker assertions across all scenarios.
 */
export function collectUnresolvedMarkerAssertions(
  suitePlan: JsSuitePlan
): UnresolvedSemanticMarkerAssertionResolution[] {
  const seenMarkerStepIds = new Set<string>();
  const unresolvedMarkers: UnresolvedSemanticMarkerAssertionResolution[] = [];

  for (const scenario of suitePlan.scenarios) {
    for (const unresolvedMarker of scenario.unresolvedMarkerAssertions ?? []) {
      if (seenMarkerStepIds.has(unresolvedMarker.markerStepId)) {
        continue;
      }

      seenMarkerStepIds.add(unresolvedMarker.markerStepId);
      unresolvedMarkers.push(unresolvedMarker);
    }
  }

  return unresolvedMarkers;
}

/**
 * Warns for every unresolved semantic marker in a suite plan.
 */
export function emitUnresolvedMarkerWarnings(
  suitePlan: JsSuitePlan | null
): void {
  if (!suitePlan) {
    return;
  }

  const unresolvedMarkers = collectUnresolvedMarkerAssertions(suitePlan);
  for (const unresolvedMarker of unresolvedMarkers) {
    console.warn(
      pc.yellow(`[taro] ${formatUnresolvedMarkerWarning(unresolvedMarker)}`)
    );
  }
}

/**
 * Warns when the generated test still requires manual review.
 */
export function emitLowConfidenceBanner(scoreResult: ScoreResult): void {
  if (!scoreResult.requiresReview) {
    return;
  }

  console.warn(
    pc.yellow(
      `[taro] Manual review required — this generated test is still a draft (${scoreResult.total}/100, ${scoreResult.grade}).`
    )
  );

  if (scoreResult.blockers.length > 0) {
    console.warn(
      pc.yellow(`[taro] Top blockers: ${scoreResult.blockers.join(" | ")}`)
    );
  }
}

/**
 * Emits targeted improvement hints for weak scoring dimensions.
 */
export function emitScoreHints(
  scoreResult: ScoreResult,
  queryResults: QueryResult[] = [],
  boundaryIssues = analyzeBoundaryIsolation("")
): void {
  const reasons = scoreResult.reasons ?? [];

  if (scoreResult.dimensions.queryQuality < 60) {
    const testIdCount = queryResults.filter((queryResult) => {
      return isTestIdQueryMethod(queryResult.method);
    }).length;
    log(
      pc.yellow(
        `[taro] Tip: ${testIdCount} getByTestId queries — consider adding aria-label`
      )
    );
  }

  if (scoreResult.dimensions.assertionSpecificity < 60) {
    log(
      pc.yellow(
        "[taro] Tip: Add specific matchers like toHaveValue() for better assertions"
      )
    );
  }

  if (scoreResult.dimensions.testStructure < 60) {
    if (reasons.some((reason) => reason.code === "branch-coverage-signal")) {
      log(
        pc.yellow(
          `[taro] Tip: Consider whether the component's alternate branches or handlers need separate tests here (surface signal: ${scoreResult.signals.minimumExpectedTestCount} possible cases).`
        )
      );
    } else if (reasons.some((reason) => reason.code === "hardcoded-fixture")) {
      log(
        pc.yellow(
          "[taro] Tip: Reuse BASE_PROPS plus an override-accepting render helper instead of duplicating inline render props."
        )
      );
    } else if (reasons.some((reason) => reason.code === "fire-event-usage")) {
      log(
        pc.yellow(
          "[taro] Tip: Prefer userEvent interactions over fireEvent for user-driven flows."
        )
      );
    } else {
      log(
        pc.yellow(
          "[taro] Tip: Split into multiple it() blocks for better test organization"
        )
      );
    }
  }

  if (scoreResult.dimensions.boundaryIsolation < 60) {
    for (const issue of boundaryIssues) {
      console.warn(pc.yellow(`[taro] Boundary: ${issue.message}`));
      console.warn(pc.yellow(`[taro] Tip: ${issue.suggestion}`));
    }
  }
}

/**
 * Logs the cleanup operations applied during recording analysis.
 */
export function summarizeCleanup(analyzedRecording: AnalyzedRecording): void {
  const { diagnostics } = analyzedRecording;
  const parts: string[] = [];

  if (diagnostics.removedRedundantClicks > 0) {
    parts.push(`${diagnostics.removedRedundantClicks} redundant click(s)`);
  }

  if ((diagnostics.preservedSemanticMarkers ?? 0) > 0) {
    parts.push(
      `${diagnostics.preservedSemanticMarkers} preserved semantic marker(s)`
    );
  }

  if ((diagnostics.unresolvedSemanticMarkers ?? 0) > 0) {
    parts.push(
      `${diagnostics.unresolvedSemanticMarkers} unresolved semantic marker(s)`
    );
  }

  if (diagnostics.removedDoubleClickNoise > 0) {
    parts.push(
      `${diagnostics.removedDoubleClickNoise} dblClick noise event(s)`
    );
  }

  if (diagnostics.removedCursorWander > 0) {
    parts.push(`${diagnostics.removedCursorWander} cursor wander step(s)`);
  }

  if (diagnostics.intentGroupCount > 1) {
    parts.push(`${diagnostics.intentGroupCount} intent groups`);
  }

  if (parts.length === 0) {
    return;
  }

  log(pc.dim("[taro]") + ` Recording cleanup: ${parts.join(", ")}`);
}

/**
 * Counts emitted and unresolved marker assertions across planned scenarios.
 */
export function countPlannedScenarioMarkers(
  scenarios: JsSuitePlan["scenarios"]
): Pick<MarkerCoverageTotals, "emitted" | "unresolved"> {
  return scenarios.reduce(
    (totals, scenario) => ({
      emitted: totals.emitted + (scenario.markerAssertions?.length ?? 0),
      unresolved:
        totals.unresolved + (scenario.unresolvedMarkerAssertions?.length ?? 0),
    }),
    { emitted: 0, unresolved: 0 }
  );
}

/**
 * Builds the marker-coverage totals that should feed generated-test scoring.
 */
export function buildMarkerCoverageSummary(params: {
  analyzedRecording: AnalyzedRecording;
  suitePlan: JsSuitePlan | null;
}): MarkerCoverageTotals {
  const { analyzedRecording, suitePlan } = params;
  const preservedMarkers =
    analyzedRecording.diagnostics.preservedSemanticMarkers ?? 0;
  const diagnosticUnresolvedMarkers =
    analyzedRecording.diagnostics.unresolvedSemanticMarkers ?? 0;

  if (!suitePlan) {
    return {
      detected: preservedMarkers + diagnosticUnresolvedMarkers,
      emitted: 0,
      unresolved: diagnosticUnresolvedMarkers,
    };
  }

  const plannedMarkerTotals = countPlannedScenarioMarkers(suitePlan.scenarios);
  const unresolved = plannedMarkerTotals.unresolved;
  const detected = Math.max(
    preservedMarkers + unresolved,
    plannedMarkerTotals.emitted + unresolved
  );

  return { detected, emitted: plannedMarkerTotals.emitted, unresolved };
}

/**
 * Merges marker-related analysis back into the normalized recording steps.
 */
export function mergeAnalyzedStepState(
  recording: NormalizedRecording,
  analyzedRecording: AnalyzedRecording
): NormalizedRecording {
  const analyzedStepsById = new Map(
    analyzedRecording.steps
      .filter((step): step is NormalizedStep & { id: StepId } =>
        Boolean(step.id)
      )
      .map((step) => [step.id, step])
  );

  return {
    ...recording,
    steps: recording.steps.map((step) => {
      if (!step.id) {
        return step;
      }

      const analyzedStep = analyzedStepsById.get(step.id);
      if (!analyzedStep) {
        return step;
      }

      return {
        ...step,
        ...(analyzedStep.semanticMarkerCandidate
          ? { semanticMarkerCandidate: analyzedStep.semanticMarkerCandidate }
          : {}),
        ...(analyzedStep.semanticMarkerLink
          ? { semanticMarkerLink: analyzedStep.semanticMarkerLink }
          : {}),
        ...(analyzedStep.unresolvedSemanticMarker
          ? { unresolvedSemanticMarker: analyzedStep.unresolvedSemanticMarker }
          : {}),
        metadata: { ...step.metadata, ...analyzedStep.metadata },
      };
    }),
  };
}

/**
 * Returns the analyzed intent groups or a single fallback group when none were inferred.
 */
export function toItGroups(
  analyzedRecording: AnalyzedRecording,
  fallbackTitle: string
): ItGroup[] {
  if (analyzedRecording.intentGroups.length > 0) {
    return analyzedRecording.intentGroups;
  }

  return [
    { name: fallbackTitle || "recorded flow", steps: analyzedRecording.steps },
  ];
}

/**
 * Converts a query descriptor into a scorer-friendly query result.
 */
export function queryDescriptorToResult(
  descriptor: QueryDescriptor
): QueryResult {
  return {
    query: descriptor.raw ?? descriptor.target ?? descriptor.method,
    quality: descriptor.quality ?? "fragile",
    method: descriptor.method,
    line: descriptor.line,
  };
}

/**
 * Checks whether an unknown metadata value is a query descriptor.
 */
export function isQueryDescriptor(value: unknown): value is QueryDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof value.method === "string"
  );
}

/**
 * Returns the preserved query descriptor attached to a normalized step, if present.
 */
export function getStepQueryDescriptor(
  step: NormalizedStep
): QueryDescriptor | undefined {
  const query = step.metadata?.query;
  return isQueryDescriptor(query) ? query : undefined;
}

/**
 * Groups baseline selector descriptors by the step they belong to.
 */
export function groupSelectorsByStepId(
  selectors: SelectorDescriptor[]
): Map<StepId, SelectorDescriptor[]> {
  const grouped = new Map<StepId, SelectorDescriptor[]>();

  for (const selector of selectors) {
    const current = grouped.get(selector.stepId) ?? [];
    current.push(selector);
    grouped.set(selector.stepId, current);
  }

  return grouped;
}

/**
 * Merges new selector-resolution warnings into an existing resolution without duplicating entries.
 */
export function mergeSelectorResolutionWarnings<
  T extends SelectorResolutionResult,
>(resolution: T, warnings: string[]): T {
  const mergedWarnings = Array.from(
    new Set([...resolution.warnings, ...warnings])
  );
  if (mergedWarnings.length === resolution.warnings.length) {
    return resolution;
  }

  return { ...resolution, warnings: mergedWarnings };
}

/**
 * Applies a selector-resolution result to a normalized step's metadata.
 */
export function applySelectorResolution(
  step: NormalizedStep,
  resolution: SelectorResolutionResult
): NormalizedStep {
  return {
    ...step,
    metadata: {
      ...step.metadata,
      selectorResolution: resolution,
      ...(resolution.status === "resolved" ? { query: resolution.query } : {}),
    },
  };
}

function toUnexpectedPageSelectorResolution(params: {
  actualUrl: string;
  expectedUrl: string;
  phase: SelectorResolutionPhase;
  selector: SelectorDescriptor;
}): UnresolvedSelectorResolutionResult {
  const { actualUrl, expectedUrl, phase, selector } = params;
  const reason =
    `Playwright replay page did not reach the recorded URL. ` +
    `Expected ${expectedUrl}, reached ${actualUrl}.`;

  return {
    debug: {
      cssSelector: selector.selector,
      inspectSource: "persistent-page",
      pageUrl: actualUrl,
      phase,
      reason,
      result: "unresolved",
    },
    status: "unresolved",
    outcome: "unexpected-page",
    stepId: selector.stepId,
    selector,
    url: actualUrl,
    reason,
    warnings: [reason],
  };
}

/**
 * Checks whether replaying a step can reveal more DOM state for later selector resolution.
 */
export function canSuccessfulReplayRevealAdditionalState(
  step: NormalizedStep
): boolean {
  return (
    step.action === "click" ||
    step.action === "fill" ||
    step.action === "select" ||
    step.action === "navigate" ||
    step.action === "keyDown"
  );
}

/**
 * Rebinds grouped steps to the latest step objects by step ID.
 */
export function rehydrateItGroups(
  itGroups: ItGroup[],
  steps: NormalizedStep[]
): ItGroup[] {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  return itGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) =>
      step.id ? (stepMap.get(step.id) ?? step) : step
    ),
  }));
}

/**
 * Rebinds every step reference inside a suite plan to the latest step objects.
 */
export function rehydrateSuitePlan(
  plan: JsSuitePlan,
  steps: NormalizedStep[]
): JsSuitePlan {
  const stepMap = new Map(steps.map((step) => [step.id, step]));

  const mapStep = (step: NormalizedStep) =>
    step.id ? (stepMap.get(step.id) ?? step) : step;

  return {
    ...plan,
    itGroups: rehydrateItGroups(plan.itGroups, steps),
    helpers: plan.helpers.map((helper) => ({
      ...helper,
      steps: helper.steps.map(mapStep),
    })),
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      steps: scenario.steps.map(mapStep),
    })),
  };
}

/**
 * Checks whether a step exists only to carry semantic-marker metadata.
 */
export function isSemanticMarkerStep(step: NormalizedStep): boolean {
  return Boolean(step.semanticMarkerLink || step.unresolvedSemanticMarker);
}

/**
 * Removes semantic-marker-only steps from generated `it()` groups.
 */
export function stripSemanticMarkerStepsFromItGroups(
  itGroups: ItGroup[]
): ItGroup[] {
  return itGroups
    .map((group) => ({
      ...group,
      steps: group.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((group) => group.steps.length > 0);
}

/**
 * Removes semantic-marker-only steps from generated helper plans.
 */
export function stripSemanticMarkerStepsFromHelpers(
  helpers: JsSuitePlan["helpers"]
): JsSuitePlan["helpers"] {
  return helpers
    .map((helper) => ({
      ...helper,
      steps: helper.steps.filter((step) => !isSemanticMarkerStep(step)),
    }))
    .filter((helper) => helper.steps.length > 0);
}

/**
 * Removes semantic-marker-only steps from scenarios and prunes helper references that no longer exist.
 */
export function stripSemanticMarkerStepsFromScenarios(
  scenarios: JsSuitePlan["scenarios"],
  helpers: JsSuitePlan["helpers"]
): JsSuitePlan["scenarios"] {
  const helperNames = new Set(helpers.map((helper) => helper.name));

  return scenarios
    .map((scenario) => ({
      ...scenario,
      steps: scenario.steps.filter((step) => !isSemanticMarkerStep(step)),
      helperRefs: scenario.helperRefs.filter((helperRef) =>
        helperNames.has(helperRef)
      ),
    }))
    .filter(
      (scenario) =>
        scenario.steps.length > 0 ||
        scenario.helperRefs.length > 0 ||
        (scenario.markerAssertions?.length ?? 0) > 0
    );
}

/**
 * Deduplicates query results by method, query text, and line number.
 */
export function dedupeQueryResults(queryResults: QueryResult[]): QueryResult[] {
  const seen = new Set<string>();

  return queryResults.filter((queryResult) => {
    const key = `${queryResult.method}:${queryResult.query}:${queryResult.line ?? "na"}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/**
 * Returns the first baseline selector recorded for a flow, if any.
 */
export function getPrimarySelector(
  recording: NormalizedRecording
): string | undefined {
  return recording.baseline?.selectors[0]?.selector;
}

/**
 * Normalizes visible text candidates for page-landmark matching and filters out implementation-like values.
 */
export function normalizeLandmarkCandidate(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.length < 3 ||
    /^https?:\/\//i.test(normalized) ||
    /^(document|location)\./i.test(normalized) ||
    /(?:[#.]|>|:|=|nth-(?:child|of-type)|querySelector)/i.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

/**
 * Returns the asserted document title from a recording, if the flow captured one.
 */
export function findExpectedPageTitle(
  recording: NormalizedRecording
): string | undefined {
  const titleAssertion = recording.steps.find(
    (step) =>
      step.action === "assert" &&
      step.target === "document.title" &&
      typeof step.value === "string"
  );
  return typeof titleAssertion?.value === "string"
    ? titleAssertion.value
    : undefined;
}

/**
 * Collects up to five visible-text landmarks that should confirm the captured page.
 */
export function collectExpectedLandmarks(
  recording: NormalizedRecording
): string[] {
  const values = new Set<string>();
  const register = (candidate?: string) => {
    const normalized = normalizeLandmarkCandidate(candidate);
    if (normalized) {
      values.add(normalized);
    }
  };

  for (const query of recording.baseline?.queries ?? []) {
    register(query.name);
    register(query.target);
  }

  for (const step of recording.steps) {
    if (
      step.action !== "click" &&
      step.action !== "assert" &&
      step.action !== "fill"
    ) {
      continue;
    }

    register(step.target);
    if (typeof step.value === "string") {
      register(step.value);
    }
  }

  return [...values].slice(0, 5);
}

/**
 * Converts an absolute path into the most useful project-relative path for state and log output.
 */
export function toProjectRelativePath(
  projectRoot: string,
  filePath: string
): string {
  const absoluteFilePath = resolve(filePath);
  const normalized = relative(projectRoot, absoluteFilePath).replace(
    /\\/g,
    "/"
  );
  if (normalized && !normalized.startsWith("..")) {
    return normalized;
  }

  const authLikeSuffix = absoluteFilePath
    .replace(/\\/g, "/")
    .match(
      /(?:^|\/)(playwright\/\.auth\/.+|\.auth\/.+|e2e\/\.auth\/.+|tests\/e2e\/\.auth\/.+)$/
    );
  if (authLikeSuffix?.[1]) {
    return authLikeSuffix[1];
  }

  return normalized.length === 0 ? "." : normalized;
}

/**
 * Resolves an optional CLI file argument to absolute and project-relative forms.
 */
export async function resolveOptionalFilePath(
  projectRoot: string,
  inputPath: string | undefined
): Promise<{ absolutePath: string; relativePath: string } | null> {
  if (!inputPath) {
    return null;
  }

  const absolutePath = resolve(projectRoot, inputPath);
  try {
    await access(absolutePath);
    return {
      absolutePath,
      relativePath: toProjectRelativePath(projectRoot, absolutePath),
    };
  } catch {
    console.warn(
      pc.yellow(
        `[taro] Visual auth: file not found ${absolutePath}; continuing without it.`
      )
    );
    return null;
  }
}

/**
 * Checks whether this command run can support interactive visual-auth recovery.
 *
 * A forced interactive flag bypasses stdio TTY detection.
 *
 * @param {{ input?: { isTTY?: boolean }; output?: { isTTY?: boolean } }} [context={}] - Supplies optional stdio handles to inspect instead of the process globals.
 * @param {boolean} [forceInteractiveAuth=false] - Forces interactive auth support even when stdin or stdout is not a TTY.
 * @returns {boolean} `true` when interactive auth recovery is allowed for this run.
 */
export function hasInteractiveVisualAuthCapability(
  context: { input?: { isTTY?: boolean }; output?: { isTTY?: boolean } } = {},
  forceInteractiveAuth = false
): boolean {
  return (
    forceInteractiveAuth ||
    Boolean(context.input?.isTTY && context.output?.isTTY)
  );
}

/**
 * Resolves the storage-state path Taro should reuse or save for visual authentication.
 */
export function resolveVisualAuthStorageStatePath(
  projectRoot: string,
  auth: TaroPlaywrightAuthProfile | null
): { absolutePath: string; relativePath: string } {
  const relativePath =
    auth?.strategy === "storageState"
      ? auth.path
      : DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH;

  return { absolutePath: resolve(projectRoot, relativePath), relativePath };
}

/**
 * Resolves the directory where visual-capture screenshots should be stored.
 */
export function resolveVisualCaptureScreenshotDir(projectRoot: string): string {
  return resolve(projectRoot, ".taro", "playwright", "screenshots");
}

/**
 * Maps a visual-capture result into a concise auth preflight status for logging.
 */
export function resolveAuthPreflightStatus(params: {
  auth: TaroPlaywrightAuthProfile | null;
  url?: string;
  visualState: VisualState | null;
}): AuthPreflightStatus | null {
  const { auth, url, visualState } = params;
  if (!url || !visualState) {
    return null;
  }

  switch (visualState.status) {
    case "auth-recovered":
      return "authenticated";
    case "auth-recovery-failed":
    case "auth-recovery-timed-out":
      return "failed";
    case "auth-interrupted":
      return auth ? "failed" : "unknown_recipe";
    case "captured":
      return auth ? "authenticated" : "not_required";
    case "capture-failed":
      return null;
  }
}

/**
 * Logs the auth preflight status when visual capture produced a meaningful auth outcome.
 */
export function summarizeAuthPreflight(params: {
  auth: TaroPlaywrightAuthProfile | null;
  url?: string;
  visualState: VisualState | null;
}): void {
  const status = resolveAuthPreflightStatus(params);
  if (!status) {
    return;
  }

  log(pc.dim("[taro]") + ` Auth status: ${status}`);
}

/**
 * Logs the learned Playwright auth profile that will be reused for visual capture.
 */
export function summarizePlaywrightAuth(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile?.playwrightAuth) {
    return;
  }

  log(
    pc.dim("[taro]") +
      ` Visual auth: ${packageProfile.playwrightAuth.strategy}=${packageProfile.playwrightAuth.path} (${packageProfile.playwrightAuth.source})`
  );
}

/**
 * Logs each visual-state warning on its own warning line.
 */
export function summarizeVisualStateWarnings(visualState: VisualState): void {
  for (const warning of visualState.warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`));
  }
}

/**
 * Logs the screenshot path for an auth checkpoint when one was captured.
 */
export function summarizeAuthCheckpointScreenshot(
  visualState: VisualState
): void {
  if (visualState.screenshotPath) {
    log(
      pc.dim("[taro]") +
        ` Auth checkpoint screenshot: ${visualState.screenshotPath}`
    );
  }
}

/**
 * Logs the screenshot path for a confirmed starting point when one was captured.
 */
export function summarizeStartingPointScreenshot(
  visualState: VisualState
): void {
  if (visualState.screenshotPath) {
    log(
      pc.dim("[taro]") +
        ` Starting point screenshot: ${visualState.screenshotPath}`
    );
  }
}

/**
 * Logs the auth interruption details that explain why visual capture could not reach the target UI.
 */
export function summarizeAuthInterruptedVisualState(
  visualState: VisualState
): void {
  const interrupt = visualState.interrupt;
  console.warn(
    pc.yellow(
      "[taro] Visual context unavailable: authentication required before reaching the target UI."
    )
  );

  if (interrupt) {
    console.warn(
      pc.yellow("[taro]") +
        ` Reached: ${interrupt.reachedUrl}${interrupt.actualTitle ? ` (${interrupt.actualTitle})` : ""}`
    );
    if (interrupt.expectedUrl) {
      console.warn(pc.yellow("[taro]") + ` Expected: ${interrupt.expectedUrl}`);
    }
    if (interrupt.expectedTitle) {
      console.warn(
        pc.yellow("[taro]") + ` Expected title: ${interrupt.expectedTitle}`
      );
    }
    console.warn(
      pc.yellow("[taro]") + ` Signals: ${interrupt.signals.join(", ")}`
    );
    if (interrupt.strategy === "storageState" && interrupt.path) {
      console.warn(
        pc.yellow("[taro]") +
          ` Reuse or replace the saved storage state with --auth ${interrupt.path}.`
      );
    } else if (interrupt.strategy === "instructions" && interrupt.path) {
      console.warn(
        pc.yellow("[taro]") +
          ` Review the saved auth instructions at ${interrupt.path}, or provide --auth for automatic session injection.`
      );
    } else {
      console.warn(
        pc.yellow("[taro]") +
          " Options: --auth <storageState.json>, --instructions <auth.md>, or --no-screenshots."
      );
    }
  }

  summarizeAuthCheckpointScreenshot(visualState);
}

/**
 * Logs the details for a visual state recovered through Playwright authentication.
 */
export function summarizeRecoveredVisualState(visualState: VisualState): void {
  log(pc.dim("[taro]") + " Visual auth recovered via Playwright runtime.");
  if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
    const retryAttemptCount =
      visualState.authRecovery.retryToExpectedUrl.attemptCount ?? 1;
    const retryLabel =
      retryAttemptCount === 1 ? "once" : `${retryAttemptCount} times`;
    log(
      pc.dim("[taro]") +
        ` Retried recorded URL ${retryLabel} after auth recovery: ${visualState.authRecovery.retryToExpectedUrl.targetUrl}`
    );
  }
  if (visualState.startingPointConfirmed) {
    log(
      pc.dim("[taro]") + ` Starting point confirmed: ${visualState.finalUrl}`
    );
  }
  if (visualState.authRecovery?.persistedAuthPath) {
    log(
      pc.dim("[taro]") +
        ` Saved Playwright storageState: ${visualState.authRecovery.persistedAuthPath}`
    );
  }

  summarizeStartingPointScreenshot(visualState);
}

/**
 * Logs the details for a failed or timed-out Playwright auth recovery attempt.
 */
export function summarizeFailedAuthRecoveryVisualState(
  visualState: VisualState
): void {
  const label =
    visualState.status === "auth-recovery-timed-out"
      ? "Playwright authentication timed out."
      : "Playwright authentication could not be completed.";
  console.warn(pc.yellow(`[taro] ${label}`));
  if (visualState.authRecovery?.instructionsPath) {
    console.warn(
      pc.yellow("[taro]") +
        ` Visual auth instructions: ${visualState.authRecovery.instructionsPath}`
    );
  }
  if (visualState.authRecovery?.retryToExpectedUrl?.attempted) {
    const retry = visualState.authRecovery.retryToExpectedUrl;
    const retryAttemptCount = retry.attemptCount ?? 1;
    const retryLabel =
      retryAttemptCount === 1 ? "once" : `${retryAttemptCount} times`;
    const failureDetail =
      retry.outcome === "failed" && retry.error ? ` (${retry.error})` : "";
    console.warn(
      pc.yellow("[taro]") +
        ` Retried recorded URL ${retryLabel} after auth recovery: ${retry.targetUrl}${failureDetail}`
    );
  }
  if (visualState.authRecovery?.persistedAuthPath) {
    console.warn(
      pc.yellow("[taro]") +
        ` Saved Playwright storageState: ${visualState.authRecovery.persistedAuthPath}`
    );
  }

  summarizeAuthCheckpointScreenshot(visualState);
  summarizeVisualStateWarnings(visualState);
}

/**
 * Logs the generic captured visual state summary for non-auth-special cases.
 */
export function summarizeCapturedVisualState(visualState: VisualState): void {
  const parts = [visualState.reason];
  if (visualState.dialog?.title) {
    parts.push(`dialog=${visualState.dialog.title}`);
  }
  if (visualState.startingPointConfirmed) {
    parts.push(`page=${visualState.finalUrl}`);
  }
  if (visualState.screenshotPath && !visualState.startingPointConfirmed) {
    parts.push(`screenshot=${visualState.screenshotPath}`);
  }

  log(pc.dim("[taro]") + ` Visual state: ${parts.join(", ")}`);
  if (visualState.startingPointConfirmed) {
    summarizeStartingPointScreenshot(visualState);
  }
  summarizeVisualStateWarnings(visualState);
}

/**
 * Logs the visual-capture outcome, including auth interruptions, recovery, and warnings.
 */
export function summarizeVisualState(visualState: VisualState | null): void {
  if (!visualState) {
    return;
  }

  if (visualState.status === "capture-failed") {
    summarizeVisualStateWarnings(visualState);
    return;
  }

  if (visualState.status === "auth-interrupted") {
    summarizeAuthInterruptedVisualState(visualState);
    return;
  }

  if (visualState.status === "auth-recovered") {
    summarizeRecoveredVisualState(visualState);
    return;
  }

  if (
    visualState.status === "auth-recovery-failed" ||
    visualState.status === "auth-recovery-timed-out"
  ) {
    summarizeFailedAuthRecoveryVisualState(visualState);
    return;
  }

  summarizeCapturedVisualState(visualState);
}

/**
 * Logs the strongest mock-analysis findings and policy warnings.
 */
export function summarizeMockAnalysis(mockAnalysis: MockAnalysis | null): void {
  if (!mockAnalysis) {
    return;
  }

  const parts: string[] = [];
  if (mockAnalysis.source === "package-profile" && mockAnalysis.packagePath) {
    parts.push(`package=${mockAnalysis.packagePath}`);
  }

  if (mockAnalysis.repeatedTargets.length > 0) {
    parts.push(`${mockAnalysis.repeatedTargets.length} repeated target(s)`);
  }

  if (mockAnalysis.mutationLifecycles.length > 0) {
    parts.push(`${mockAnalysis.mutationLifecycles.length} mutation flow(s)`);
  }
  if (mockAnalysis.interactionContracts.length > 0) {
    parts.push(
      `${mockAnalysis.interactionContracts.length} interaction contract(s)`
    );
  }

  if (mockAnalysis.instabilityWarnings.length > 0) {
    parts.push(
      `${mockAnalysis.instabilityWarnings.length} stability warning(s)`
    );
  }
  if (mockAnalysis.boundaryProfiles.length > 0) {
    parts.push(`${mockAnalysis.boundaryProfiles.length} boundary profile(s)`);
  }

  if (parts.length === 0) {
    return;
  }

  log(pc.dim("[taro]") + ` Mock analysis: ${parts.join(", ")}`);

  const topRecommendation = mockAnalysis.recommendations[0];
  if (topRecommendation) {
    log(
      pc.dim("[taro]") +
        ` Mock hint: ${topRecommendation.kind} ${topRecommendation.target} (${topRecommendation.count} file(s))`
    );
  }

  const preferredSharedMock = Object.entries(
    mockAnalysis.preferredSharedMocks
  )[0];
  if (preferredSharedMock) {
    log(
      pc.dim("[taro]") +
        ` Shared mock preference: ${preferredSharedMock[0]} -> ${preferredSharedMock[1]}`
    );
  }

  if (mockAnalysis.forbidMocks.length > 0) {
    console.warn(
      pc.yellow(
        `[taro] Mock policy: forbidden targets ${mockAnalysis.forbidMocks.join(", ")}`
      )
    );
  }
  if (mockAnalysis.forbidBoundaryTargets.length > 0) {
    console.warn(
      pc.yellow(
        `[taro] Boundary policy: forbidden targets ${mockAnalysis.forbidBoundaryTargets.join(", ")}`
      )
    );
  }

  const topLifecycle = mockAnalysis.mutationLifecycles[0];
  if (topLifecycle) {
    log(
      pc.dim("[taro]") +
        ` Mutation lifecycle: ${topLifecycle.stages.join(" -> ")} in ${topLifecycle.file}`
    );
  }

  const topContract = mockAnalysis.interactionContracts[0];
  if (topContract) {
    log(
      pc.dim("[taro]") +
        ` Interaction contract: ${topContract.kind} (${topContract.states.join(", ")}) in ${topContract.file}`
    );
  }

  const topWarning = mockAnalysis.instabilityWarnings[0];
  if (topWarning) {
    console.warn(
      pc.yellow(
        `[taro] Mock stability: ${topWarning.reason} (${topWarning.file})`
      )
    );
  }
}

/**
 * Logs each suite-planning boundary warning as a separate warning line.
 */
export function summarizeBoundaryWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] Boundary: ${warning}`));
  }
}

/**
 * Logs the primary suite contract and synthesized-scenario count.
 */
export function summarizeSuiteContracts(plan: JsSuitePlan): void {
  if (plan.contracts.length === 0) {
    return;
  }

  const primaryContract = plan.contracts[0]!;
  const synthesizedCount = plan.scenarios.filter(
    (scenario) => scenario.provenance === "synthesized-companion"
  ).length;

  log(
    pc.dim("[taro]") +
      ` Contract planner: ${primaryContract.kind}, confidence=${primaryContract.confidence}, synthesized=${synthesizedCount}`
  );
}

/**
 * Logs the resolved package profile or warns when generation is using generic defaults.
 */
export function summarizeResolvedPackageProfile(
  packageProfile: ResolvedTaroPackageProfile | null
): void {
  if (!packageProfile) {
    console.warn(
      pc.yellow(
        "[taro] State profile: no matching package profile found; using generic defaults."
      )
    );
    return;
  }

  const parts = [
    `package=${packageProfile.packagePath}`,
    `runner=${packageProfile.effectiveRunner}`,
    `renderHelper=${packageProfile.effectiveRenderHelper?.name ?? "none"}`,
    `sharedMocks=${packageProfile.sharedMockFactories.length}`,
    `boundaries=${packageProfile.boundaryProfiles.length}`,
    `inlineMocks=${packageProfile.inlineSafeMockTargets.length}`,
  ];

  log(pc.dim("[taro]") + ` State profile: ${parts.join(", ")}`);
}

/**
 * Audits generated code for boundary-policy violations and missing learned support wiring.
 */
export async function auditBoundaryPolicy(
  code: string,
  packageProfile: ResolvedTaroPackageProfile | null,
  renderTargetFile: string | null
): Promise<string[]> {
  if (!packageProfile) {
    if (!renderTargetFile) {
      return [];
    }
  }

  const warnings: string[] = [];
  const discoveredImports = renderTargetFile
    ? await discoverBoundaryImportsFromSource(renderTargetFile)
    : [];
  const forbiddenTargets = new Set<string>([
    ...(packageProfile?.forbidMocks ?? []),
    ...(packageProfile?.forbidBoundaryTargets ?? []),
    ...(packageProfile?.boundaryProfiles ?? [])
      .filter((profile) => profile.strategy === "forbid")
      .map((profile) => profile.target),
    ...discoveredImports
      .filter((importedBoundary) => importedBoundary.guardrailReason)
      .map((importedBoundary) => importedBoundary.target),
  ]);

  for (const target of forbiddenTargets) {
    if (
      code.includes(`vi.mock('${target}'`) ||
      code.includes(`vi.mock("${target}"`) ||
      code.includes(`jest.mock('${target}'`) ||
      code.includes(`jest.mock("${target}"`)
    ) {
      warnings.push(
        `Generated test mocks forbidden boundary target "${target}".`
      );
    }
  }

  for (const discoveredImport of discoveredImports) {
    if (
      discoveredImport.guardrailReason !== "repo-owned-ui-wrapper" ||
      (!code.includes(`vi.mock('${discoveredImport.target}'`) &&
        !code.includes(`vi.mock("${discoveredImport.target}"`) &&
        !code.includes(`jest.mock('${discoveredImport.target}'`) &&
        !code.includes(`jest.mock("${discoveredImport.target}"`))
    ) {
      continue;
    }

    warnings.push(
      `Generated test violates a keep-real boundary pattern for "${discoveredImport.target}". Solve render-layer issues at the boundary itself instead of mocking through the wrapper.`
    );
  }

  for (const profile of packageProfile?.boundaryProfiles ?? []) {
    const pattern =
      profile.pattern ??
      inferBoundaryPattern({
        strategy: profile.strategy,
        guardrailReason: profile.guardrailReason,
        supportImportPath: profile.supportImportPath,
        supportExports: profile.supportExports,
      });
    const mocksBoundary =
      code.includes(`vi.mock('${profile.target}'`) ||
      code.includes(`vi.mock("${profile.target}"`) ||
      code.includes(`jest.mock('${profile.target}'`) ||
      code.includes(`jest.mock("${profile.target}"`);

    if (
      pattern === "partial-support-import" &&
      profile.supportImportPath &&
      mocksBoundary &&
      !code.includes(profile.supportImportPath)
    ) {
      warnings.push(
        `Generated test ignored a learned partial-support pattern for "${profile.target}". Reuse the repo support import and keep the shared boundary mostly real.`
      );
      continue;
    }

    if (
      pattern === "factory-support" &&
      profile.supportImportPath &&
      mocksBoundary &&
      !code.includes(profile.supportImportPath)
    ) {
      warnings.push(
        `Generated test bypasses a learned factory-support pattern for "${profile.target}". Reuse the strongest local support handles instead of rebuilding the boundary inline.`
      );
    }
  }

  if (
    packageProfile?.boundaryProfiles.some(
      (profile) => profile.strategy === "provider-wrapper"
    ) &&
    !packageProfile?.effectiveRenderHelper &&
    code.includes("render(")
  ) {
    warnings.push(
      "Generated test may bypass a learned provider-wrapper boundary because no shared render helper was applied."
    );
  }

  return warnings;
}

/**
 * Tokenizes free-form suite hints into lowercase alphanumeric search tokens.
 */
export function tokenizeSuiteHint(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/**
 * Scores how well a repo render-target candidate matches the current recording and suite plan.
 */
export function scoreRenderTargetCandidate(
  candidate: RepoRenderTargetCandidate,
  recording: NormalizedRecording,
  mockAnalysis: MockAnalysis | null,
  suitePlan: JsSuitePlan,
  options: {
    packageProfile?: ResolvedTaroPackageProfile | null;
    visualState?: VisualState | null;
  } = {}
): number {
  const { packageProfile, visualState } = options;
  const recordingTokens = new Set([
    ...tokenizeSuiteHint(recording.title),
    ...recording.steps.flatMap((step) => tokenizeSuiteHint(step.target ?? "")),
  ]);
  const confirmedTokens = new Set(
    collectPageConfirmedContextTerms(visualState ?? null).flatMap((term) =>
      tokenizeSuiteHint(term)
    )
  );
  const candidateTokens = new Set([
    ...tokenizeSuiteHint(candidate.symbol),
    ...tokenizeSuiteHint(candidate.importPath),
    ...tokenizeSuiteHint(candidate.sourceTestFile),
    ...candidate.helperNames.flatMap((name) => tokenizeSuiteHint(name)),
    ...(candidate.evidenceTerms ?? []).flatMap((term) =>
      tokenizeSuiteHint(term)
    ),
  ]);

  let score = 0;
  for (const token of candidateTokens) {
    if (recordingTokens.has(token)) {
      score += 3;
    }
    if (confirmedTokens.has(token)) {
      score += 5;
    }
  }

  if (
    /Module$/u.test(candidate.symbol) &&
    suitePlan.renderBoundary.kind === "module"
  ) {
    score += 4;
  }

  if (candidate.usesWithin) {
    score += 1;
  }

  if (mockAnalysis?.repeatedTargets.length) {
    score += 1;
  }

  if (
    packageProfile?.packagePath &&
    packageProfile.packagePath !== "." &&
    (candidate.sourceTestFile === packageProfile.packagePath ||
      candidate.sourceTestFile.startsWith(`${packageProfile.packagePath}/`))
  ) {
    score += 8;
  }

  return score;
}

/**
 * Selects the best repo render target from the available candidates.
 */
export function resolveRepoRenderTarget(params: {
  candidates: RepoRenderTargetCandidate[];
  packageProfile?: ResolvedTaroPackageProfile | null;
  recording: NormalizedRecording;
  mockAnalysis: MockAnalysis | null;
  suitePlan: JsSuitePlan;
  visualState?: VisualState | null;
}): RepoRenderTargetCandidate | null {
  const {
    candidates,
    packageProfile,
    recording,
    mockAnalysis,
    suitePlan,
    visualState,
  } = params;
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRenderTargetCandidate(
        candidate,
        recording,
        mockAnalysis,
        suitePlan,
        { packageProfile, visualState }
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.symbol.localeCompare(right.candidate.symbol)
    );

  return ranked[0]?.candidate ?? null;
}

/**
 * Applies a resolved repo render target to a suite plan and clears placeholder warnings.
 */
export function applyRepoRenderTarget(
  suitePlan: JsSuitePlan,
  renderTarget: RepoRenderTargetCandidate | null
): JsSuitePlan {
  if (!renderTarget) {
    return suitePlan;
  }

  return {
    ...suitePlan,
    renderBoundary: {
      ...suitePlan.renderBoundary,
      resolvedTarget: renderTarget.symbol,
      confidence:
        suitePlan.renderBoundary.confidence === "low"
          ? "medium"
          : suitePlan.renderBoundary.confidence,
    },
    warnings: suitePlan.warnings.filter(
      (warning) =>
        !warning.includes(
          "Taro could not resolve the exact render target from repo context"
        ) &&
        !warning.includes(
          "Prefer a repo-local module/container render boundary"
        )
    ),
  };
}

/**
 * Returns the recording URL from analyzed metadata or the first navigate step.
 */
export function findRecordingUrl(
  analyzedRecording: AnalyzedRecording
): string | undefined {
  return (
    analyzedRecording.url ??
    analyzedRecording.steps.find((step) => step.action === "navigate")?.target
  );
}

/**
 * Resolves baseline selectors into queries and rehydrates the recording state used for JS generation.
 */
export async function resolveJsGeneration(
  recording: NormalizedRecording,
  itGroups: ItGroup[],
  options?: {
    auth?: CaptureVisualStateAuthOptions | null;
    debugReporter?: SelectorDebugReporter;
  }
): Promise<{
  itGroups: ItGroup[];
  queryResults: QueryResult[];
  recording: NormalizedRecording;
  warnings: string[];
}> {
  const baseline = recording.baseline;
  if (!baseline) {
    return { itGroups, queryResults: [], recording, warnings: [] };
  }

  const queryResults = baseline.queries.map(queryDescriptorToResult);
  const warnings: string[] = [];
  const selectorGroups = groupSelectorsByStepId(baseline.selectors);
  const stepMap = new Map(
    recording.steps
      .filter((step): step is NormalizedStep & { id: StepId } =>
        Boolean(step.id)
      )
      .map((step) => [step.id, step])
  );
  const updatedSteps = new Map<StepId, NormalizedStep>();

  const hasSelectorsToResolve = selectorGroups.size > 0;
  const hasUrl = Boolean(recording.url);
  const debugReporter = options?.debugReporter;

  if (hasSelectorsToResolve && hasUrl) {
    log(
      pc.dim("[taro]") +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright with step replay...`
    );

    const selectorStepIds = new Set(selectorGroups.keys());
    let browser: import("playwright").Browser | null = null;

    try {
      const authOptions = options?.auth ?? undefined;
      const captureSession = await openCapturePage({
        auth: authOptions,
        headless: true,
        timeoutMs: 10000,
        url: recording.url!,
      });
      browser = captureSession.browser;
      const page = captureSession.page;
      const inspect = createPageInspector(page);
      const unresolvedSelectorResolutions = new Map<
        StepId,
        UnresolvedSelectorResolutionResult
      >();
      const replayPageUrl =
        typeof page.url === "function" ? page.url() : recording.url!;

      const resolveStepSelectors = async (
        stepId: StepId,
        phase: SelectorResolutionPhase
      ): Promise<{ resolved: number }> => {
        const selectors = selectorGroups.get(stepId)!;
        const currentStep = updatedSteps.get(stepId) ?? stepMap.get(stepId)!;

        const preservedQuery = getStepQueryDescriptor(currentStep);
        const stepWarnings: string[] = [];
        let chosenResolution: SelectorResolutionResult | undefined;

        if (preservedQuery) {
          chosenResolution = await resolveSelector(selectors[0]!, {
            debug: { inspectSource: "preserved-query", phase },
            url: recording.url,
            preservedQuery,
          });
          debugReporter?.traceSelector(chosenResolution);
        } else {
          for (const selector of selectors) {
            const resolution = await resolveSelector(selector, {
              debug: { inspectSource: "persistent-page", phase },
              url: recording.url,
              inspect,
            });
            debugReporter?.traceSelector(resolution);

            if (resolution.status === "resolved") {
              chosenResolution = resolution;
              break;
            }

            stepWarnings.push(...resolution.warnings);
            chosenResolution ??= resolution;
          }
        }

        const resolution = mergeSelectorResolutionWarnings(
          chosenResolution!,
          stepWarnings
        );
        updatedSteps.set(
          stepId,
          applySelectorResolution(currentStep, resolution)
        );

        if (resolution.status === "resolved") {
          unresolvedSelectorResolutions.delete(stepId);
          if (resolution.outcome !== "preserved-query") {
            queryResults.push(queryDescriptorToResult(resolution.query));
          }
          return { resolved: 1 };
        }

        unresolvedSelectorResolutions.set(stepId, resolution);
        return { resolved: 0 };
      };

      if (urlsMateriallyDiffer(recording.url!, replayPageUrl)) {
        const mismatchWarning =
          `Step replay skipped: replay page did not reach the recorded URL. ` +
          `Expected ${recording.url!}, reached ${replayPageUrl}.`;
        debugReporter?.traceBrowserFailure({
          authStrategy: options?.auth?.strategy,
          error: mismatchWarning,
          url: recording.url!,
        });
        console.warn(pc.yellow("[taro]") + ` ${mismatchWarning}`);

        for (const [stepId, selectors] of selectorGroups.entries()) {
          const currentStep = updatedSteps.get(stepId) ?? stepMap.get(stepId);
          if (!currentStep) {
            continue;
          }

          const stepWarnings: string[] = [];
          let chosenResolution: UnresolvedSelectorResolutionResult | undefined;
          for (const selector of selectors) {
            const resolution = toUnexpectedPageSelectorResolution({
              actualUrl: replayPageUrl,
              expectedUrl: recording.url!,
              phase: "fallback-no-replay",
              selector,
            });
            debugReporter?.traceSelector(resolution);
            stepWarnings.push(...resolution.warnings);
            chosenResolution ??= resolution;
          }

          const resolution = mergeSelectorResolutionWarnings(
            chosenResolution!,
            stepWarnings
          );
          updatedSteps.set(
            stepId,
            applySelectorResolution(currentStep, resolution)
          );
          unresolvedSelectorResolutions.set(stepId, resolution);
        }
      } else {
        for (const step of recording.steps) {
          const stepId = step.id;
          let selectorsResolvedThisStep = 0;

          if (stepId && selectorStepIds.has(stepId)) {
            const stats = await resolveStepSelectors(stepId, "pre-step");
            selectorsResolvedThisStep += stats.resolved;
          }

          const replayResult = await replayStep(page, step, {
            collectDebug: debugReporter?.enabled,
          });
          debugReporter?.traceReplay(replayResult.debug);
          if (!replayResult.replayed && replayResult.warning) {
            console.warn(
              pc.yellow("[taro]") +
                pc.dim(" Step replay: ") +
                replayResult.warning
            );
          }

          if (
            replayResult.replayed &&
            canSuccessfulReplayRevealAdditionalState(step) &&
            unresolvedSelectorResolutions.size > 0
          ) {
            for (const unresolvedStepId of unresolvedSelectorResolutions.keys()) {
              const stats = await resolveStepSelectors(
                unresolvedStepId,
                "post-step"
              );
              selectorsResolvedThisStep += stats.resolved;
            }
          }

          debugReporter?.traceStepSummary({
            action: step.action,
            replayed: replayResult.replayed,
            selectorsResolved: selectorsResolvedThisStep,
            selectorsStillUnresolved: unresolvedSelectorResolutions.size,
            stepId: stepId ?? "(unknown)",
            warningCount: replayResult.warning ? 1 : 0,
          });
        }
      }

      for (const resolution of unresolvedSelectorResolutions.values()) {
        warnings.push(
          `QRY-03 [${resolution.stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      debugReporter?.traceBrowserFailure({
        authStrategy: options?.auth?.strategy,
        error: message,
        url: recording.url!,
      });
      console.warn(
        pc.yellow("[taro]") +
          ` Step replay browser failed: ${message}. Selectors will remain unresolved.`
      );
    } finally {
      await browser?.close().catch(() => undefined);
    }
  } else if (hasSelectorsToResolve) {
    log(
      pc.dim("[taro]") +
        ` Resolving ${baseline.selectors.length} selector(s) via Playwright...`
    );

    for (const [stepId, selectors] of selectorGroups) {
      const step = updatedSteps.get(stepId) ?? stepMap.get(stepId);
      if (!step) {
        continue;
      }

      const preservedQuery = getStepQueryDescriptor(step);
      const stepWarnings: string[] = [];
      let chosenResolution: SelectorResolutionResult | undefined;

      if (preservedQuery) {
        chosenResolution = await resolveSelector(selectors[0]!, {
          debug: {
            inspectSource: "preserved-query",
            phase: "fallback-no-replay",
          },
          url: recording.url,
          preservedQuery,
        });
        debugReporter?.traceSelector(chosenResolution);
      } else {
        for (const selector of selectors) {
          const resolution = await resolveSelector(selector, {
            debug: {
              inspectSource: "fresh-browser",
              phase: "fallback-no-replay",
            },
            url: recording.url,
          });
          debugReporter?.traceSelector(resolution);

          if (resolution.status === "resolved") {
            chosenResolution = resolution;
            break;
          }

          stepWarnings.push(...resolution.warnings);
          chosenResolution ??= resolution;
        }
      }

      const resolution = mergeSelectorResolutionWarnings(
        chosenResolution!,
        stepWarnings
      );
      updatedSteps.set(stepId, applySelectorResolution(step, resolution));

      if (resolution.status === "resolved") {
        if (resolution.outcome !== "preserved-query") {
          queryResults.push(queryDescriptorToResult(resolution.query));
        }
        continue;
      }

      warnings.push(
        `QRY-03 [${stepId}] unresolved selector ${resolution.selector.selector}: ${resolution.reason}`
      );
    }
  }

  const resolvedSteps = recording.steps.map((step) =>
    step.id ? (updatedSteps.get(step.id) ?? step) : step
  );

  return {
    itGroups: rehydrateItGroups(itGroups, resolvedSteps),
    queryResults: dedupeQueryResults(queryResults),
    recording: {
      ...recording,
      baseline: {
        ...baseline,
        itGroups: rehydrateItGroups(baseline.itGroups, resolvedSteps),
      },
      steps: resolvedSteps,
    },
    warnings,
  };
}

/**
 * Logs each selector-resolution warning as a warning line.
 */
export function summarizeSelectorWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(pc.yellow(`[taro] ${warning}`));
  }
}

/**
 * Captures visual state for the recording URL when screenshots or page confirmation are available.
 */
export async function maybeCaptureVisualState(params: {
  analyzedRecording: AnalyzedRecording;
  auth?: TaroPlaywrightAuthProfile | null;
  authRecovery?: {
    enabled: boolean;
    instructionsPath?: string;
    persistedAuthPath?: string;
    saveStorageStatePath?: string;
    timeoutMs: number;
  };
  projectRoot: string;
  recording: NormalizedRecording;
  selector?: string;
  skipScreenshotArtifacts?: boolean;
  url?: string;
}): Promise<VisualState | null> {
  const {
    analyzedRecording,
    auth,
    authRecovery,
    projectRoot,
    recording,
    selector,
    skipScreenshotArtifacts = false,
    url,
  } = params;
  if (!url) {
    return null;
  }

  const candidates = findVisualCaptureCandidates(analyzedRecording);
  const expected = {
    landmarks: collectExpectedLandmarks(recording),
    title: findExpectedPageTitle(recording),
    url,
  };
  const screenshotDir = skipScreenshotArtifacts
    ? undefined
    : resolveVisualCaptureScreenshotDir(projectRoot);
  const authOptions = auth
    ? { path: resolve(projectRoot, auth.path), strategy: auth.strategy }
    : null;

  if (candidates.length > 0) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: candidates[0]!.reason,
      screenshotDir,
      selector: candidates[0]!.selector,
    });
  }

  if (selector) {
    return captureVisualState(url, {
      auth: authOptions,
      authRecovery,
      expected,
      reason: "ambiguous-ui",
      screenshotDir,
      selector,
    });
  }

  return captureVisualState(url, {
    auth: authOptions,
    authRecovery,
    expected,
    reason: "page-context",
    screenshotDir,
  });
}

/**
 * Persists a newly recovered Playwright storage-state profile when visual auth succeeded.
 */
export async function persistRecoveredVisualAuth(params: {
  packageProfile: ResolvedTaroPackageProfile | null;
  projectRoot: string;
  visualState: VisualState | null;
}): Promise<TaroPlaywrightAuthProfile | null> {
  const { packageProfile, projectRoot, visualState } = params;
  if (!visualState?.authRecovery?.persistedAuthPath) {
    return null;
  }

  const persistedAuth: TaroPlaywrightAuthProfile = {
    strategy: "storageState",
    path: visualState.authRecovery.persistedAuthPath,
    detectedAt: "generate",
    source: "manual",
  };

  if (!packageProfile) {
    console.warn(
      pc.yellow(
        "[taro] Visual auth: storageState was saved, but no package profile was available to persist it in state."
      )
    );
    return persistedAuth;
  }

  try {
    const persisted = await persistPlaywrightAuthProfile(
      projectRoot,
      packageProfile.packagePath,
      persistedAuth
    );
    if (persisted) {
      log(
        pc.dim("[taro]") +
          ` Persisted visual auth for package ${packageProfile.packagePath}: ${persistedAuth.strategy}=${persistedAuth.path}`
      );
    } else {
      console.warn(
        pc.yellow(
          "[taro] Visual auth: storageState was saved, but Taro could not persist it in state."
        )
      );
    }
  } catch {
    console.warn(
      pc.yellow(
        "[taro] Visual auth: storageState was saved, but persisting it in .taro/state.json failed."
      )
    );
  }

  return persistedAuth;
}

/**
 * Runs repo mock analysis and converts failures into a safe `null` result.
 */
export async function maybeAnalyzeMocks(
  projectRoot: string,
  packageProfile: ResolvedTaroPackageProfile | null
): Promise<MockAnalysis | null> {
  try {
    return await analyzeMocks(projectRoot, { packageProfile });
  } catch {
    return null;
  }
}

/**
 * Verifies generated code and records the successful output in Taro state.
 */
export async function finalizeGeneratedOutput(params: {
  code: string;
  outputPath: string;
  projectRoot: string;
  recordingFile: string;
  scoreResult: ScoreResult;
  packageProfile: ResolvedTaroPackageProfile | null;
}): Promise<void> {
  const {
    code,
    outputPath,
    projectRoot,
    recordingFile,
    scoreResult,
    packageProfile,
  } = params;

  const verification = verifySyntax(code, outputPath);
  if (!verification.valid) {
    console.error(pc.red("[taro] Error: Post-write verification failed"));
    console.error(pc.red(`  ${verification.error}`));
    console.error(pc.red("  This is a Taro bug. Please report it."));
    process.exit(2);
  }

  log(pc.green("[taro] ✓ post-write verified"));

  try {
    await appendGeneratedTestRecord(projectRoot, {
      packagePath: packageProfile?.packagePath ?? ".",
      recordingFile,
      testFile: outputPath,
      scoreResult,
    });
    log(
      pc.dim("[taro]") +
        ` Updated .taro/state.json for package ${packageProfile?.packagePath ?? "."}.`
    );
  } catch {
    // State updates are best-effort; generation should still succeed.
  }
}

export const generateCommandInternals = {
  applyRepoRenderTarget,
  auditBoundaryPolicy,
  buildMarkerCoverageSummary,
  buildMarkerReviewDiagnostics,
  collectComparableTokens,
  collectExpectedLandmarks,
  collectStepCoverageTokens,
  collectUnresolvedMarkerAssertions,
  collectVisualElementContextTerm,
  compareOutputAssessments,
  dedupeQueryResults,
  deriveContextRenderTargets,
  emitLowConfidenceBanner,
  emitMarkerPlacementCorrections,
  emitRecoveredMarkerDiagnostics,
  emitScoreHints,
  emitUnresolvedMarkerWarnings,
  finalizeGeneratedOutput,
  findRepoContextMatches,
  flushFindings,
  isQueryDescriptor,
  mapParsedQueriesToResults,
  maybeAnalyzeMocks,
  maybeCaptureVisualState,
  mergeAnalyzedStepState,
  mergeSelectorResolutionWarnings,
  reconcileExistingOutput,
  rebaseRenderHelperImportPath,
  resolveImportedFilePath,
  resolveJsGeneration,
  resolvePackageProfileFromContextMatches,
  scoreRenderTargetCandidate,
  stripSemanticMarkerStepsFromScenarios,
  summarizeCleanup,
  summarizeMockAnalysis,
  toItGroups,
  toProjectRelativePath,
};

// ─── XState Machine Types ───────────────────────────────────────────────────

export interface GenerateMachineContext {
  filePath: string;
  projectRoot: string;
  stdioContext?: {
    input?: { isTTY?: boolean };
    output?: { isTTY?: boolean };
  };
  commandOptions: {
    auth?: string;
    debugSelectors?: boolean;
    debugSelectorsJson?: string;
    interactiveAuth?: boolean;
    instructions?: string;
    screenshots?: boolean;
  };
  debugReporter: SelectorDebugReporter;
  findings: Finding[];
  normalizedRecording?: NormalizedRecording;
  defaultOutputPath?: string;
  hadState?: boolean;
  bootstrappedState?: Awaited<ReturnType<typeof loadOrBootstrapTaroState>>;
  overrides?: Awaited<ReturnType<typeof readTaroOverrides>>;
  packageProfile?: ResolvedTaroPackageProfile | null;
  explicitAuthPath?: { absolutePath: string; relativePath: string } | null;
  explicitInstructionsPath?: {
    absolutePath: string;
    relativePath: string;
  } | null;
  visualAuth?: TaroPlaywrightAuthProfile | null;
  earlyAnalyzedRecording?: AnalyzedRecording;
  recordingUrl?: string;
  visualState?: VisualState | null;
  contextMatches?: RepoContextMatch[];
  contextProfileReason?: string | null;
  staleness?: { stale: boolean; reason?: string } | null;
  analyzedRecording?: AnalyzedRecording;
  markerAwareRecording?: NormalizedRecording;
  recoveredVisualAuth?: TaroPlaywrightAuthProfile | null;
  mockAnalysis?: MockAnalysis | null;
  jsSuitePlan?: JsSuitePlan | null;
  outputPath?: string;
  resolvedRenderTargetFile?: string | null;
  boundarySupportPlan?: Awaited<ReturnType<typeof planBoundarySupport>>;
  generationRenderTarget?: RepoRenderTargetCandidate | null;
  componentScoreContext?: ComponentScoreContext | null;
  generationRenderHelper?: ResolvedTaroPackageProfile["effectiveRenderHelper"];
  resolvedJsGeneration?: Awaited<ReturnType<typeof resolveJsGeneration>>;
  generatedCode?: string;
  hydratedSuitePlan?: JsSuitePlan | null;
  scoreResult?: ScoreResult;
  boundaryPolicyWarnings?: string[];
  candidateAssessment?: OutputAssessment;
  existingCode?: string | null;
  existingAssessment?: OutputAssessment | null;
  outputResolution?: ExistingOutputResolution | null;
  shouldOverwrite?: boolean;
  error?: Error;
}

// Actor input types
export type ValidateFileActorInput = Pick<GenerateMachineContext, "filePath">;
export type ParseRecordingActorInput = Pick<GenerateMachineContext, "filePath">;
export type LoadStateActorInput = Pick<
  GenerateMachineContext,
  "filePath" | "projectRoot" | "commandOptions"
>;
export type CaptureVisualActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "visualAuth"
  | "projectRoot"
  | "stdioContext"
  | "commandOptions"
>;
export type SearchContextActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "visualState"
  | "projectRoot"
  | "defaultOutputPath"
  | "filePath"
>;
export type RefineProfileActorInput = Pick<
  GenerateMachineContext,
  | "bootstrappedState"
  | "packageProfile"
  | "projectRoot"
  | "overrides"
  | "contextMatches"
>;
export type RefreshProfileActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "contextMatches" | "overrides"
>;
export type AnalyzeRecordingActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "visualState"
  | "visualAuth"
  | "explicitAuthPath"
  | "explicitInstructionsPath"
>;
export type AnalyzeMocksActorInput = Pick<
  GenerateMachineContext,
  "projectRoot" | "packageProfile"
>;
export type PlanGenerationActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "analyzedRecording"
  | "mockAnalysis"
  | "normalizedRecording"
  | "packageProfile"
  | "projectRoot"
  | "defaultOutputPath"
  | "contextMatches"
  | "visualState"
>;
export type ResolveSelectorsActorInput = Pick<
  GenerateMachineContext,
  | "markerAwareRecording"
  | "jsSuitePlan"
  | "analyzedRecording"
  | "normalizedRecording"
  | "visualAuth"
  | "projectRoot"
  | "debugReporter"
>;
export type GenerateCodeActorInput = Pick<
  GenerateMachineContext,
  | "normalizedRecording"
  | "resolvedJsGeneration"
  | "jsSuitePlan"
  | "outputPath"
  | "packageProfile"
  | "boundarySupportPlan"
  | "generationRenderTarget"
  | "componentScoreContext"
  | "generationRenderHelper"
  | "analyzedRecording"
>;
export type AssessOutputActorInput = Pick<
  GenerateMachineContext,
  | "outputPath"
  | "generatedCode"
  | "analyzedRecording"
  | "candidateAssessment"
  | "componentScoreContext"
>;
export type WriteOutputActorInput = Pick<
  GenerateMachineContext,
  "generatedCode" | "outputPath" | "shouldOverwrite" | "boundarySupportPlan"
>;
export type FinalizeActorInput = Pick<
  GenerateMachineContext,
  | "generatedCode"
  | "outputPath"
  | "projectRoot"
  | "filePath"
  | "scoreResult"
  | "packageProfile"
>;
export type RunHealthCommandsActorInput = Pick<
  GenerateMachineContext,
  "overrides" | "projectRoot"
>;

// Guards
export const generateMachineGuards = {
  isProfileStale: ({
    context,
    event,
  }: {
    context: GenerateMachineContext;
    event: any;
  }) => Boolean(event.output?.staleness?.stale ?? context.staleness?.stale),

  shouldWrite: ({
    context,
    event,
  }: {
    context: GenerateMachineContext;
    event: any;
  }) => {
    return Boolean(
      event.output?.outputResolution?.shouldWrite ??
      context.outputResolution?.shouldWrite
    );
  },

  shouldKeepExisting: ({
    context,
    event,
  }: {
    context: GenerateMachineContext;
    event: any;
  }) => {
    return (
      !event.output?.outputResolution?.shouldWrite &&
      !context.outputResolution?.shouldWrite
    );
  },
};
