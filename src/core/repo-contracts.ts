import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import { walkBabelAst as walk } from "#core/babel-utils.ts";
import { analyzeBoundaryIsolation } from "#core/boundary-intelligence.ts";

type RepoContractIssueCode =
  | "helper-assertion"
  | "query-to-be-defined"
  | "loose-payload"
  | "shared-mutable-mock-state"
  | "split-async-mock-assertions"
  | "manual-dom-repair"
  | "regex-text-matcher"
  | "mixed-reset-boundary"
  | "generic-component-contract"
  | "incomplete-asset-mock"
  | "component-mock-reimplementation"
  | "dynamic-prop-shape-dispatcher"
  | "duplicate-const-source"
  | "overloaded-hoisted-state";

interface RepoContractIssue {
  code: RepoContractIssueCode;
  message: string;
}

const ISSUE_MESSAGES: Record<RepoContractIssueCode, string> = {
  "helper-assertion":
    "Keep assertions out of setup helpers - shared interaction utilities should prepare state, not assert outcomes.",
  "query-to-be-defined":
    "Avoid .toBeDefined() on RTL query results - rely on the query throw or use .toBeInTheDocument().",
  "loose-payload":
    "Avoid loose payload matchers for known user-driven values - assert exact mutation payload fields when the test set them explicitly.",
  "shared-mutable-mock-state":
    "Avoid mutable shared objects to control mock behavior - hoist plain vi.fn() mocks, keep vi.mock factories shape-only, set the default mockImplementation in beforeEach, and override per-test with a complete mockImplementation.",
  "split-async-mock-assertions":
    "Keep async mock call count and payload assertions inside the same waitFor callback to avoid race conditions.",
  "manual-dom-repair":
    "Avoid teardown that combines cleanup() with manual document.body mutations - fix the component leak at the source instead.",
  "regex-text-matcher":
    "Avoid regex text matchers for exact rendered contracts unless the pattern itself is the behavior under test.",
  "mixed-reset-boundary":
    "Avoid mixed reset boundaries - use either a shared reset helper or explicit suite-local mock resets, not both.",
  "generic-component-contract":
    'Avoid umbrella component-only buckets like "renders the primary UI contract" or "exposes the main interactive controls" - emit one behavior per it(...) block.',
  "incomplete-asset-mock":
    "Asset mocks should expose a stable queryable identity and forward props; anonymous <svg /> mocks hide which branch rendered.",
  "component-mock-reimplementation":
    "Avoid reimplementing mocked child components with prop-driven rendering logic. Use a minimal placeholder and assert the props passed to the child instead.",
  "dynamic-prop-shape-dispatcher":
    "Avoid dispatching next/dynamic mocks by prop shape - use module-identity placeholders or per-module mocks instead of guessing the child from props.",
  "duplicate-const-source":
    "Avoid duplicate constant declarations in a generated test - keep one source of truth for shared IDs, roles, and labels.",
  "overloaded-hoisted-state":
    "Avoid a single vi.hoisted state bag doing constants, spies, mutable query state, and reset helpers at once - split those concerns into separate sections.",
};

