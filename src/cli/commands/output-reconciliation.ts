import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import pc from "picocolors";

import {
  deriveOutputPath,
  rebaseRenderHelperImportPath,
  resolveRenderTargetFile,
} from "#cli/commands/generate-paths.ts";
import type {
  ExistingOutputResolution,
  FlowCoverageSummary,
  OutputAssessment,
} from "#cli/commands/generate-runtime-types.ts";
import { type JsParseResult, parseJsRecording } from "#core/js-parser.ts";
import { scoreGeneratedTest } from "#core/scorer.ts";
import type {
  AnalyzedRecording,
  NormalizedStep,
  QueryResult,
} from "#types/recording.ts";
import type { ComponentScoreContext } from "#types/score.ts";

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

function looksLikeSelectorLikeString(value: string): boolean {
  return (
    /^[#.[]/.test(value) ||
    /^[a-z][a-z0-9-]*(?:[.#[:>])/i.test(value) ||
    /^(button|input|select|textarea|a|img|h[1-6])$/i.test(value)
  );
}

function normalizeComparableText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized ? normalized : null;
}

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

function isGenericCoverageToken(token: string): boolean {
  return (
    GENERIC_CONTEXT_TERMS.has(token) ||
    [
      "button",
      "click",
      "dialog",
      "field",
      "input",
      "link",
      "menu",
      "modal",
      "option",
      "page",
      "screen",
      "select",
      "submit",
      "tab",
    ].includes(token)
  );
}

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

function codeIncludesCoverageToken(
  normalizedCode: string,
  token: string
): boolean {
  return normalizedCode.includes(token);
}

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
      "[taro] Keeping the existing test because it remains the preferred suite and there were no additional distinct tests to preserve."
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

export {
  deriveOutputPath,
  rebaseRenderHelperImportPath,
  resolveRenderTargetFile,
};
