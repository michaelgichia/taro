import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import { classifyBoundaryKind } from "#core/boundary-learning.ts";
import type { Finding } from "#core/findings-reporter.ts";
import type {
  AnalyzedRecording,
  ItGroup,
  JsScenarioPlan,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
} from "#types/recording.ts";
import type { RepoRenderTargetCandidate } from "#types/state.ts";

type AccessibleControlKind =
  | "button"
  | "checkbox"
  | "combobox"
  | "radio"
  | "textbox";
type ComponentImportKind = NonNullable<RepoRenderTargetCandidate["importKind"]>;
type QueryBuilder =
  | ReturnType<typeof buildRoleQuery>
  | ReturnType<typeof buildTextQuery>;

interface CollectedText {
  kind: "heading" | "text";
  name: string;
  level?: number;
}

interface CollectedControl {
  kind: AccessibleControlKind | "link";
  name: string;
  preferredMethod: QueryDescriptor["method"];
}

interface CollectedField {
  kind: "checkbox" | "combobox" | "radio" | "textbox";
  label?: string;
  placeholder?: string;
}

interface ImportedBinding {
  importPath: string;
  imported: string;
  kind: "default" | "named";
  local: string;
}

interface InferredPropValue {
  expression: string;
  literalValue?: boolean | number | string;
}

interface CollectedAssertion {
  name?: string;
  label: string;
  matcher?: string;
  query: QueryBuilder;
}

interface CollectedVariantScenario {
  assertions: CollectedAssertion[];
  name: string;
  renderOverrides: string;
}

interface ComponentSurface {
  headings: CollectedText[];
  texts: CollectedText[];
  controls: CollectedControl[];
  fields: CollectedField[];
  importBindingsUsed: string[];
  supplementalAssertions: CollectedAssertion[];
  variantScenarios: CollectedVariantScenario[];
  hasOpaqueJsx: boolean;
  boundaryImports: string[];
}

interface ComponentDefinition {
  importKind: ComponentImportKind;
  name: string;
  props: string[];
  roots: Array<t.JSXElement | t.JSXFragment>;
  node:
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression;
}

interface ComponentTargetPlan {
  additionalImports?: string[];
  analyzedRecording: AnalyzedRecording;
  enableSetupOverrides?: boolean;
  findings: Finding[];
  moduleStatements?: string[];
  queryResults: QueryResult[];
  renderTarget: RepoRenderTargetCandidate;
  renderExpression?: string | null;
  scenarios?: JsScenarioPlan[];
}

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

const GENERIC_TEXTS = new Set([
  "cancel",
  "close",
  "details",
  "information",
  "loading",
  "next",
  "open",
  "save",
  "submit",
]);

function buildTextAssertion(name: string): CollectedAssertion {
  return {
    name: `renders "${name}"`,
    label: name,
    matcher: ".toBeVisible()",
    query: buildTextQuery("getByText", name),
  };
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function getJsxName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName
): string | null {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return null;
}

function getStringAttributeValue(
  attribute?: t.JSXAttribute["value"] | null
): string | null {
  if (!attribute) {
    return null;
  }

  if (t.isStringLiteral(attribute)) {
    return normalizeText(attribute.value);
  }

  if (t.isJSXExpressionContainer(attribute)) {
    const expression = attribute.expression;
    if (t.isStringLiteral(expression)) {
      return normalizeText(expression.value);
    }
    if (
      t.isTemplateLiteral(expression) &&
      expression.expressions.length === 0
    ) {
      return normalizeText(
        expression.quasis.map((quasi) => quasi.value.cooked ?? "").join("")
      );
    }
  }

  return null;
}

function collectLiteralText(node: t.Node | null | undefined): string {
  if (!node) {
    return "";
  }

  if (t.isJSXText(node)) {
    return node.value;
  }

  if (t.isStringLiteral(node)) {
    return node.value;
  }

  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
  }

  if (t.isJSXExpressionContainer(node)) {
    return collectLiteralText(node.expression);
  }

  if (t.isJSXElement(node)) {
    return node.children.map((child) => collectLiteralText(child)).join(" ");
  }

  if (t.isJSXFragment(node)) {
    return node.children.map((child) => collectLiteralText(child)).join(" ");
  }

  return "";
}

