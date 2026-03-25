import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import { match, P } from "ts-pattern";

import { getJsxName } from "#core/babel-utils.ts";
import { classifyBoundaryKind } from "#core/boundary-learning.ts";
import {
  collectLiteralText,
  collectReturnedJsxRoots,
  evaluateAttributeValue,
  extractDisplayText,
  getComponentExpression,
  getStringAttributeValue,
  normalizeText,
} from "#core/component-targeting.matchers.ts";
import type {
  AccessibleControlKind,
  AnalyzedRecording,
  BuiltQuery,
  CollectedAssertion,
  CollectedControl,
  CollectedField,
  CollectedText,
  ComponentDefinition,
  ComponentImportKind,
  ComponentSurface,
  ComponentTargetPlan,
  ImportedBinding,
  InferredPropValue,
  ItGroup,
  JsScenarioPlan,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  QueryResult,
  SurfaceCollectorState,
  SurfaceElementDetails,
  SurfaceVisitContext,
} from "#core/component-targeting.types.ts";
import type { Finding } from "#core/findings-reporter.ts";
import { escapeSingleQuote } from "#core/string-utils.ts";

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

function isComponentLikeName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/u.test(name);
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

function registerVariableComponents(
  functions: Map<
    string,
    t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
  >,
  declaration: t.VariableDeclaration,
  exportedNamed?: Set<string>
): void {
  for (const declarator of declaration.declarations) {
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
    if (!componentExpression) {
      continue;
    }

    functions.set(declarator.id.name, componentExpression);
    exportedNamed?.add(declarator.id.name);
  }
}

function registerExportSpecifiers(
  exportedNamed: Set<string>,
  specifiers: t.ExportNamedDeclaration["specifiers"]
): void {
  for (const specifier of specifiers) {
    if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local)) {
      exportedNamed.add(specifier.local.name);
    }
  }
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
    match(node)
      .with({ type: "FunctionDeclaration" }, (declaration) => {
        if (declaration.id?.name && isComponentLikeName(declaration.id.name)) {
          functions.set(declaration.id.name, declaration);
        }
      })
      .with({ type: "VariableDeclaration" }, (declaration) => {
        registerVariableComponents(functions, declaration);
      })
      .with({ type: "ExportNamedDeclaration" }, (declaration) => {
        match(declaration.declaration)
          .with({ type: "FunctionDeclaration" }, (exportedFunction) => {
            const name = exportedFunction.id?.name;
            if (!name || !isComponentLikeName(name)) {
              return;
            }

            functions.set(name, exportedFunction);
            exportedNamed.add(name);
          })
          .with({ type: "VariableDeclaration" }, (exportedVariables) => {
            registerVariableComponents(
              functions,
              exportedVariables,
              exportedNamed
            );
          })
          .otherwise(() => undefined);

        registerExportSpecifiers(exportedNamed, declaration.specifiers);
      })
      .with({ type: "ExportDefaultDeclaration" }, (declaration) => {
        match(declaration.declaration)
          .with({ type: "FunctionDeclaration" }, (exportedFunction) => {
            const exportName = exportedFunction.id?.name ?? defaultNameFallback;
            functions.set(exportName, exportedFunction);
            defaultExport = { name: exportName, importKind: "default" };
          })
          .with({ type: "Identifier" }, (identifier) => {
            defaultExport = { name: identifier.name, importKind: "default" };
          })
          .otherwise((exportedExpression) => {
            const componentExpression = t.isExpression(exportedExpression)
              ? getComponentExpression(exportedExpression)
              : null;
            if (!componentExpression) {
              return;
            }

            functions.set(defaultNameFallback, componentExpression);
            defaultExport = {
              name: defaultNameFallback,
              importKind: "default",
            };
          });
      })
      .otherwise(() => undefined);
  }

  const resolvedDefaultExport = defaultExport as {
    name: string;
    importKind: ComponentImportKind;
  } | null;
  const selected =
    (resolvedDefaultExport && functions.has(resolvedDefaultExport.name)
      ? {
          importKind: resolvedDefaultExport.importKind,
          name: resolvedDefaultExport.name,
          node: functions.get(resolvedDefaultExport.name)!,
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

function buildRoleQuery(role: string, name?: string): BuiltQuery {
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

function createSurfaceCollectorState(): SurfaceCollectorState {
  return {
    controls: new Map<string, CollectedControl>(),
    fields: [],
    hasOpaqueJsx: false,
    headings: new Map<string, CollectedText>(),
    labelsById: new Map<string, string>(),
    supplementalAssertions: new Map<string, CollectedAssertion>(),
    texts: new Map<string, CollectedText>(),
  };
}

function registerHeading(
  state: SurfaceCollectorState,
  name: string,
  level?: number
): void {
  if (!state.headings.has(name)) {
    state.headings.set(name, { kind: "heading", name, level });
  }
}

function registerText(state: SurfaceCollectorState, name: string): void {
  if (!state.texts.has(name) && !state.headings.has(name)) {
    state.texts.set(name, { kind: "text", name });
  }
}

function registerControl(
  state: SurfaceCollectorState,
  kind: AccessibleControlKind,
  name: string,
  preferredMethod: QueryDescriptor["method"]
): void {
  const key = `${kind}:${name}`;
  if (!state.controls.has(key)) {
    state.controls.set(key, { kind, name, preferredMethod });
  }
}

function registerSupplementalAssertion(
  state: SurfaceCollectorState,
  assertion: CollectedAssertion
): void {
  const key = `${assertion.query.query}:${assertion.matcher ?? ".toBeVisible()"}`;
  if (!state.supplementalAssertions.has(key)) {
    state.supplementalAssertions.set(key, assertion);
  }
}

function collectElementChildren(
  node: t.JSXElement | t.JSXFragment
): Array<t.JSXElement | t.JSXFragment> {
  return node.children.filter(
    (child): child is t.JSXElement | t.JSXFragment =>
      t.isJSXElement(child) || t.isJSXFragment(child)
  );
}

function buildAttributeMap(node: t.JSXElement): Map<string, t.JSXAttribute> {
  const attributes = new Map<string, t.JSXAttribute>();

  for (const attribute of node.openingElement.attributes) {
    if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
      attributes.set(attribute.name.name, attribute);
    }
  }

  return attributes;
}

function resolveElementTextContent(
  node: t.JSXElement,
  params: {
    baseProps: Map<string, InferredPropValue>;
    propNames: Set<string>;
    source: string;
  }
): string | null {
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
      baseProps: params.baseProps,
      expression: child.expression,
      propNames: params.propNames,
      source: params.source,
    });
    return resolved ? [resolved] : [];
  });

  return normalizeText(
    [literalTextContent, ...resolvedExpressionTexts].filter(Boolean).join(" ")
  );
}

