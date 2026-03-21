import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import {
  analyzeBoundaryIsolation,
  calculateBoundaryIsolationScore,
} from "#core/boundary-intelligence.ts";
import {
  getSupportedTestingLibraryQueryFamily,
  isTestIdQueryMethod,
} from "#core/query-policy.ts";
import { detectRepoContractIssues } from "#core/repo-contracts.ts";
import type { QueryResult } from "#types/recording.ts";
import type {
  HighSignalBranchHint,
  MarkerCoverageTotals,
  MarkerQualityGateState,
  MarkerReviewDiagnostics,
  ScoreDimensions,
  ScoreGeneratedTestOptions,
  ScoreImportReference,
  ScoreReason,
  ScoreResult,
  ScoreSignals,
} from "#types/score.ts";

const QUERY_WEIGHTS: Record<string, number> = {
  ByRole: 1.0,
  ByLabelText: 0.8,
  ByPlaceholderText: 0.7,
  ByText: 0.6,
  ByAltText: 0.6,
  ByTitle: 0.5,
  ByDisplayValue: 0.5,
  ByTestId: 0.2,
};

const STRONG_ASSERTION_MATCHERS = new Set([
  "toHaveValue",
  "toBeChecked",
  "toHaveTextContent",
  "toHaveAttribute",
]);
const PRESENCE_ASSERTION_MATCHERS = new Set(["toBeInTheDocument"]);
const VISIBILITY_ASSERTION_MATCHERS = new Set(["toBeVisible"]);
const QUERY_CHECKPOINT_REGEX = /taro-query-checkpoint:/g;
const ROLE_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByRole\s*\(/g;
const TEST_ID_QUERY_REGEX = /\b(?:get|query|find)(?:All)?ByTestId\s*\(/g;
const BOUNDARY_WARNING_REGEX = /taro-boundary-warning:/g;
const TEST_BLOCK_REGEX = /\b(?:it|test)\s*\(/g;
const FIRE_EVENT_REGEX = /\bfireEvent\b/g;

interface TestBlockMetrics {
  strongAssertionCount: number;
  presenceAssertionCount: number;
  visibilityAssertionCount: number;
}

interface DescribeBlockMetrics {
  title: string | null;
  bodyText: string;
}

interface TestCodeAnalysis {
  describeCount: number;
  itCount: number;
  roleQueryCountFromCode: number;
  testIdQueryCountFromCode: number;
  strongAssertionCount: number;
  presenceAssertionCount: number;
  visibilityAssertionCount: number;
  visibilityOnlyTestCount: number;
  presenceOnlyTestCount: number;
  fireEventCount: number;
  hasBasePropsConstant: boolean;
  hasOverrideRenderHelper: boolean;
  duplicatedInlineRenderCount: number;
  mockTargets: Set<string>;
  hasStandaloneUtilityDescribe: boolean;
}

interface NormalizedComponentScoreContext {
  componentDisplayName?: string;
  componentConditionalCount: number;
  componentEventHandlerCount: number;
  componentImportReferences: ScoreImportReference[];
  exportedUtilityNames: string[];
  dynamicImportTargets: string[];
  highSignalBranchHints: HighSignalBranchHint[];
}

interface BranchCoverageSignal {
  minimumExpectedTestCount: number;
  ratio: number;
  lowCoverage: boolean;
  partialCoverage: boolean;
}

interface MockCompletenessResult {
  missingMockCount: number;
  penalty: number;
  reasons: ScoreReason[];
}

const REPO_CONTRACT_REASON_CONFIG: Record<
  ReturnType<typeof detectRepoContractIssues>[number]["code"],
  {
    dimension: keyof ScoreDimensions;
    code: string;
    weight: number;
    severity?: "advisory" | "blocker";
  }
> = {
  "helper-assertion": {
    dimension: "testStructure",
    code: "helper-assertions",
    weight: 16,
    severity: "advisory",
  },
  "query-to-be-defined": {
    dimension: "assertionSpecificity",
    code: "query-to-be-defined",
    weight: 14,
    severity: "advisory",
  },
  "loose-payload": {
    dimension: "assertionSpecificity",
    code: "loose-payload-matchers",
    weight: 14,
    severity: "advisory",
  },
  "shared-mutable-mock-state": {
    dimension: "boundaryIsolation",
    code: "shared-mutable-mock-state",
    weight: 16,
    severity: "advisory",
  },
  "split-async-mock-assertions": {
    dimension: "assertionSpecificity",
    code: "split-async-mock-assertions",
    weight: 12,
    severity: "advisory",
  },
  "manual-dom-repair": {
    dimension: "boundaryIsolation",
    code: "manual-dom-repair",
    weight: 12,
    severity: "advisory",
  },
  "regex-text-matcher": {
    dimension: "queryQuality",
    code: "regex-text-matchers",
    weight: 8,
    severity: "advisory",
  },
  "mixed-reset-boundary": {
    dimension: "boundaryIsolation",
    code: "mixed-reset-boundary",
    weight: 10,
    severity: "advisory",
  },
  "generic-component-contract": {
    dimension: "testStructure",
    code: "generic-component-contract",
    weight: 18,
    severity: "advisory",
  },
  "incomplete-asset-mock": {
    dimension: "boundaryIsolation",
    code: "incomplete-asset-mock",
    weight: 12,
    severity: "advisory",
  },
  "dynamic-prop-shape-dispatcher": {
    dimension: "boundaryIsolation",
    code: "dynamic-prop-shape-dispatcher",
    weight: 18,
    severity: "blocker",
  },
  "duplicate-const-source": {
    dimension: "testStructure",
    code: "duplicate-const-source",
    weight: 16,
    severity: "blocker",
  },
  "overloaded-hoisted-state": {
    dimension: "boundaryIsolation",
    code: "overloaded-hoisted-state",
    weight: 12,
    severity: "advisory",
  },
};

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function countMatches(input: string, pattern: RegExp): number {
  return input.match(pattern)?.length ?? 0;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function walk(
  node: t.Node | null | undefined,
  visit: (node: t.Node) => void
): void {
  if (!node) {
    return;
  }

  visit(node);

  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === "object" && "type" in entry) {
          walk(entry as t.Node, visit);
        }
      }
      continue;
    }

    if (value && typeof value === "object" && "type" in value) {
      walk(value as t.Node, visit);
    }
  }
}