function collectReturnedJsxRoots(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
): Array<t.JSXElement | t.JSXFragment> {
  const roots: Array<t.JSXElement | t.JSXFragment> = [];

  const visitExpression = (
    expression: t.Expression | t.PrivateName | null | undefined
  ) => {
    if (!expression || t.isPrivateName(expression)) {
      return;
    }

    if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
      roots.push(expression);
      return;
    }

    if (t.isConditionalExpression(expression)) {
      visitExpression(expression.consequent);
      visitExpression(expression.alternate);
      return;
    }

    if (t.isLogicalExpression(expression)) {
      visitExpression(expression.right);
      return;
    }

    if (t.isSequenceExpression(expression)) {
      expression.expressions.forEach((part) => visitExpression(part));
      return;
    }

    if (t.isArrayExpression(expression)) {
      expression.elements.forEach((part) => {
        if (part && t.isExpression(part)) {
          visitExpression(part);
        }
      });
    }
  };

  if (t.isArrowFunctionExpression(node) && t.isExpression(node.body)) {
    visitExpression(node.body);
    return roots;
  }

  const body = node.body;
  if (!t.isBlockStatement(body)) {
    return roots;
  }

  const visitStatement = (statement: t.Statement) => {
    if (
      t.isReturnStatement(statement) &&
      statement.argument &&
      t.isExpression(statement.argument)
    ) {
      visitExpression(statement.argument);
      return;
    }

    if (t.isBlockStatement(statement)) {
      statement.body.forEach(visitStatement);
      return;
    }

    if (t.isIfStatement(statement)) {
      visitStatement(statement.consequent);
      if (statement.alternate) {
        if (t.isStatement(statement.alternate)) {
          visitStatement(statement.alternate);
        } else if (t.isExpression(statement.alternate)) {
          visitExpression(statement.alternate);
        }
      }
      return;
    }

    if (t.isSwitchStatement(statement)) {
      for (const switchCase of statement.cases) {
        switchCase.consequent.forEach(visitStatement);
      }
    }
  };

  body.body.forEach(visitStatement);

  return roots;
}

function getComponentExpression(
  expression: t.Expression | null | undefined
): t.FunctionExpression | t.ArrowFunctionExpression | null {
  if (!expression) {
    return null;
  }

  if (
    t.isArrowFunctionExpression(expression) ||
    t.isFunctionExpression(expression)
  ) {
    return expression;
  }

  if (
    t.isCallExpression(expression) &&
    t.isIdentifier(expression.callee) &&
    ["memo", "forwardRef"].includes(expression.callee.name)
  ) {
    const firstArg = expression.arguments[0];
    if (
      firstArg &&
      (t.isArrowFunctionExpression(firstArg) ||
        t.isFunctionExpression(firstArg))
    ) {
      return firstArg;
    }
  }

  return null;
}

function isComponentLikeName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/u.test(name);
}

function escapeSingleQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toExpressionSource(
  source: string,
  node?: t.Node | null
): string | null {
  if (!node || typeof node.start !== "number" || typeof node.end !== "number") {
    return null;
  }

  return source.slice(node.start, node.end).trim();
}

function collectPropNames(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
): string[] {
  const firstParam = node.params[0];
  const target =
    t.isAssignmentPattern(firstParam) && t.isObjectPattern(firstParam.left)
      ? firstParam.left
      : t.isObjectPattern(firstParam)
        ? firstParam
        : null;

  if (!target) {
    return [];
  }

  const names = new Set<string>();
  for (const property of target.properties) {
    if (t.isObjectProperty(property)) {
      if (t.isIdentifier(property.value)) {
        names.add(property.value.name);
      } else if (
        t.isAssignmentPattern(property.value) &&
        t.isIdentifier(property.value.left)
      ) {
        names.add(property.value.left.name);
      }
      continue;
    }

    if (t.isRestElement(property) && t.isIdentifier(property.argument)) {
      names.add(property.argument.name);
    }
  }

  return [...names].sort();
}

function buildImportBindings(ast: t.File): Map<string, ImportedBinding> {
  const bindings = new Map<string, ImportedBinding>();

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        bindings.set(specifier.local.name, {
          importPath: node.source.value,
          imported: "default",
          kind: "default",
          local: specifier.local.name,
        });
        continue;
      }

      if (t.isImportSpecifier(specifier)) {
        bindings.set(specifier.local.name, {
          importPath: node.source.value,
          imported: t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value,
          kind: "named",
          local: specifier.local.name,
        });
      }
    }
  }

  return bindings;
}