function buildSurfaceElementDetails(
  node: t.JSXElement,
  params: {
    baseProps: Map<string, InferredPropValue>;
    importBindings: Map<string, ImportedBinding>;
    propNames: Set<string>;
    source: string;
  }
): SurfaceElementDetails | null {
  const tagName = getJsxName(node.openingElement.name);
  if (!tagName) {
    return null;
  }

  const attributes = buildAttributeMap(node);
  return {
    ariaLabel: getStringAttributeValue(attributes.get("aria-label")?.value),
    attributes,
    htmlFor: getStringAttributeValue(attributes.get("htmlFor")?.value),
    id: getStringAttributeValue(attributes.get("id")?.value),
    importBinding: params.importBindings.get(tagName),
    inputType: getStringAttributeValue(attributes.get("type")?.value) ?? "text",
    placeholder: getStringAttributeValue(attributes.get("placeholder")?.value),
    role: getStringAttributeValue(attributes.get("role")?.value),
    tagName,
    textContent: resolveElementTextContent(node, params),
  };
}

function resolveHeadingRegistration(
  details: SurfaceElementDetails
): { level?: number; name: string } | null {
  const name = details.ariaLabel ?? details.textContent;
  if (!name) {
    return null;
  }

  return match(details)
    .with(
      { tagName: P.when((tagName) => /^h[1-6]$/u.test(tagName)) },
      ({ tagName }) => ({ level: Number(tagName.slice(1)), name })
    )
    .with({ role: "heading" }, () => ({ name }))
    .otherwise(() => null);
}

function resolveButtonControl(
  details: SurfaceElementDetails
): { kind: AccessibleControlKind; name: string } | null {
  const accessibleName = details.ariaLabel ?? details.textContent;
  if (
    accessibleName &&
    (details.tagName === "button" || details.role === "button")
  ) {
    return { kind: "button", name: accessibleName };
  }

  if (details.tagName !== "input") {
    return null;
  }

  return match(details.inputType)
    .with(P.union("submit", "button"), () => {
      const value = getStringAttributeValue(
        details.attributes.get("value")?.value
      );
      const name = details.ariaLabel ?? value ?? details.textContent;
      return name ? { kind: "button" as const, name } : null;
    })
    .otherwise(() => null);
}

