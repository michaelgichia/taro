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
    /(?:const\s+\w+\s*=\s*\{[\s\S]*?\bbeforeEach\s*\([\s\S]*?\b\w+\.\w+\s*=|vi\.hoisted\s*\(\s*\(\)\s*=>[\s\S]*?(?::\s*(?:false|true|null|"|'|\d)|(?:outcome|control|state|shouldFail)\s*:))/,
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
    /(?:vi|jest)\.mock\s*\(\s*['"]next\/dynamic['"][\s\S]*?\bprops\b[\s\S]*?(?:\bin\b|\.\w+)/,
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

  return issues;
}