function buildAdditionalImportLines(
  importBindings: Map<string, ImportedBinding>,
  usedBindings: string[]
): string[] {
  const grouped = new Map<
    string,
    { defaultImport: string | null; namedImports: string[] }
  >();

  for (const localName of usedBindings) {
    const binding = importBindings.get(localName);
    if (!binding) {
      continue;
    }

    const entry = grouped.get(binding.importPath) ?? {
      defaultImport: null,
      namedImports: [],
    };

    if (binding.kind === "default") {
      entry.defaultImport = binding.local;
    } else {
      entry.namedImports.push(
        binding.imported === binding.local
          ? binding.local
          : `${binding.imported} as ${binding.local}`
      );
    }

    grouped.set(binding.importPath, entry);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([importPath, entry]) => {
      const named = [...new Set(entry.namedImports)].sort();
      if (entry.defaultImport && named.length > 0) {
        return `import ${entry.defaultImport}, { ${named.join(", ")} } from '${importPath}'`;
      }

      if (entry.defaultImport) {
        return `import ${entry.defaultImport} from '${importPath}'`;
      }

      return `import { ${named.join(", ")} } from '${importPath}'`;
    });
}

export function resolveComponentDefinitionFromAst(
  ast: t.File,
  defaultNameFallback: string
): ComponentDefinition | null {
  const functions = new Map<
    string,
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >();
  const exportedNamed = new Set<string>();
  let defaultExport: { name: string; importKind: ComponentImportKind } | null =
    null;

  for (const node of ast.program.body) {
    if (
      t.isFunctionDeclaration(node) &&
      node.id?.name &&
      isComponentLikeName(node.id.name)
    ) {
      functions.set(node.id.name, node);
      continue;
    }

    if (t.isVariableDeclaration(node)) {
      for (const declarator of node.declarations) {
        if (
          !t.isIdentifier(declarator.id) ||
          !isComponentLikeName(declarator.id.name)
        ) {
          continue;
        }

        const componentExpression =
          declarator.init && t.isExpression(declarator.init)
            ? getComponentExpression(declarator.init)
            : null;
        if (componentExpression) {
          functions.set(declarator.id.name, componentExpression);
        }
      }
      continue;
    }

    if (t.isExportNamedDeclaration(node)) {
      if (
        t.isFunctionDeclaration(node.declaration) &&
        node.declaration.id?.name
      ) {
        const name = node.declaration.id.name;
        if (isComponentLikeName(name)) {
          functions.set(name, node.declaration);
          exportedNamed.add(name);
        }
      }

      if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (
            !t.isIdentifier(declarator.id) ||
            !isComponentLikeName(declarator.id.name)
          ) {
            continue;
          }

          const componentExpression =
            declarator.init && t.isExpression(declarator.init)
              ? getComponentExpression(declarator.init)
              : null;
          if (componentExpression) {
            functions.set(declarator.id.name, componentExpression);
            exportedNamed.add(declarator.id.name);
          }
        }
      }

      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
          exportedNamed.add(specifier.local.name);
        }
      }

      continue;
    }

    if (t.isExportDefaultDeclaration(node)) {
      if (t.isFunctionDeclaration(node.declaration)) {
        const exportName = node.declaration.id?.name ?? defaultNameFallback;
        functions.set(exportName, node.declaration);
        defaultExport = { name: exportName, importKind: "default" };
        continue;
      }

      if (t.isIdentifier(node.declaration)) {
        defaultExport = { name: node.declaration.name, importKind: "default" };
        continue;
      }

      const componentExpression = t.isExpression(node.declaration)
        ? getComponentExpression(node.declaration)
        : null;
      if (componentExpression) {
        functions.set(defaultNameFallback, componentExpression);
        defaultExport = { name: defaultNameFallback, importKind: "default" };
      }
    }
  }

  const selected =
    (defaultExport && functions.has(defaultExport.name)
      ? {
          importKind: defaultExport.importKind,
          name: defaultExport.name,
          node: functions.get(defaultExport.name)!,
        }
      : [...exportedNamed]
          .filter((name) => functions.has(name))
          .map((name) => ({
            importKind: "named" as const,
            name,
            node: functions.get(name)!,
          }))
          .sort((left, right) => left.name.localeCompare(right.name))[0]) ??
    null;

  if (!selected) {
    return null;
  }

  const roots = collectReturnedJsxRoots(selected.node);
  if (roots.length === 0) {
    return null;
  }

  return {
    importKind: selected.importKind,
    name: selected.name,
    node: selected.node,
    props: collectPropNames(selected.node),
    roots,
  };
}