function isFormFieldTag(tagName: string): boolean {
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function resolveFieldKind(
  details: SurfaceElementDetails
): CollectedField["kind"] {
  return match<SurfaceElementDetails, CollectedField["kind"]>(details)
    .with({ tagName: "select" }, () => "combobox")
    .with({ tagName: "input", inputType: "checkbox" }, () => "checkbox")
    .with({ tagName: "input", inputType: "radio" }, () => "radio")
    .otherwise(() => "textbox");
}

function resolveFieldControl(
  kind: CollectedField["kind"],
  explicitLabel?: string,
  placeholder?: string | null
): {
  kind: AccessibleControlKind;
  name: string;
  preferredMethod: QueryDescriptor["method"];
} | null {
  return match({ explicitLabel, kind, placeholder })
    .with(
      { explicitLabel: P.string },
      ({ explicitLabel: name, kind: resolvedKind }) => ({
        kind: resolvedKind,
        name,
        preferredMethod:
          resolvedKind === "textbox" ? "getByLabelText" : "getByRole",
      })
    )
    .with(
      { kind: "textbox", placeholder: P.string },
      ({ placeholder: name }) => ({
        kind: "textbox" as const,
        name,
        preferredMethod: "getByPlaceholderText" as const,
      })
    )
    .otherwise(() => null);
}

function shouldRegisterText(
  details: SurfaceElementDetails
): details is SurfaceElementDetails & { textContent: string } {
  return match(details)
    .with(
      {
        tagName: P.union("p", "span", "legend", "caption", "label"),
        textContent: P.when(
          (textContent): textContent is string =>
            typeof textContent === "string" &&
            textContent.length >= 4 &&
            !GENERIC_TEXTS.has(textContent.toLowerCase())
        ),
      },
      () => true
    )
    .otherwise(() => false);
}

function resolveLinkAssertion(
  details: SurfaceElementDetails,
  params: {
    baseProps: Map<string, InferredPropValue>;
    propNames: Set<string>;
    source: string;
  }
): CollectedAssertion | null {
  const isLinkLike =
    details.tagName === "a" ||
    details.importBinding?.importPath === "next/link";
  if (!isLinkLike || !details.attributes.has("href")) {
    return null;
  }

  const hrefValue = evaluateAttributeValue({
    attributeValue: details.attributes.get("href")?.value,
    baseProps: params.baseProps,
    propNames: params.propNames,
    source: params.source,
  });

  return hrefValue
    ? {
        label: hrefValue,
        matcher: `.toHaveAttribute('href', '${escapeSingleQuote(hrefValue)}')`,
        query: buildRoleQuery("link"),
      }
    : null;
}

function finalizeSurface(
  state: SurfaceCollectorState,
  boundaryImports: string[]
): ComponentSurface {
  return {
    headings: [...state.headings.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    texts: [...state.texts.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    controls: [...state.controls.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    fields: state.fields,
    importBindingsUsed: [],
    supplementalAssertions: [...state.supplementalAssertions.values()],
    variantScenarios: [],
    hasOpaqueJsx: state.hasOpaqueJsx,
    boundaryImports,
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
  const state = createSurfaceCollectorState();

  const visit = (
    node: t.JSXElement | t.JSXFragment,
    context: SurfaceVisitContext = {}
  ) => {
    if (t.isJSXFragment(node)) {
      collectElementChildren(node).forEach((child) => visit(child, context));
      return;
    }

    const details = buildSurfaceElementDetails(node, {
      baseProps,
      importBindings,
      propNames,
      source,
    });
    if (!details) {
      return;
    }

    if (/^[A-Z]/u.test(details.tagName)) {
      state.hasOpaqueJsx = true;
    }

    if (details.tagName === "label") {
      const labelText = details.ariaLabel ?? details.textContent;
      if (labelText && details.htmlFor) {
        state.labelsById.set(details.htmlFor, labelText);
      }

      collectElementChildren(node).forEach((child) =>
        visit(child, { wrapperLabel: labelText ?? context.wrapperLabel })
      );
      return;
    }

    const headingRegistration = resolveHeadingRegistration(details);
    if (headingRegistration) {
      registerHeading(
        state,
        headingRegistration.name,
        headingRegistration.level
      );
    }

    const buttonControl = resolveButtonControl(details);
    if (buttonControl) {
      registerControl(
        state,
        buttonControl.kind,
        buttonControl.name,
        "getByRole"
      );
    }

    if (isFormFieldTag(details.tagName)) {
      const explicitLabel =
        details.ariaLabel ??
        context.wrapperLabel ??
        (details.id ? state.labelsById.get(details.id) : undefined);
      const kind = resolveFieldKind(details);

      state.fields.push({
        kind,
        label: explicitLabel,
        placeholder: details.placeholder ?? undefined,
      });

      const fieldControl = resolveFieldControl(
        kind,
        explicitLabel,
        details.placeholder
      );
      if (fieldControl) {
        registerControl(
          state,
          fieldControl.kind,
          fieldControl.name,
          fieldControl.preferredMethod
        );
      }
    }

    if (shouldRegisterText(details)) {
      registerText(state, details.textContent);
    }

    const linkAssertion = resolveLinkAssertion(details, {
      baseProps,
      propNames,
      source,
    });
    if (linkAssertion) {
      registerSupplementalAssertion(state, linkAssertion);
    }

    collectElementChildren(node).forEach((child) => visit(child, context));
  };

  roots.forEach((root) => visit(root));

  return finalizeSurface(state, boundaryImports);
}

function buildTextQuery(
  method: QueryDescriptor["method"],
  name: string
): BuiltQuery {
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