function parseCode(code: string): t.File | null {
  try {
    return babelParser.parse(code, {
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "topLevelAwait",
      ],
      sourceType: "unambiguous",
    });
  } catch {
    return null;
  }
}

function getCalleeName(node?: t.Node | null): string | undefined {
  if (!node) {
    return undefined;
  }

  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.property)
  ) {
    return node.property.name;
  }

  return undefined;
}

function getStringLiteralValue(
  node?: t.Node | t.PrivateName | null
): string | null {
  if (!node) {
    return null;
  }

  if (t.isStringLiteral(node)) {
    return node.value;
  }

  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }

  return null;
}

function extractMatcherName(node: t.CallExpression): string | null {
  let callee = node.callee;
  if (!t.isMemberExpression(callee)) {
    return null;
  }

  const matcherName =
    !callee.computed && t.isIdentifier(callee.property)
      ? callee.property.name
      : t.isStringLiteral(callee.property)
        ? callee.property.value
        : null;
  if (!matcherName) {
    return null;
  }

  let object: t.Expression | t.Super = callee.object;
  while (t.isMemberExpression(object)) {
    object = object.object;
  }

  return t.isCallExpression(object) &&
    t.isIdentifier(object.callee, { name: "expect" })
    ? matcherName
    : null;
}

function isTestBlockCall(node: t.CallExpression): boolean {
  return ["it", "test"].includes(getCalleeName(node.callee) ?? "");
}

function isDescribeCall(node: t.CallExpression): boolean {
  return getCalleeName(node.callee) === "describe";
}

function isFireEventCall(node: t.CallExpression): boolean {
  if (t.isIdentifier(node.callee, { name: "fireEvent" })) {
    return true;
  }

  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: "fireEvent" })
  );
}

function getMockTarget(node: t.CallExpression): string | null {
  const callee = node.callee;
  if (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    ["vi", "jest"].includes(callee.object.name) &&
    t.isIdentifier(callee.property, { name: "mock" })
  ) {
    return getStringLiteralValue(node.arguments[0] ?? null);
  }

  return null;
}

function getCallbackFunction(
  node: t.CallExpression
): t.FunctionExpression | t.ArrowFunctionExpression | null {
  const callback = node.arguments.find((argument) => {
    return (
      t.isFunctionExpression(argument) || t.isArrowFunctionExpression(argument)
    );
  });

  return callback &&
    (t.isFunctionExpression(callback) || t.isArrowFunctionExpression(callback))
    ? callback
    : null;
}

function getJsxName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName
): string | null {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return null;
}

function hasPartialTypeAnnotation(
  typeAnnotation?: t.Noop | t.TSTypeAnnotation | t.TypeAnnotation | null
): boolean {
  if (!typeAnnotation || !t.isTSTypeAnnotation(typeAnnotation)) {
    return false;
  }

  return (
    t.isTSTypeReference(typeAnnotation.typeAnnotation) &&
    t.isIdentifier(typeAnnotation.typeAnnotation.typeName, { name: "Partial" })
  );
}

function getOverrideParamName(
  param: t.Function["params"][number]
): string | null {
  if (t.isIdentifier(param) && hasPartialTypeAnnotation(param.typeAnnotation)) {
    return param.name;
  }

  if (
    t.isAssignmentPattern(param) &&
    t.isIdentifier(param.left) &&
    hasPartialTypeAnnotation(param.left.typeAnnotation)
  ) {
    return param.left.name;
  }

  return null;
}

function functionHasOverrideRenderHelper(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
): boolean {
  const overrideParamNames = new Set(
    node.params
      .map((param) => getOverrideParamName(param))
      .filter((name): name is string => Boolean(name))
  );
  if (overrideParamNames.size === 0) {
    return false;
  }

  let hasSpreadMerge = false;
  walk(t.isBlockStatement(node.body) ? node.body : node.body, (candidate) => {
    if (
      t.isJSXSpreadAttribute(candidate) &&
      t.isIdentifier(candidate.argument) &&
      overrideParamNames.has(candidate.argument.name)
    ) {
      hasSpreadMerge = true;
      return;
    }

    if (
      t.isSpreadElement(candidate) &&
      t.isIdentifier(candidate.argument) &&
      overrideParamNames.has(candidate.argument.name)
    ) {
      hasSpreadMerge = true;
    }
  });

  return hasSpreadMerge;
}

function getInlineRenderPropsSignature(
  node: t.CallExpression,
  code: string,
  componentDisplayName?: string
): string | null {
  if (getCalleeName(node.callee) !== "render") {
    return null;
  }

  const [firstArg] = node.arguments;
  if (!t.isJSXElement(firstArg)) {
    return null;
  }

  const elementName = getJsxName(firstArg.openingElement.name);
  if (!elementName) {
    return null;
  }

  if (componentDisplayName && elementName !== componentDisplayName) {
    return null;
  }

  if (!componentDisplayName && !/^[A-Z]/u.test(elementName)) {
    return null;
  }

  const fragments = firstArg.openingElement.attributes.flatMap((attribute) => {
    if (t.isJSXSpreadAttribute(attribute)) {
      return [];
    }

    if (attribute.start == null || attribute.end == null) {
      return [];
    }

    return [code.slice(attribute.start, attribute.end).trim()];
  });

  return fragments.length > 0 ? fragments.sort().join(" ") : null;
}