function buildBoundaryImports(ast: t.File): string[] {
  const imports = new Set<string>();

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    const importPath = node.source.value;
    if (
      importPath === "react" ||
      importPath.startsWith("@testing-library/") ||
      /\.(?:css|scss|sass|less)$/u.test(importPath)
    ) {
      continue;
    }

    const kind = classifyBoundaryKind(importPath);
    const isFrameworkBoundary =
      importPath === "next/link" || importPath === "next/dynamic";
    const isAssetImport = /\.(?:svg|png|jpe?g|gif|webp|avif)$/u.test(
      importPath
    );
    const importedNames = node.specifiers.flatMap((specifier) => {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported)
      ) {
        return [specifier.imported.name];
      }
      if (t.isImportDefaultSpecifier(specifier)) {
        return [specifier.local.name];
      }
      return [];
    });

    if (
      kind !== "unknown" ||
      isFrameworkBoundary ||
      isAssetImport ||
      importedNames.some((name) => /^use[A-Z].*(Query|Mutation)$/u.test(name))
    ) {
      imports.add(importPath);
    }
  }

  return [...imports].sort();
}

function parseSimplePropComparison(
  expression: t.Expression,
  propNames: Set<string>,
  source: string
): { propName: string; valueExpression: string } | null {
  if (
    !t.isBinaryExpression(expression) ||
    !["===", "=="].includes(expression.operator)
  ) {
    return null;
  }

  if (t.isIdentifier(expression.left) && propNames.has(expression.left.name)) {
    const valueExpression = toExpressionSource(
      source,
      expression.right as t.Expression
    );
    return valueExpression
      ? { propName: expression.left.name, valueExpression }
      : null;
  }

  if (
    t.isIdentifier(expression.right) &&
    propNames.has(expression.right.name)
  ) {
    const valueExpression = toExpressionSource(
      source,
      expression.left as t.Expression
    );
    return valueExpression
      ? { propName: expression.right.name, valueExpression }
      : null;
  }

  return null;
}

function extractDisplayText(params: {
  baseProps: Map<string, InferredPropValue>;
  expression: t.Expression;
  propNames: Set<string>;
  source: string;
}): string | null {
  const { baseProps, expression, propNames, source } = params;

  if (t.isStringLiteral(expression)) {
    return normalizeText(expression.value);
  }

  if (t.isNumericLiteral(expression)) {
    return String(expression.value);
  }

  if (t.isTemplateLiteral(expression)) {
    if (expression.expressions.length === 0) {
      return normalizeText(
        expression.quasis.map((quasi) => quasi.value.cooked ?? "").join("")
      );
    }

    let combined = "";
    for (let index = 0; index < expression.quasis.length; index += 1) {
      combined += expression.quasis[index]?.value.cooked ?? "";
      if (index >= expression.expressions.length) {
        continue;
      }

      const part = extractDisplayText({
        baseProps,
        expression: expression.expressions[index] as t.Expression,
        propNames,
        source,
      });
      if (part == null) {
        return null;
      }
      combined += part;
    }

    return normalizeText(combined);
  }

  if (t.isIdentifier(expression)) {
    const value = baseProps.get(expression.name)?.literalValue;
    return value == null ? null : String(value);
  }

  if (t.isConditionalExpression(expression)) {
    const comparison = parseSimplePropComparison(
      expression.test,
      propNames,
      source
    );
    if (!comparison) {
      return null;
    }

    const currentValue = baseProps.get(comparison.propName)?.expression;
    if (!currentValue) {
      return null;
    }

    const branch =
      currentValue === comparison.valueExpression
        ? expression.consequent
        : expression.alternate;

    return extractDisplayText({
      baseProps,
      expression: branch,
      propNames,
      source,
    });
  }

  if (t.isLogicalExpression(expression) && expression.operator === "??") {
    if (t.isIdentifier(expression.left)) {
      const currentValue = baseProps.get(expression.left.name);
      if (currentValue && currentValue.expression !== "undefined") {
        return currentValue.literalValue == null
          ? null
          : String(currentValue.literalValue);
      }
    }

    return extractDisplayText({
      baseProps,
      expression: expression.right,
      propNames,
      source,
    });
  }

  return null;
}