const DETECTORS: Array<[RepoContractIssueCode, RegExp]> = [
  [
    "query-to-be-defined",
    /\bexpect\s*\(\s*(?:await\s+)?(?:screen|within\([^)]*\)|[a-zA-Z_$][\w$]*\.(?:getBy|findBy|queryBy))/m,
  ],
  [
    "loose-payload",
    /toHaveBeenCalledWith\s*\([\s\S]*expect\.(?:any|anything)\s*\(/,
  ],
  [
    "shared-mutable-mock-state",
    /const\s+\w+\s*=\s*\{[\s\S]*?\bbeforeEach\s*\([\s\S]*?\b\w+\.\w+\s*=/,
  ],
  [
    "split-async-mock-assertions",
    /waitFor\s*\([\s\S]*toHaveBeenCalledTimes\([\s\S]*\)\s*\)[\s\S]*toHaveBeenCalledWith\(/,
  ],
  [
    "manual-dom-repair",
    /afterEach\s*\([\s\S]*cleanup\s*\([\s\S]*document\.body\./,
  ],
  [
    "regex-text-matcher",
    /(?:getByText|findByText|queryByText)\s*\(\s*\/.*\/[gimsuy]*\s*[),]/,
  ],
  [
    "mixed-reset-boundary",
    /\breset[A-Z]\w*\s*\(\s*\)[\s\S]*\.\s*mock(?:Clear|Reset)\s*\(/,
  ],
  [
    "generic-component-contract",
    /\bit\s*\(\s*['"](?:renders the primary UI contract|exposes the main interactive controls)['"]/,
  ],
  [
    "incomplete-asset-mock",
    /(?:vi|jest)\.mock\s*\(\s*['"][^'"]+\.svg['"][\s\S]*?<svg\b(?![^>]*data-testid=)[^>]*\/>/,
  ],
  [
    "dynamic-prop-shape-dispatcher",
    /(?:vi|jest)\.mock\s*\(\s*['"]next\/dynamic['"][\s\S]{0,800}?(?:=>\s*\(\s*props\s*\)|function\s*\(\s*props\s*\)|\(\s*props\s*\)\s*=>)[\s\S]{0,400}?(?:\bin\s+props\b|props\.\w+)/,
  ],
];

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

function parseCode(code: string): t.File | null {
  try {
    return babelParser.parse(code, {
      sourceType: "module",
      plugins: AST_PLUGINS,
    });
  } catch {
    return null;
  }
}

function getMockTarget(node: t.CallExpression): string | null {
  if (
    !t.isMemberExpression(node.callee) ||
    node.callee.computed ||
    !t.isIdentifier(node.callee.property, { name: "mock" }) ||
    !t.isIdentifier(node.callee.object) ||
    !["vi", "jest"].includes(node.callee.object.name)
  ) {
    return null;
  }

  const [firstArg] = node.arguments;
  return t.isStringLiteral(firstArg) ? firstArg.value : null;
}

function getMockFactory(
  node: t.CallExpression
):
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression
  | null {
  return (node.arguments.find((argument) => {
    return (
      t.isFunctionDeclaration(argument) ||
      t.isFunctionExpression(argument) ||
      t.isArrowFunctionExpression(argument)
    );
  }) ?? null) as
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression
    | null;
}

function getReturnedExpression(
  factory:
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression
): t.Expression | null {
  if (!t.isBlockStatement(factory.body)) {
    return t.isExpression(factory.body) ? factory.body : null;
  }

  for (const statement of factory.body.body) {
    if (t.isReturnStatement(statement) && statement.argument) {
      return t.isExpression(statement.argument) ? statement.argument : null;
    }
  }

  return null;
}

function collectBindingNames(
  pattern: t.LVal | t.VoidPattern | t.Identifier | null | undefined,
  names: Set<string>
) {
  if (!pattern) {
    return;
  }

  if (t.isIdentifier(pattern)) {
    names.add(pattern.name);
    return;
  }

  if (t.isVoidPattern(pattern)) {
    return;
  }

  if (t.isAssignmentPattern(pattern)) {
    collectBindingNames(pattern.left, names);
    return;
  }

  if (t.isObjectPattern(pattern)) {
    for (const property of pattern.properties) {
      if (t.isRestElement(property)) {
        collectBindingNames(property.argument, names);
        continue;
      }

      if (t.isObjectProperty(property)) {
        collectBindingNames(property.value as t.LVal | t.VoidPattern, names);
      }
    }
    return;
  }

  if (t.isArrayPattern(pattern)) {
    for (const element of pattern.elements) {
      if (!element) {
        continue;
      }

      if (t.isRestElement(element)) {
        collectBindingNames(element.argument, names);
        continue;
      }

      collectBindingNames(element as t.LVal | t.VoidPattern, names);
    }
  }
}

function expressionReferencesBindings(
  expression: t.Node | null | undefined,
  bindingNames: Set<string>
): boolean {
  if (!expression || bindingNames.size === 0) {
    return false;
  }

  let found = false;
  walk(expression, (candidate) => {
    if (
      found ||
      !t.isIdentifier(candidate) ||
      !bindingNames.has(candidate.name)
    ) {
      return;
    }

    found = true;
  });

  return found;
}

function countBindingReferences(
  expression: t.Node | null | undefined,
  bindingNames: Set<string>
): number {
  if (!expression || bindingNames.size === 0) {
    return 0;
  }

  let count = 0;
  walk(expression, (candidate) => {
    if (t.isIdentifier(candidate) && bindingNames.has(candidate.name)) {
      count += 1;
    }
  });

  return count;
}

function unwrapMockedComponentImplementation(
  value: t.Expression | null | undefined
): t.FunctionExpression | t.ArrowFunctionExpression | null {
  if (!value) {
    return null;
  }

  if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
    return value;
  }

  if (
    t.isCallExpression(value) &&
    t.isMemberExpression(value.callee) &&
    !value.callee.computed &&
    t.isIdentifier(value.callee.property, { name: "fn" }) &&
    t.isIdentifier(value.callee.object) &&
    ["vi", "jest"].includes(value.callee.object.name)
  ) {
    const [firstArg] = value.arguments;
    if (
      t.isFunctionExpression(firstArg) ||
      t.isArrowFunctionExpression(firstArg)
    ) {
      return firstArg;
    }
  }

  return null;
}

function getMockedComponentImplementations(
  expression: t.Expression | null
): Array<t.FunctionExpression | t.ArrowFunctionExpression> {
  if (!expression) {
    return [];
  }

  const directImplementation = unwrapMockedComponentImplementation(expression);
  if (directImplementation) {
    return [directImplementation];
  }

  if (!t.isObjectExpression(expression)) {
    return [];
  }

  const implementations: Array<
    t.FunctionExpression | t.ArrowFunctionExpression
  > = [];

  for (const property of expression.properties) {
    if (!t.isObjectProperty(property) || !t.isExpression(property.value)) {
      continue;
    }

    const implementation = unwrapMockedComponentImplementation(property.value);
    if (implementation) {
      implementations.push(implementation);
    }
  }

  return implementations;
}

const PROP_DRIVEN_TRANSFORM_METHODS = new Set([
  "every",
  "filter",
  "find",
  "flatMap",
  "join",
  "map",
  "reduce",
  "some",
  "sort",
]);

function isPropDrivenComponentReimplementation(
  implementation: t.FunctionExpression | t.ArrowFunctionExpression
): boolean {
  const bindingNames = new Set<string>();
  for (const param of implementation.params) {
    collectBindingNames(param as t.LVal | t.VoidPattern, bindingNames);
  }

  if (bindingNames.size === 0) {
    return false;
  }

  let hasTransformingCall = false;
  let hasPropDrivenCondition = false;
  let hasCompositePropText = false;

  walk(
    t.isBlockStatement(implementation.body)
      ? implementation.body
      : implementation.body,
    (candidate) => {
      if (
        !hasTransformingCall &&
        t.isCallExpression(candidate) &&
        t.isMemberExpression(candidate.callee) &&
        !candidate.callee.computed &&
        t.isIdentifier(candidate.callee.property) &&
        PROP_DRIVEN_TRANSFORM_METHODS.has(candidate.callee.property.name) &&
        expressionReferencesBindings(candidate.callee.object, bindingNames)
      ) {
        hasTransformingCall = true;
      }

      if (
        !hasPropDrivenCondition &&
        ((t.isIfStatement(candidate) &&
          expressionReferencesBindings(candidate.test, bindingNames)) ||
          (t.isConditionalExpression(candidate) &&
            expressionReferencesBindings(candidate.test, bindingNames)) ||
          (t.isLogicalExpression(candidate) &&
            expressionReferencesBindings(candidate, bindingNames)))
      ) {
        hasPropDrivenCondition = true;
      }

      if (
        !hasCompositePropText &&
        ((t.isTemplateLiteral(candidate) &&
          countBindingReferences(candidate, bindingNames) >= 2) ||
          (t.isBinaryExpression(candidate) &&
            countBindingReferences(candidate, bindingNames) >= 2))
      ) {
        hasCompositePropText = true;
      }
    }
  );

  return hasTransformingCall || hasPropDrivenCondition || hasCompositePropText;
}

function hasComponentMockReimplementation(ast: t.File | null): boolean {
  if (!ast) {
    return false;
  }

  let found = false;
  walk(ast, (candidate) => {
    if (found || !t.isCallExpression(candidate)) {
      return;
    }

    const mockTarget = getMockTarget(candidate);
    if (!mockTarget || !/^\.\.?\//u.test(mockTarget)) {
      return;
    }

    const factory = getMockFactory(candidate);
    if (!factory) {
      return;
    }

    const returnedExpression = getReturnedExpression(factory);
    const implementations =
      getMockedComponentImplementations(returnedExpression);

    if (
      implementations.some((implementation) =>
        isPropDrivenComponentReimplementation(implementation)
      )
    ) {
      found = true;
    }
  });

  return found;
}

function hasDuplicateConstSource(code: string, ast: t.File | null): boolean {
  if (!ast) {
    const names = [...code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\b/gu)].map(
      (match) => match[1]
    );
    return new Set(names).size !== names.length;
  }

  const seen = new Set<string>();
  let duplicateFound = false;

  const addBinding = (
    id: t.LVal | t.Identifier | t.VoidPattern | null | undefined
  ) => {
    if (!id || duplicateFound) {
      return;
    }
    if (t.isIdentifier(id)) {
      if (seen.has(id.name)) {
        duplicateFound = true;
        return;
      }
      seen.add(id.name);
      return;
    }
    if (t.isVoidPattern(id)) {
      return;
    }
    if (t.isObjectPattern(id)) {
      for (const property of id.properties) {
        if (t.isRestElement(property)) {
          addBinding(property.argument);
          continue;
        }
        if (t.isObjectProperty(property)) {
          addBinding(property.value as t.LVal | t.VoidPattern);
        }
      }
      return;
    }
    if (t.isArrayPattern(id)) {
      for (const element of id.elements) {
        if (element && !t.isRestElement(element)) {
          addBinding(element as t.LVal | t.VoidPattern);
        }
      }
    }
  };

  for (const node of ast.program.body) {
    if (!t.isVariableDeclaration(node) || node.kind !== "const") {
      continue;
    }
    for (const declaration of node.declarations) {
      addBinding(declaration.id);
      if (duplicateFound) {
        return true;
      }
    }
  }

  return false;
}

function hasOverloadedHoistedState(ast: t.File | null): boolean {
  if (!ast) {
    return false;
  }

  let overloaded = false;
  walk(ast, (candidate) => {
    if (
      overloaded ||
      !t.isCallExpression(candidate) ||
      !t.isMemberExpression(candidate.callee) ||
      !t.isIdentifier(candidate.callee.object, { name: "vi" }) ||
      !t.isIdentifier(candidate.callee.property, { name: "hoisted" })
    ) {
      return;
    }

    const factory = candidate.arguments[0];
    if (
      !factory ||
      !(
        t.isArrowFunctionExpression(factory) ||
        t.isFunctionExpression(factory) ||
        t.isFunctionDeclaration(factory)
      )
    ) {
      return;
    }

    let returnedObject: t.ObjectExpression | null = null;
    if (t.isObjectExpression(factory.body)) {
      returnedObject = factory.body;
    } else if (t.isBlockStatement(factory.body)) {
      for (const statement of factory.body.body) {
        if (
          t.isReturnStatement(statement) &&
          t.isObjectExpression(statement.argument)
        ) {
          returnedObject = statement.argument;
          break;
        }
      }
    }
    if (!returnedObject) {
      return;
    }

    const properties = returnedObject.properties.filter(
      (property): property is t.ObjectProperty => t.isObjectProperty(property)
    );
    if (properties.length < 6) {
      return;
    }

    const hasFunctionValues = properties.some(
      (property) =>
        t.isFunctionExpression(property.value) ||
        t.isArrowFunctionExpression(property.value) ||
        (t.isCallExpression(property.value) &&
          t.isMemberExpression(property.value.callee) &&
          t.isIdentifier(property.value.callee.object, { name: "vi" }))
    );
    const hasScalarValues = properties.some(
      (property) =>
        t.isBooleanLiteral(property.value) ||
        t.isNullLiteral(property.value) ||
        t.isNumericLiteral(property.value) ||
        t.isStringLiteral(property.value) ||
        t.isIdentifier(property.value, { name: "undefined" })
    );

    overloaded = hasFunctionValues && hasScalarValues;
  });

  return overloaded;
}

export function detectRepoContractIssues(code: string): RepoContractIssue[] {
  const issues: RepoContractIssue[] = [];
  const ast = parseCode(code);

  const hasHelperAssertion = analyzeBoundaryIsolation(code).some(
    (issue) => issue.kind === "helper-embedded-assertion"
  );
  if (hasHelperAssertion) {
    issues.push({
      code: "helper-assertion",
      message: ISSUE_MESSAGES["helper-assertion"],
    });
  }

  const hasQueryToBeDefined =
    DETECTORS[0]![1].test(code) && /\.toBeDefined\s*\(\s*\)/.test(code);
  if (hasQueryToBeDefined) {
    issues.push({
      code: "query-to-be-defined",
      message: ISSUE_MESSAGES["query-to-be-defined"],
    });
  }

  for (const [codeKey, pattern] of DETECTORS.slice(1)) {
    if (!pattern.test(code)) {
      continue;
    }

    issues.push({ code: codeKey, message: ISSUE_MESSAGES[codeKey] });
  }

  if (hasDuplicateConstSource(code, ast)) {
    issues.push({
      code: "duplicate-const-source",
      message: ISSUE_MESSAGES["duplicate-const-source"],
    });
  }

  if (hasOverloadedHoistedState(ast)) {
    issues.push({
      code: "overloaded-hoisted-state",
      message: ISSUE_MESSAGES["overloaded-hoisted-state"],
    });
  }

  if (hasComponentMockReimplementation(ast)) {
    issues.push({
      code: "component-mock-reimplementation",
      message: ISSUE_MESSAGES["component-mock-reimplementation"],
    });
  }

  return issues;
}