function collectTestBlockMetrics(
  callback: t.FunctionExpression | t.ArrowFunctionExpression
): TestBlockMetrics {
  const metrics: TestBlockMetrics = {
    strongAssertionCount: 0,
    presenceAssertionCount: 0,
    visibilityAssertionCount: 0,
  };

  walk(
    t.isBlockStatement(callback.body) ? callback.body : callback.body,
    (candidate) => {
      if (!t.isCallExpression(candidate)) {
        return;
      }

      const matcherName = extractMatcherName(candidate);
      if (!matcherName) {
        return;
      }

      if (STRONG_ASSERTION_MATCHERS.has(matcherName)) {
        metrics.strongAssertionCount += 1;
        return;
      }

      if (PRESENCE_ASSERTION_MATCHERS.has(matcherName)) {
        metrics.presenceAssertionCount += 1;
        return;
      }

      if (VISIBILITY_ASSERTION_MATCHERS.has(matcherName)) {
        metrics.visibilityAssertionCount += 1;
      }
    }
  );

  return metrics;
}

function collectFallbackMockTargets(code: string): Set<string> {
  const targets = new Set<string>();
  const regex = /(?:vi|jest)\.mock\s*\(\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(regex)) {
    if (match[1]) {
      targets.add(match[1]);
    }
  }
  return targets;
}

function collectDescribeBlocks(
  code: string,
  blocks: DescribeBlockMetrics[],
  exportedUtilityNames: string[],
  componentDisplayName?: string
): boolean {
  if (exportedUtilityNames.length === 0) {
    return false;
  }

  return blocks.some((block) => {
    const normalizedTitle = block.title?.trim().toLowerCase() ?? null;
    const isComponentDescribe =
      componentDisplayName != null &&
      normalizedTitle === componentDisplayName.trim().toLowerCase();
    if (isComponentDescribe) {
      return false;
    }

    return exportedUtilityNames.some((utilityName) => {
      const utilityPattern = new RegExp(`\\b${utilityName}\\b`, "u");
      return (
        (block.title != null && utilityPattern.test(block.title)) ||
        utilityPattern.test(block.bodyText)
      );
    });
  });
}