function evaluateAttributeValue(params: {
  attributeValue?: t.JSXAttribute["value"] | null;
  baseProps: Map<string, InferredPropValue>;
  propNames: Set<string>;
  source: string;
}): string | null {
  const { attributeValue, baseProps, propNames, source } = params;
  if (!attributeValue) {
    return null;
  }

  if (t.isStringLiteral(attributeValue)) {
    return normalizeText(attributeValue.value);
  }

  if (
    t.isJSXExpressionContainer(attributeValue) &&
    t.isExpression(attributeValue.expression)
  ) {
    return extractDisplayText({
      baseProps,
      expression: attributeValue.expression,
      propNames,
      source,
    });
  }

  return null;
}

function buildRoleQuery(
  role: string,
  name?: string
): { descriptor: QueryDescriptor; query: string } {
  const namedQuery = name
    ? `screen.getByRole('${role}', { name: '${escapeSingleQuote(name)}' })`
    : `screen.getByRole('${role}')`;

  return {
    descriptor: {
      stepId: "component-step-0",
      method: "getByRole",
      queryRoot: "screen",
      role,
      target: name ?? role,
      raw: namedQuery,
    },
    query: namedQuery,
  };
}

function collectComponentSurface(
  roots: Array<t.JSXElement | t.JSXFragment>,
  params: {
    baseProps: Map<string, InferredPropValue>;
    boundaryImports: string[];
    importBindings: Map<string, ImportedBinding>;
    propNames: Set<string>;
    source: string;
  }
): ComponentSurface {
  const { baseProps, boundaryImports, importBindings, propNames, source } =
    params;
  const headings = new Map<string, CollectedText>();
  const texts = new Map<string, CollectedText>();
  const controls = new Map<string, CollectedControl>();
  const fields: CollectedField[] = [];
  const labelsById = new Map<string, string>();
  const supplementalAssertions = new Map<string, CollectedAssertion>();
  let hasOpaqueJsx = false;

  const registerHeading = (name: string, level?: number) => {
    if (!headings.has(name)) {
      headings.set(name, { kind: "heading", name, level });
    }
  };

  const registerText = (name: string) => {
    if (!texts.has(name) && !headings.has(name)) {
      texts.set(name, { kind: "text", name });
    }
  };

  const registerControl = (
    kind: AccessibleControlKind,
    name: string,
    preferredMethod: QueryDescriptor["method"]
  ) => {
    const key = `${kind}:${name}`;
    if (!controls.has(key)) {
      controls.set(key, { kind, name, preferredMethod });
    }
  };

  const registerSupplementalAssertion = (assertion: CollectedAssertion) => {
    const key = `${assertion.query.query}:${assertion.matcher ?? ".toBeVisible()"}`;
    if (!supplementalAssertions.has(key)) {
      supplementalAssertions.set(key, assertion);
    }
  };

  const visit = (
    node: t.JSXElement | t.JSXFragment,
    context: { wrapperLabel?: string | null } = {}
  ) => {
    if (t.isJSXFragment(node)) {
      for (const child of node.children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) {
          visit(child, context);
        }
      }
      return;
    }

    const tagName = getJsxName(node.openingElement.name);
    if (!tagName) {
      return;
    }

    if (/^[A-Z]/u.test(tagName)) {
      hasOpaqueJsx = true;
    }

    const attributes = new Map<string, t.JSXAttribute>();
    for (const attribute of node.openingElement.attributes) {
      if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
        attributes.set(attribute.name.name, attribute);
      }
    }

    const literalTextContent = normalizeText(
      node.children
        .filter((child) => !t.isJSXExpressionContainer(child))
        .map((child) => collectLiteralText(child))
        .join(" ")
    );
    const resolvedExpressionTexts = node.children.flatMap((child) => {
      if (
        !t.isJSXExpressionContainer(child) ||
        !t.isExpression(child.expression)
      ) {
        return [];
      }

      const resolved = extractDisplayText({
        baseProps,
        expression: child.expression,
        propNames,
        source,
      });
      return resolved ? [resolved] : [];
    });
    const textContent = normalizeText(
      [literalTextContent, ...resolvedExpressionTexts].filter(Boolean).join(" ")
    );
    const ariaLabel = getStringAttributeValue(
      attributes.get("aria-label")?.value
    );
    const role = getStringAttributeValue(attributes.get("role")?.value);
    const id = getStringAttributeValue(attributes.get("id")?.value);
    const htmlFor = getStringAttributeValue(attributes.get("htmlFor")?.value);
    const placeholder = getStringAttributeValue(
      attributes.get("placeholder")?.value
    );
    const inputType =
      getStringAttributeValue(attributes.get("type")?.value) ?? "text";
    const importBinding = importBindings.get(tagName);

    if (tagName === "label") {
      const labelText = ariaLabel ?? textContent;
      if (labelText && htmlFor) {
        labelsById.set(htmlFor, labelText);
      }

      for (const child of node.children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) {
          visit(child, { wrapperLabel: labelText ?? context.wrapperLabel });
        }
      }
      return;
    }

    if (
      (/^h[1-6]$/u.test(tagName) || role === "heading") &&
      (ariaLabel ?? textContent)
    ) {
      const level = /^h[1-6]$/u.test(tagName)
        ? Number(tagName.slice(1))
        : undefined;
      registerHeading(ariaLabel ?? textContent!, level);
    }

    if (tagName === "button" || role === "button") {
      const name = ariaLabel ?? textContent;
      if (name) {
        registerControl("button", name, "getByRole");
      }
    }

    if (tagName === "input" && ["submit", "button"].includes(inputType)) {
      const value = getStringAttributeValue(attributes.get("value")?.value);
      const name = ariaLabel ?? value ?? textContent;
      if (name) {
        registerControl("button", name, "getByRole");
      }
    }

    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      const explicitLabel =
        ariaLabel ??
        context.wrapperLabel ??
        (id ? labelsById.get(id) : undefined);
      const kind: CollectedField["kind"] =
        tagName === "select"
          ? "combobox"
          : inputType === "checkbox"
            ? "checkbox"
            : inputType === "radio"
              ? "radio"
              : "textbox";

      fields.push({
        kind,
        label: explicitLabel,
        placeholder: placeholder ?? undefined,
      });

      if (explicitLabel) {
        registerControl(
          kind,
          explicitLabel,
          kind === "textbox" ? "getByLabelText" : "getByRole"
        );
      } else if (placeholder && kind === "textbox") {
        registerControl("textbox", placeholder, "getByPlaceholderText");
      }
    }

    if (
      ["p", "span", "legend", "caption", "label"].includes(tagName) &&
      textContent &&
      textContent.length >= 4 &&
      !GENERIC_TEXTS.has(textContent.toLowerCase())
    ) {
      registerText(textContent);
    }

    if (
      (tagName === "a" || importBinding?.importPath === "next/link") &&
      attributes.has("href")
    ) {
      const hrefValue = evaluateAttributeValue({
        attributeValue: attributes.get("href")?.value,
        baseProps,
        propNames,
        source,
      });

      if (hrefValue) {
        registerSupplementalAssertion({
          label: hrefValue,
          matcher: `.toHaveAttribute('href', '${escapeSingleQuote(hrefValue)}')`,
          query: buildRoleQuery("link"),
        });
      }
    }

    for (const child of node.children) {
      if (t.isJSXElement(child) || t.isJSXFragment(child)) {
        visit(child, context);
      }
    }
  };

  for (const root of roots) {
    visit(root);
  }

  return {
    headings: [...headings.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    texts: [...texts.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    controls: [...controls.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    fields,
    importBindingsUsed: [],
    supplementalAssertions: [...supplementalAssertions.values()],
    variantScenarios: [],
    hasOpaqueJsx,
    boundaryImports,
  };
}

function buildTextQuery(
  method: QueryDescriptor["method"],
  name: string
): { descriptor: QueryDescriptor; query: string } {
  const escaped = escapeSingleQuote(name);
  return {
    descriptor: {
      stepId: "component-step-0",
      method,
      queryRoot: "screen",
      target: name,
      raw: `screen.${method}('${escaped}')`,
    },
    query: `screen.${method}('${escaped}')`,
  };
}

function buildAssertionSteps(surface: ComponentSurface): {
  groups: ItGroup[];
  queryResults: QueryResult[];
  scenarios: JsScenarioPlan[];
} {
  const primaryAssertions: CollectedAssertion[] = [
    ...surface.headings
      .slice(0, 2)
      .map((heading) => ({
        name: `renders "${heading.name}"`,
        label: heading.name,
        matcher: ".toBeVisible()",
        query: buildRoleQuery("heading", heading.name),
      })),
    ...surface.texts
      .filter(
        (text) =>
          !surface.controls.some((control) => control.name === text.name)
      )
      .slice(0, 10)
      .map((text) => buildTextAssertion(text.name)),
    ...surface.supplementalAssertions.map((assertion) => ({
      ...assertion,
      name:
        assertion.query.descriptor.role === "link" &&
        assertion.matcher?.startsWith(".toHaveAttribute('href'")
          ? `links to "${assertion.label}"`
          : (assertion.name ?? `asserts "${assertion.label}"`),
    })),
  ];

  const controlAssertions: CollectedAssertion[] = surface.controls
    .slice(0, 5)
    .map((control) => {
      if (control.preferredMethod === "getByLabelText") {
        return {
          name: `renders ${control.kind} "${control.name}"`,
          label: control.name,
          matcher: ".toBeVisible()",
          query: buildTextQuery("getByLabelText", control.name),
        };
      }

      if (control.preferredMethod === "getByPlaceholderText") {
        return {
          name: `renders ${control.kind} "${control.name}"`,
          label: control.name,
          matcher: ".toBeVisible()",
          query: buildTextQuery("getByPlaceholderText", control.name),
        };
      }

      return {
        name: `renders ${control.kind} "${control.name}"`,
        label: control.name,
        matcher: ".toBeVisible()",
        query: buildRoleQuery(
          control.kind === "textbox" ? "textbox" : control.kind,
          control.name
        ),
      };
    });

  const makeAssertStep = (
    assertion: CollectedAssertion,
    index: number
  ): NormalizedStep => ({
    id: `component-step-${index + 1}`,
    action: "assert",
    originalType: assertion.query.descriptor.method,
    source: "js",
    target: assertion.query.descriptor.target,
    metadata: {
      query: {
        ...assertion.query.descriptor,
        stepId: `component-step-${index + 1}`,
      },
    },
  });

  const buildQueryResult = (assertion: CollectedAssertion): QueryResult => ({
    method: assertion.query.descriptor.method,
    query: assertion.query.query,
    quality:
      assertion.query.descriptor.method === "getByRole" ||
      assertion.query.descriptor.method === "getByLabelText"
        ? ("excellent" as const)
        : assertion.query.descriptor.method === "getByPlaceholderText"
          ? ("good" as const)
          : ("acceptable" as const),
    matcher: assertion.matcher ?? ".toBeVisible()",
  });

  const queryResults = [
    ...primaryAssertions.map(buildQueryResult),
    ...controlAssertions.map(buildQueryResult),
    ...surface.variantScenarios.flatMap((scenario) =>
      scenario.assertions.map(buildQueryResult)
    ),
  ];

  const groups: ItGroup[] = [];
  const scenarios: JsScenarioPlan[] = [];
  let stepIndex = 0;

  const registerSingleAssertionScenarios = (
    assertions: CollectedAssertion[]
  ) => {
    for (const assertion of assertions) {
      const step = makeAssertStep(assertion, stepIndex);
      stepIndex += 1;
      const name = assertion.name ?? `asserts "${assertion.label}"`;
      groups.push({ name, steps: [step] });
      scenarios.push({
        name,
        goal: "flow",
        steps: [step],
        helperRefs: [],
        requiresFreshRender: true,
        markerAssertions: [],
        unresolvedMarkerAssertions: [],
      });
    }
  };

  registerSingleAssertionScenarios(primaryAssertions);
  registerSingleAssertionScenarios(controlAssertions);

  for (const variantScenario of surface.variantScenarios) {
    const steps = variantScenario.assertions.map((assertion) => {
      const step = makeAssertStep(assertion, stepIndex);
      stepIndex += 1;
      return step;
    });

    groups.push({ name: variantScenario.name, steps });
    scenarios.push({
      name: variantScenario.name,
      goal: "flow",
      helperRefs: [],
      renderOverrides: variantScenario.renderOverrides,
      requiresFreshRender: true,
      steps,
      markerAssertions: [],
      unresolvedMarkerAssertions: [],
    });
  }

  return { groups, queryResults, scenarios };
}

function buildAnalyzedRecording(
  title: string,
  groups: ItGroup[]
): AnalyzedRecording {
  const steps = groups.flatMap((group) => group.steps);
  const recording: NormalizedRecording = {
    title,
    steps,
    rawStepCount: steps.length,
  };

  return {
    ...recording,
    diagnostics: {
      removedCursorWander: 0,
      removedDoubleClickNoise: 0,
      removedRedundantClicks: 0,
      preservedSemanticMarkers: 0,
      unresolvedSemanticMarkers: 0,
      rawStepCount: steps.length,
      filteredStepCount: steps.length,
      intentGroupCount: groups.length,
    },
    intentGroups: groups,
  };
}

export async function inferComponentTargetPlan(params: {
  componentPath: string;
  outputPath: string;
  projectRoot: string;
}): Promise<ComponentTargetPlan> {
  const { componentPath, outputPath, projectRoot } = params;
  const source = await readFile(componentPath, "utf-8");
  const fallbackName = basename(componentPath).replace(/\.[cm]?[jt]sx?$/u, "");
  let ast: t.File | null = null;
  try {
    ast = babelParser.parse(source, {
      sourceType: "module",
      plugins: AST_PLUGINS,
    });
  } catch {
    ast = null;
  }
  const definition = ast
    ? resolveComponentDefinitionFromAst(ast, fallbackName)
    : null;

  if (!definition) {
    return {
      analyzedRecording: buildAnalyzedRecording(fallbackName, []),
      findings: [
        {
          severity: "BLOCKING",
          category: "component-target",
          message:
            "Taro could not resolve an exported JSX component from the supplied file. Point target at the component module itself.",
        },
      ],
      queryResults: [],
      renderTarget: {
        symbol: fallbackName,
        importPath: componentPath,
        importKind: "default",
        sourceTestFile: relative(projectRoot, outputPath),
        helperNames: [],
        usesWithin: false,
      },
    };
  }

  if (!ast) {
    throw new Error(
      "Component AST should be available when definition resolves"
    );
  }
  const importBindings = buildImportBindings(ast);
  const boundaryImports = buildBoundaryImports(ast);
  const surface = collectComponentSurface(definition.roots, {
    baseProps: new Map<string, InferredPropValue>(),
    boundaryImports,
    importBindings,
    propNames: new Set(definition.props),
    source,
  });
  const { groups, queryResults, scenarios } = buildAssertionSteps(surface);
  const additionalImports = buildAdditionalImportLines(
    importBindings,
    surface.importBindingsUsed
  );
  const moduleStatements =
    definition.props.length > 0
      ? [
          `// TODO: replace this placeholder with explicit repo-local props or a recording-backed render path.`,
          `const UNRESOLVED_COMPONENT_PROPS = {} as Record<string, never>`,
        ]
      : [];
  const renderExpression =
    definition.props.length > 0
      ? `<${definition.name} {...UNRESOLVED_COMPONENT_PROPS} />`
      : `<${definition.name} />`;

  const findings: Finding[] = [];
  if (definition.props.length > 0) {
    findings.push({
      severity: "BLOCKING",
      category: "component-target",
      message:
        "Taro detected component props but could not find explicit repo-local defaults or fixtures to reuse. Keep this target as a draft until the prop setup is supplied directly.",
    });
  }
  if (surface.boundaryImports.length > 0) {
    findings.push({
      severity: "ADVISORY",
      category: "boundary",
      message: `Component inference detected external collaborators: ${surface.boundaryImports.slice(0, 3).join(", ")}.`,
    });
  }

  if (groups.length === 0 && definition.props.length === 0) {
    findings.unshift({
      severity: "BLOCKING",
      category: "component-target",
      message: surface.hasOpaqueJsx
        ? "Taro could not infer stable user-visible assertions from this component because it mostly renders opaque child components."
        : "Taro could not infer stable user-visible assertions from this component. Add clearer accessible copy or use --recording.",
    });
  }

  return {
    additionalImports,
    analyzedRecording: buildAnalyzedRecording(definition.name, groups),
    enableSetupOverrides: definition.props.length > 0,
    findings,
    moduleStatements,
    queryResults,
    renderTarget: {
      symbol: definition.name,
      importPath: componentPath,
      importKind: definition.importKind,
      sourceTestFile: relative(projectRoot, outputPath),
      helperNames: [],
      usesWithin: false,
      evidenceTerms: [
        definition.name,
        ...surface.headings.slice(0, 2).map((heading) => heading.name),
        ...surface.controls.slice(0, 2).map((control) => control.name),
      ],
    },
    renderExpression,
    scenarios,
  };
}