function analyzeTestCode(
  code: string,
  componentContext: NormalizedComponentScoreContext
): TestCodeAnalysis {
  const ast = parseCode(code);
  if (!ast) {
    const strongAssertionCount = countMatches(
      code,
      /\.toHaveValue\(|\.toBeChecked\(|\.toHaveTextContent\(|\.toHaveAttribute\(/g
    );
    const presenceAssertionCount = countMatches(code, /\.toBeInTheDocument\(/g);
    const visibilityAssertionCount = countMatches(code, /\.toBeVisible\(/g);
    return {
      describeCount: countMatches(code, /\bdescribe\s*\(/g),
      itCount: countMatches(code, TEST_BLOCK_REGEX),
      roleQueryCountFromCode: countMatches(code, ROLE_QUERY_REGEX),
      testIdQueryCountFromCode: countMatches(code, TEST_ID_QUERY_REGEX),
      strongAssertionCount,
      presenceAssertionCount,
      visibilityAssertionCount,
      visibilityOnlyTestCount: 0,
      presenceOnlyTestCount: 0,
      fireEventCount: countMatches(code, FIRE_EVENT_REGEX),
      hasBasePropsConstant: /\bconst\s+BASE_PROPS\b/u.test(code),
      hasOverrideRenderHelper:
        /Partial\s*</u.test(code) && /\.\.\.overrides/u.test(code),
      duplicatedInlineRenderCount: 0,
      mockTargets: collectFallbackMockTargets(code),
      hasStandaloneUtilityDescribe: false,
    };
  }

  const testBlocks: TestBlockMetrics[] = [];
  const describeBlocks: DescribeBlockMetrics[] = [];
  const mockTargets = new Set<string>();
  const inlineRenderSignatures = new Set<string>();
  let describeCount = 0;
  let itCount = 0;
  let fireEventCount = 0;
  let hasBasePropsConstant = false;
  let hasOverrideRenderHelper = false;

  walk(ast, (candidate) => {
    if (
      t.isVariableDeclarator(candidate) &&
      t.isIdentifier(candidate.id, { name: "BASE_PROPS" })
    ) {
      hasBasePropsConstant = true;
    }

    if (
      !hasOverrideRenderHelper &&
      ((t.isFunctionDeclaration(candidate) && candidate.id?.name) ||
        t.isFunctionExpression(candidate) ||
        t.isArrowFunctionExpression(candidate))
    ) {
      hasOverrideRenderHelper = functionHasOverrideRenderHelper(candidate);
    }

    if (!t.isCallExpression(candidate)) {
      return;
    }

    if (isDescribeCall(candidate)) {
      describeCount += 1;
      const callback = getCallbackFunction(candidate);
      describeBlocks.push({
        title: getStringLiteralValue(candidate.arguments[0] ?? null),
        bodyText:
          callback?.body.start != null && callback.body.end != null
            ? code.slice(callback.body.start, callback.body.end)
            : "",
      });
      return;
    }

    if (isTestBlockCall(candidate)) {
      itCount += 1;
      const callback = getCallbackFunction(candidate);
      if (callback) {
        testBlocks.push(collectTestBlockMetrics(callback));
      }
      return;
    }

    if (isFireEventCall(candidate)) {
      fireEventCount += 1;
    }

    const mockTarget = getMockTarget(candidate);
    if (mockTarget) {
      mockTargets.add(mockTarget);
    }

    const inlineRenderSignature = getInlineRenderPropsSignature(
      candidate,
      code,
      componentContext.componentDisplayName
    );
    if (inlineRenderSignature) {
      inlineRenderSignatures.add(inlineRenderSignature);
    }
  });

  const strongAssertionCount = testBlocks.reduce(
    (total, block) => total + block.strongAssertionCount,
    0
  );
  const presenceAssertionCount = testBlocks.reduce(
    (total, block) => total + block.presenceAssertionCount,
    0
  );
  const visibilityAssertionCount = testBlocks.reduce(
    (total, block) => total + block.visibilityAssertionCount,
    0
  );

  return {
    describeCount,
    itCount,
    roleQueryCountFromCode: countMatches(code, ROLE_QUERY_REGEX),
    testIdQueryCountFromCode: countMatches(code, TEST_ID_QUERY_REGEX),
    strongAssertionCount,
    presenceAssertionCount,
    visibilityAssertionCount,
    visibilityOnlyTestCount: testBlocks.filter((block) => {
      return (
        block.visibilityAssertionCount > 0 &&
        block.strongAssertionCount === 0 &&
        block.presenceAssertionCount === 0
      );
    }).length,
    presenceOnlyTestCount: testBlocks.filter((block) => {
      return (
        block.presenceAssertionCount > 0 &&
        block.strongAssertionCount === 0 &&
        block.visibilityAssertionCount === 0
      );
    }).length,
    fireEventCount,
    hasBasePropsConstant,
    hasOverrideRenderHelper,
    duplicatedInlineRenderCount: inlineRenderSignatures.size,
    mockTargets,
    hasStandaloneUtilityDescribe: collectDescribeBlocks(
      code,
      describeBlocks,
      componentContext.exportedUtilityNames,
      componentContext.componentDisplayName
    ),
  };
}

function normalizeComponentScoreContext(
  input?: Partial<ScoreGeneratedTestOptions> | null
): NormalizedComponentScoreContext {
  return {
    componentDisplayName:
      typeof input?.componentDisplayName === "string"
        ? input.componentDisplayName
        : undefined,
    componentConditionalCount: normalizeCount(input?.componentConditionalCount),
    componentEventHandlerCount: normalizeCount(
      input?.componentEventHandlerCount
    ),
    componentImportReferences: input?.componentImportReferences ?? [],
    exportedUtilityNames: [...new Set(input?.exportedUtilityNames ?? [])],
    dynamicImportTargets: [...new Set(input?.dynamicImportTargets ?? [])],
    highSignalBranchHints: input?.highSignalBranchHints ?? [],
  };
}

function calculateQueryScore(queryResults: QueryResult[]): number {
  if (queryResults.length === 0) {
    return 100;
  }

  const totalWeight = queryResults.reduce((sum, queryResult) => {
    const family = getSupportedTestingLibraryQueryFamily(queryResult.method);
    return sum + (family ? QUERY_WEIGHTS[family] : 0.2);
  }, 0);

  return clampScore((totalWeight / queryResults.length) * 100);
}

function calculateAssertionScore(
  analysis: TestCodeAnalysis,
  repoContractIssues: ReturnType<typeof detectRepoContractIssues>
): number {
  let score = 0;
  const recognizedAssertions =
    analysis.strongAssertionCount +
    analysis.presenceAssertionCount +
    analysis.visibilityAssertionCount;

  if (recognizedAssertions === 0) {
    score = 0;
  } else if (analysis.strongAssertionCount === 0) {
    score = 30;
  } else {
    score =
      80 + Math.min(Math.max(analysis.strongAssertionCount - 1, 0), 2) * 10;
  }

  const issues = new Set(repoContractIssues.map((issue) => issue.code));
  if (issues.has("query-to-be-defined")) {
    score -= 15;
  }
  if (issues.has("loose-payload")) {
    score -= 15;
  }
  if (issues.has("split-async-mock-assertions")) {
    score -= 10;
  }
  if (issues.has("regex-text-matcher")) {
    score -= 8;
  }

  return clampScore(score);
}

function buildBranchCoverageSignal(
  itCount: number,
  componentContext: NormalizedComponentScoreContext
): BranchCoverageSignal {
  const minimumExpectedTestCount =
    componentContext.componentConditionalCount * 2 +
    componentContext.componentEventHandlerCount +
    componentContext.exportedUtilityNames.length +
    componentContext.highSignalBranchHints.length;
  const ratio =
    minimumExpectedTestCount > 0 ? itCount / minimumExpectedTestCount : 1;

  return {
    minimumExpectedTestCount,
    ratio,
    lowCoverage: false,
    partialCoverage:
      minimumExpectedTestCount > 0 && itCount < minimumExpectedTestCount,
  };
}

function isHighSignalBranchHintCovered(
  code: string,
  hint: HighSignalBranchHint
): boolean {
  const normalizedCode = code.toLowerCase();
  const tokens = hint.coverageTokens.map((token) => token.toLowerCase());

  if (hint.family === "split-loading-flags") {
    return (
      tokens.filter((token) => normalizedCode.includes(token)).length >=
      Math.min(2, tokens.length)
    );
  }

  if (hint.family === "null-or-missing-mapped-values") {
    return /\bnull\b|\bundefined\b/u.test(code);
  }

  return tokens.some((token) => normalizedCode.includes(token));
}

function collectMissingHighSignalBranchFamilies(
  code: string,
  componentContext: NormalizedComponentScoreContext
): string[] {
  return componentContext.highSignalBranchHints
    .filter((hint) => !isHighSignalBranchHintCovered(code, hint))
    .map((hint) => hint.family);
}

function createReason(
  code: string,
  dimension: keyof ScoreDimensions,
  impact: "positive" | "negative",
  weight: number,
  message: string,
  severity?: "advisory" | "blocker"
): ScoreReason {
  return { code, dimension, impact, weight, message, severity };
}

function reasonPriority(reason: ScoreReason): number {
  if (reason.impact === "negative" && reason.severity === "blocker") {
    return 0;
  }

  if (reason.impact === "negative") {
    return 1;
  }

  return 2;
}

function compareReasons(left: ScoreReason, right: ScoreReason): number {
  const priorityDelta = reasonPriority(left) - reasonPriority(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  if (right.weight !== left.weight) {
    return right.weight - left.weight;
  }

  return left.code.localeCompare(right.code);
}

function analyzeMockCompleteness(params: {
  componentImportReferences: ScoreImportReference[];
  dynamicImportTargets: string[];
  mockTargets: Set<string>;
}): MockCompletenessResult {
  const reasons: ScoreReason[] = [];
  let penalty = 0;
  let missingMockCount = 0;

  const isRepoOwnedTarget = (target: string): boolean => {
    return /^(?:\.{1,2}\/|@\/|~\/)/u.test(target);
  };

  for (const reference of params.componentImportReferences) {
    if (reference.guardrailReason || params.mockTargets.has(reference.target)) {
      continue;
    }

    if (reference.target === "next/dynamic") {
      const hasDynamicModuleCoverage =
        params.dynamicImportTargets.length > 0 &&
        params.dynamicImportTargets.every((target) =>
          params.mockTargets.has(target)
        );
      if (hasDynamicModuleCoverage) {
        continue;
      }
      missingMockCount += 1;
      penalty += 15;
      reasons.push(
        createReason(
          "missing-dynamic-mock",
          "boundaryIsolation",
          "negative",
          15,
          params.dynamicImportTargets.length > 0
            ? `Dynamic import boundary "${reference.target}" is imported by the component but the generated test does not cover all dynamic modules (${params.dynamicImportTargets.join(", ")}).`
            : `Dynamic import boundary "${reference.target}" is imported by the component but not mocked in the generated test.`,
          "blocker"
        )
      );
      continue;
    }

    if (
      reference.target.startsWith("next/") ||
      ["router", "auth", "data-module"].includes(reference.kind)
    ) {
      missingMockCount += 1;
      penalty += 20;
      reasons.push(
        createReason(
          "missing-framework-mock",
          "boundaryIsolation",
          "negative",
          20,
          `Runtime boundary "${reference.target}" is imported by the component but not mocked in the generated test.`,
          "blocker"
        )
      );
      continue;
    }

    if (reference.kind === "asset") {
      missingMockCount += 1;
      penalty += 12;
      reasons.push(
        createReason(
          "missing-asset-mock",
          "boundaryIsolation",
          "negative",
          12,
          `Asset import "${reference.target}" is imported by the component but not mocked in the generated test.`,
          "blocker"
        )
      );
      continue;
    }

    if (reference.kind === "hook" && isRepoOwnedTarget(reference.target)) {
      missingMockCount += 1;
      penalty += 10;
      reasons.push(
        createReason(
          "missing-hook-mock",
          "boundaryIsolation",
          "negative",
          10,
          `Internal hook boundary "${reference.target}" is imported by the component but not mocked in the generated test.`,
          "advisory"
        )
      );
      continue;
    }

    if (reference.kind === "helper" && isRepoOwnedTarget(reference.target)) {
      missingMockCount += 1;
      penalty += 8;
      reasons.push(
        createReason(
          "missing-helper-mock",
          "boundaryIsolation",
          "negative",
          8,
          `Internal helper boundary "${reference.target}" is imported by the component but not mocked in the generated test.`,
          "advisory"
        )
      );
      continue;
    }
  }

  return { missingMockCount, penalty, reasons };
}

function calculateStructureScoreFromAnalysis(params: {
  analysis: TestCodeAnalysis;
  code: string;
  componentContext: NormalizedComponentScoreContext;
  repoContractIssues: ReturnType<typeof detectRepoContractIssues>;
}): number {
  const { analysis, code, componentContext, repoContractIssues } = params;
  let score = 50;

  if (analysis.describeCount > 0) {
    score += 20;
  }

  if (analysis.itCount > 1) {
    score += Math.min((analysis.itCount - 1) * 15, 30);
  }

  if (analysis.itCount === 1 && code.length > 2000) {
    score -= 20;
  }

  if (code.includes("render(<App />)")) {
    score -= 25;
  }

  if (code.includes("taro-boundary-warning:")) {
    score -= 20;
  }

  const issues = new Set(repoContractIssues.map((issue) => issue.code));
  if (issues.has("helper-assertion")) {
    score -= 12;
  }
  if (issues.has("manual-dom-repair")) {
    score -= 8;
  }
  if (issues.has("shared-mutable-mock-state")) {
    score -= 10;
  }
  if (issues.has("mixed-reset-boundary")) {
    score -= 6;
  }
  if (issues.has("generic-component-contract")) {
    score -= 18;
  }

  if (analysis.fireEventCount > 0) {
    score -= componentContext.componentEventHandlerCount > 0 ? 14 : 8;
  }

  if (
    analysis.itCount >= 3 &&
    !analysis.hasBasePropsConstant &&
    !analysis.hasOverrideRenderHelper &&
    analysis.duplicatedInlineRenderCount > 1
  ) {
    score -= 10;
  }

  if (
    componentContext.exportedUtilityNames.length > 0 &&
    !analysis.hasStandaloneUtilityDescribe
  ) {
    score -= 10;
  }

  return clampScore(score);
}

export function calculateStructureScore(
  code: string,
  input?: Partial<ScoreGeneratedTestOptions>
): number {
  const componentContext = normalizeComponentScoreContext(input);
  const analysis = analyzeTestCode(code, componentContext);
  const repoContractIssues = detectRepoContractIssues(code);

  return calculateStructureScoreFromAnalysis({
    analysis,
    code,
    componentContext,
    repoContractIssues,
  });
}

function collectSignals(params: {
  code: string;
  queryResults: QueryResult[];
  boundaryIssueCount: number;
  analysis: TestCodeAnalysis;
  branchCoverage: BranchCoverageSignal;
  missingMockCount: number;
}): ScoreSignals {
  const {
    code,
    queryResults,
    boundaryIssueCount,
    analysis,
    branchCoverage,
    missingMockCount,
  } = params;
  return {
    queryCheckpointCount: countMatches(code, QUERY_CHECKPOINT_REGEX),
    roleQueryCount:
      queryResults.filter(
        (queryResult) =>
          getSupportedTestingLibraryQueryFamily(queryResult.method) === "ByRole"
      ).length + analysis.roleQueryCountFromCode,
    testIdQueryCount:
      queryResults.filter((queryResult) =>
        isTestIdQueryMethod(queryResult.method)
      ).length + analysis.testIdQueryCountFromCode,
    strongAssertionCount: analysis.strongAssertionCount,
    presenceAssertionCount: analysis.presenceAssertionCount,
    visibilityAssertionCount: analysis.visibilityAssertionCount,
    visibilityOnlyTestCount: analysis.visibilityOnlyTestCount,
    presenceOnlyTestCount: analysis.presenceOnlyTestCount,
    boundaryWarningCount: countMatches(code, BOUNDARY_WARNING_REGEX),
    boundaryIssueCount,
    placeholderRenderTarget: code.includes("render(<App />)"),
    multipleTestBlocks: analysis.itCount > 1,
    minimumExpectedTestCount: branchCoverage.minimumExpectedTestCount,
    branchCoverageRatio: branchCoverage.ratio,
    missingMockCount,
    fireEventCount: analysis.fireEventCount,
    hasBasePropsConstant: analysis.hasBasePropsConstant,
    hasOverrideRenderHelper: analysis.hasOverrideRenderHelper,
    duplicatedInlineRenderCount: analysis.duplicatedInlineRenderCount,
    hasStandaloneUtilityDescribe: analysis.hasStandaloneUtilityDescribe,
  };
}

function collectReasons(params: {
  code: string;
  dimensions: ScoreDimensions;
  signals: ScoreSignals;
  analysis: TestCodeAnalysis;
  boundaryMessages: string[];
  markerQualityGate: MarkerQualityGateState;
  markerDiagnostics: MarkerReviewDiagnostics;
  repoContractIssues: ReturnType<typeof detectRepoContractIssues>;
  branchCoverage: BranchCoverageSignal;
  componentContext: NormalizedComponentScoreContext;
  mockCompleteness: MockCompletenessResult;
}): ScoreReason[] {
  const {
    code,
    dimensions,
    signals,
    analysis,
    boundaryMessages,
    markerQualityGate,
    markerDiagnostics,
    repoContractIssues,
    branchCoverage,
    componentContext,
    mockCompleteness,
  } = params;

  const reasons: ScoreReason[] = [];

  if (signals.queryCheckpointCount > 0) {
    reasons.push(
      createReason(
        "query-checkpoints",
        "queryQuality",
        "negative",
        Math.min(40, signals.queryCheckpointCount * 3),
        `${signals.queryCheckpointCount} unresolved query checkpoint(s) remain, so query quality is still draft-grade.`,
        "blocker"
      )
    );
  }

  if (signals.testIdQueryCount > 0) {
    reasons.push(
      createReason(
        "testid-queries",
        "queryQuality",
        "negative",
        Math.min(15, signals.testIdQueryCount * 4),
        `${signals.testIdQueryCount} test-id query(ies) remain in the generated output.`,
        "advisory"
      )
    );
  }

  if (signals.roleQueryCount > 0 && dimensions.queryQuality >= 80) {
    reasons.push(
      createReason(
        "role-queries",
        "queryQuality",
        "positive",
        8,
        `Recovered role-based queries cover ${signals.roleQueryCount} interaction(s).`
      )
    );
  }

  if (signals.visibilityOnlyTestCount > 0) {
    reasons.push(
      createReason(
        "visibility-assertions-only",
        "assertionSpecificity",
        "negative",
        10,
        `${signals.visibilityOnlyTestCount} test block(s) rely only on toBeVisible(), which behaves like a presence check for always-rendered elements.`,
        "advisory"
      )
    );
  }

  if (
    signals.strongAssertionCount === 0 &&
    (signals.presenceAssertionCount > 0 || signals.visibilityAssertionCount > 0)
  ) {
    reasons.push(
      createReason(
        "weak-assertions-only",
        "assertionSpecificity",
        "negative",
        12,
        "Assertions rely on generic presence or visibility checks instead of stronger user-visible expectations.",
        "advisory"
      )
    );
  }

  if (
    signals.strongAssertionCount === 0 &&
    signals.presenceAssertionCount === 0 &&
    signals.visibilityAssertionCount === 0
  ) {
    reasons.push(
      createReason(
        "no-assertions",
        "assertionSpecificity",
        "negative",
        20,
        "The generated test has no load-bearing assertions yet.",
        "blocker"
      )
    );
  }

  if (signals.strongAssertionCount > 0) {
    reasons.push(
      createReason(
        "strong-assertions",
        "assertionSpecificity",
        "positive",
        8,
        `Strong matcher usage covers ${signals.strongAssertionCount} assertion(s).`
      )
    );
  }

  if (signals.placeholderRenderTarget) {
    reasons.push(
      createReason(
        "placeholder-render-target",
        "testStructure",
        "negative",
        25,
        "The generated test still renders <App /> instead of a resolved repo target.",
        "blocker"
      )
    );
  }

  if (signals.boundaryWarningCount > 0) {
    reasons.push(
      createReason(
        "boundary-warnings",
        "testStructure",
        "negative",
        20,
        "Boundary warnings remain in the generated file, so the render/mock boundary still needs cleanup.",
        "blocker"
      )
    );
  }

  if (signals.multipleTestBlocks && dimensions.testStructure >= 70) {
    reasons.push(
      createReason(
        "multiple-tests",
        "testStructure",
        "positive",
        6,
        "The suite is organized into multiple test blocks where the flow allows it."
      )
    );
  }

  if (branchCoverage.partialCoverage) {
    reasons.push(
      createReason(
        "branch-coverage-signal",
        "testStructure",
        "negative",
        8,
        `The suite has ${analysis.itCount} test block(s), while the component surface suggests up to ${signals.minimumExpectedTestCount} branch, handler, or utility-focused cases. Treat this as advisory context, not a required test count.`,
        "advisory"
      )
    );
  }

  const missingHighSignalBranchFamilies =
    collectMissingHighSignalBranchFamilies(code, componentContext);
  if (missingHighSignalBranchFamilies.length > 0) {
    reasons.push(
      createReason(
        "source-branch-family-gap",
        "testStructure",
        "negative",
        16,
        `High-signal source branches appear uncovered: ${missingHighSignalBranchFamilies.join(", ")}.`,
        "blocker"
      )
    );
  }

  if (
    analysis.itCount >= 3 &&
    signals.duplicatedInlineRenderCount > 1 &&
    !signals.hasBasePropsConstant &&
    !signals.hasOverrideRenderHelper
  ) {
    reasons.push(
      createReason(
        "hardcoded-fixture",
        "testStructure",
        "negative",
        10,
        "The suite duplicates inline render prop sets instead of reusing BASE_PROPS plus overrides.",
        "advisory"
      )
    );
  }

  if (signals.fireEventCount > 0) {
    reasons.push(
      createReason(
        "fire-event-usage",
        "testStructure",
        "negative",
        componentContext.componentEventHandlerCount > 0 ? 14 : 8,
        "The suite uses fireEvent where userEvent-level interactions are expected.",
        "advisory"
      )
    );
  }

  if (
    componentContext.exportedUtilityNames.length > 0 &&
    !signals.hasStandaloneUtilityDescribe
  ) {
    reasons.push(
      createReason(
        "untested-exports",
        "testStructure",
        "negative",
        10,
        `Exported utilities (${componentContext.exportedUtilityNames.join(", ")}) are not covered by a standalone describe block.`,
        "advisory"
      )
    );
  }

  if (signals.boundaryIssueCount > 0) {
    for (const [index, message] of boundaryMessages.slice(0, 2).entries()) {
      reasons.push(
        createReason(
          `boundary-issue-${index + 1}`,
          "boundaryIsolation",
          "negative",
          10 - index,
          message,
          "advisory"
        )
      );
    }
  }

  reasons.push(...mockCompleteness.reasons);

  for (const issue of repoContractIssues) {
    const config = REPO_CONTRACT_REASON_CONFIG[issue.code];
    reasons.push(
      createReason(
        config.code,
        config.dimension,
        "negative",
        config.weight,
        issue.message,
        config.severity
      )
    );
  }

  if (markerQualityGate.failing) {
    reasons.push(
      createReason(
        "marker-quality-gate-fail",
        "assertionSpecificity",
        "negative",
        45,
        `QUAL-02 warning: ${markerQualityGate.message}`,
        "blocker"
      )
    );
  } else if (markerQualityGate.reason === "markers-fully-converted") {
    reasons.push(
      createReason(
        "marker-quality-gate-pass",
        "assertionSpecificity",
        "positive",
        8,
        `QUAL-02 passed: ${markerQualityGate.message}`
      )
    );
  } else {
    reasons.push(
      createReason(
        "marker-quality-gate-pass-no-markers",
        "assertionSpecificity",
        "positive",
        4,
        `QUAL-02 passed: ${markerQualityGate.message}`
      )
    );
  }

  if (markerDiagnostics.placementCorrections > 0) {
    reasons.push(
      createReason(
        "marker-placement-corrections",
        "boundaryIsolation",
        "negative",
        14,
        `${markerDiagnostics.placementCorrections} marker assertion placement correction(s) were needed to align checkpoints with the anchored scenario.`,
        "advisory"
      )
    );
  }

  if (markerDiagnostics.placementConflicts > 0) {
    reasons.push(
      createReason(
        "marker-placement-conflicts",
        "boundaryIsolation",
        "negative",
        18,
        `${markerDiagnostics.placementConflicts} semantic marker(s) could not be assigned to a single safe scenario.`,
        "blocker"
      )
    );
  }

  return reasons.sort(compareReasons);
}

function deriveBlockers(reasons: ScoreReason[], limit = 2): string[] {
  const blockerReasons = reasons
    .filter(
      (reason) => reason.impact === "negative" && reason.severity === "blocker"
    )
    .sort(compareReasons);

  if (blockerReasons.length > 0) {
    return blockerReasons.slice(0, limit).map((reason) => reason.message);
  }

  return reasons
    .filter((reason) => reason.impact === "negative")
    .sort(compareReasons)
    .slice(0, limit)
    .map((reason) => reason.message);
}

function calculateAggregateScore(
  dimensions: ScoreDimensions
): Pick<ScoreResult, "total" | "grade"> {
  const total = clampScore(
    dimensions.queryQuality * 0.3 +
      dimensions.assertionSpecificity * 0.25 +
      dimensions.testStructure * 0.2 +
      dimensions.boundaryIsolation * 0.25
  );

  if (total >= 90) {
    return { total, grade: "A" };
  }

  if (total >= 80) {
    return { total, grade: "B" };
  }

  if (total >= 70) {
    return { total, grade: "C" };
  }

  if (total >= 60) {
    return { total, grade: "D" };
  }

  return { total, grade: "F" };
}

function resolveMarkerCoverage(
  markerCoverage?: Partial<MarkerCoverageTotals>
): MarkerCoverageTotals {
  return {
    detected: normalizeCount(markerCoverage?.detected),
    emitted: normalizeCount(markerCoverage?.emitted),
    unresolved: normalizeCount(markerCoverage?.unresolved),
  };
}

function resolveMarkerDiagnostics(
  markerDiagnostics?: Partial<MarkerReviewDiagnostics>
): MarkerReviewDiagnostics {
  return {
    canonicalRecoveries: normalizeCount(markerDiagnostics?.canonicalRecoveries),
    placementConflicts: normalizeCount(markerDiagnostics?.placementConflicts),
    placementCorrections: normalizeCount(
      markerDiagnostics?.placementCorrections
    ),
  };
}

function deriveMarkerQualityGate(
  markerCoverage: MarkerCoverageTotals
): MarkerQualityGateState {
  if (markerCoverage.detected === 0) {
    return {
      status: "pass",
      reason: "no-markers-detected",
      failing: false,
      message: "No semantic markers were detected in this run.",
    };
  }

  if (markerCoverage.emitted === 0) {
    return {
      status: "warn",
      reason: "zero-marker-conversion",
      failing: true,
      message:
        "Semantic markers were detected, but no marker-derived assertions were emitted.",
    };
  }

  if (markerCoverage.unresolved > 0) {
    return {
      status: "warn",
      reason: "markers-partially-converted",
      failing: true,
      message:
        "Marker-derived assertions were emitted, but unresolved semantic markers remain.",
    };
  }

  return {
    status: "pass",
    reason: "markers-fully-converted",
    failing: false,
    message:
      "All detected semantic markers were converted into marker-derived assertions.",
  };
}

function resolveScoreGeneratedTestOptions(
  input: QueryResult[] | ScoreGeneratedTestOptions | undefined
): {
  queryResults: QueryResult[];
  markerCoverage: MarkerCoverageTotals;
  markerDiagnostics: MarkerReviewDiagnostics;
  componentContext: NormalizedComponentScoreContext;
} {
  if (Array.isArray(input)) {
    return {
      queryResults: input,
      markerCoverage: resolveMarkerCoverage(),
      markerDiagnostics: resolveMarkerDiagnostics(),
      componentContext: normalizeComponentScoreContext(),
    };
  }

  if (input && typeof input === "object") {
    return {
      queryResults: input.queryResults ?? [],
      markerCoverage: resolveMarkerCoverage(input.markerCoverage),
      markerDiagnostics: resolveMarkerDiagnostics(input.markerDiagnostics),
      componentContext: normalizeComponentScoreContext(input),
    };
  }

  return {
    queryResults: [],
    markerCoverage: resolveMarkerCoverage(),
    markerDiagnostics: resolveMarkerDiagnostics(),
    componentContext: normalizeComponentScoreContext(),
  };
}

export function scoreGeneratedTest(
  code: string,
  input: QueryResult[] | ScoreGeneratedTestOptions = []
): ScoreResult {
  const { queryResults, markerCoverage, markerDiagnostics, componentContext } =
    resolveScoreGeneratedTestOptions(input);
  const markerQualityGate = deriveMarkerQualityGate(markerCoverage);
  const boundaryIssues = analyzeBoundaryIsolation(code);
  const repoContractIssues = detectRepoContractIssues(code);
  const analysis = analyzeTestCode(code, componentContext);
  const branchCoverage = buildBranchCoverageSignal(
    analysis.itCount,
    componentContext
  );
  const mockCompleteness = analyzeMockCompleteness({
    componentImportReferences: componentContext.componentImportReferences,
    dynamicImportTargets: componentContext.dynamicImportTargets,
    mockTargets: analysis.mockTargets,
  });
  const signals = collectSignals({
    code,
    queryResults,
    boundaryIssueCount: boundaryIssues.length,
    analysis,
    branchCoverage,
    missingMockCount: mockCompleteness.missingMockCount,
  });
  const queryCheckpointPenalty = Math.min(40, signals.queryCheckpointCount * 3);
  const incompleteAssetPenalty = repoContractIssues.some(
    (issue) => issue.code === "incomplete-asset-mock"
  )
    ? 12
    : 0;

  const dimensions: ScoreDimensions = {
    queryQuality: clampScore(
      calculateQueryScore(queryResults) - queryCheckpointPenalty
    ),
    assertionSpecificity: calculateAssertionScore(analysis, repoContractIssues),
    testStructure: calculateStructureScoreFromAnalysis({
      analysis,
      code,
      componentContext,
      repoContractIssues,
    }),
    boundaryIsolation: clampScore(
      calculateBoundaryIsolationScore(code) -
        mockCompleteness.penalty -
        incompleteAssetPenalty
    ),
  };

  const reasons = collectReasons({
    code,
    dimensions,
    signals,
    analysis,
    boundaryMessages: boundaryIssues.map((issue) => issue.message),
    markerQualityGate,
    markerDiagnostics,
    repoContractIssues,
    branchCoverage,
    componentContext,
    mockCompleteness,
  });
  const blockers = deriveBlockers(reasons);
  const aggregate = calculateAggregateScore(dimensions);
  const hasBlockerReason = reasons.some(
    (reason) => reason.impact === "negative" && reason.severity === "blocker"
  );

  return {
    ...aggregate,
    dimensions,
    signals,
    reasons,
    blockers,
    requiresReview:
      aggregate.total < 80 ||
      repoContractIssues.length > 0 ||
      markerQualityGate.failing ||
      markerDiagnostics.placementCorrections > 0 ||
      markerDiagnostics.placementConflicts > 0 ||
      hasBlockerReason,
    markerCoverage,
    markerDiagnostics,
    markerQualityGate,
  };
}
