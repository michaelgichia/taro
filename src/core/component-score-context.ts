import { readFile } from "node:fs/promises";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import {
  getStringLiteralValue,
  walkBabelAst as walk,
} from "#core/babel-utils.ts";
import {
  classifyBoundaryKind,
  getBoundaryGuardrailReason,
} from "#core/boundary-learning.ts";
import { resolveComponentDefinitionFromAst } from "#core/component-targeting.ts";
import { isRepoOwnedImportPath as isRepoOwnedImport } from "#core/import-path-utils.ts";
import type {
  ComponentScoreContext,
  HighSignalBranchHint,
  ScoreImportReference,
} from "#types/score.ts";

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

function isComponentLikeName(name: string): boolean {
  if (!/^[A-Z][A-Za-z0-9]*$/u.test(name)) {
    return false;
  }

  if (/^use[A-Z]/u.test(name) || /^[A-Z0-9_]+$/u.test(name)) {
    return false;
  }

  return true;
}

function classifyImportReference(params: {
  guardrailReason: ScoreImportReference["guardrailReason"];
  importPath: string;
  importedNames: string[];
  localNames: string[];
}): ScoreImportReference["kind"] {
  const { guardrailReason, importPath, importedNames, localNames } = params;

  if (/\.(?:svg|png|jpe?g|gif|webp|avif)$/u.test(importPath)) {
    return "asset";
  }

  if (
    /(?:^|\/)(?:hooks?)(?:\/|$)/iu.test(importPath) ||
    [...importedNames, ...localNames].some((name) => /^use[A-Z]/u.test(name))
  ) {
    return "hook";
  }

  if (
    isRepoOwnedImport(importPath) &&
    !guardrailReason &&
    importedNames.length > 0 &&
    !importedNames.some((name) => isComponentLikeName(name))
  ) {
    return "helper";
  }

  return classifyBoundaryKind(importPath);
}

function collectImportReferences(ast: t.File): ScoreImportReference[] {
  const references: ScoreImportReference[] = [];

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

    const importedNames: string[] = [];
    const localNames: string[] = [];
    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        importedNames.push("default");
        localNames.push(specifier.local.name);
        continue;
      }

      if (t.isImportSpecifier(specifier)) {
        importedNames.push(
          t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
        );
        localNames.push(specifier.local.name);
      }
    }

    const guardrailReason = getBoundaryGuardrailReason(
      importPath,
      importedNames
    );
    references.push({
      target: importPath,
      importedNames: [...new Set(importedNames)].sort(),
      kind: classifyImportReference({
        guardrailReason,
        importPath,
        importedNames,
        localNames,
      }),
      guardrailReason,
    });
  }

  return references.sort((left, right) =>
    left.target.localeCompare(right.target)
  );
}

function getStaticPropertyName(
  node: t.Node | t.PrivateName | null | undefined
): string | null {
  if (!node) {
    return null;
  }
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isPrivateName(node) && t.isIdentifier(node.id)) {
    return node.id.name;
  }
  return null;
}

function collectDynamicImportTargetsFromAst(ast: t.File): string[] {
  const dynamicLocals = new Set<string>();
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node) || node.source.value !== "next/dynamic") {
      continue;
    }
    for (const specifier of node.specifiers) {
      if (t.isImportDefaultSpecifier(specifier)) {
        dynamicLocals.add(specifier.local.name);
      }
    }
  }

  if (dynamicLocals.size === 0) {
    return [];
  }

  const targets = new Set<string>();
  const getDynamicImportSource = (
    node: t.Node | null | undefined
  ): string | null => {
    if (!node) {
      return null;
    }
    if (t.isImportExpression(node)) {
      return getStringLiteralValue(node.source);
    }
    if (t.isCallExpression(node) && node.callee.type === "Import") {
      return getStringLiteralValue(node.arguments[0] ?? null);
    }
    return null;
  };
  const extractTarget = (
    node:
      | t.Expression
      | t.SpreadElement
      | t.ArgumentPlaceholder
      | null
      | undefined
  ): string | null => {
    if (!node) {
      return null;
    }

    if (
      t.isArrowFunctionExpression(node) ||
      t.isFunctionExpression(node) ||
      t.isFunctionDeclaration(node)
    ) {
      if (t.isImportExpression(node.body)) {
        return getStringLiteralValue(node.body.source);
      }
      const inlineImportSource = getDynamicImportSource(node.body);
      if (inlineImportSource) {
        return inlineImportSource;
      }
      if (t.isBlockStatement(node.body)) {
        for (const statement of node.body.body) {
          if (t.isReturnStatement(statement)) {
            const source = getDynamicImportSource(statement.argument);
            if (source) {
              return source;
            }
          }
        }
      }
    }

    return null;
  };

  walk(ast, (candidate) => {
    if (
      !t.isCallExpression(candidate) ||
      !t.isIdentifier(candidate.callee) ||
      !dynamicLocals.has(candidate.callee.name)
    ) {
      return;
    }

    const target = extractTarget(candidate.arguments[0]);
    if (target) {
      targets.add(target);
    }
  });

  return [...targets].sort();
}

function collectNameTokens(
  node: t.Node | null | undefined,
  pattern: RegExp
): string[] {
  const names = new Set<string>();
  walk(node, (candidate) => {
    if (t.isIdentifier(candidate) && pattern.test(candidate.name)) {
      names.add(candidate.name);
      return;
    }
    if (t.isMemberExpression(candidate)) {
      const propertyName = getStaticPropertyName(candidate.property);
      if (propertyName && pattern.test(propertyName)) {
        names.add(propertyName);
      }
    }
  });
  return [...names].sort();
}

function collectFallbackTokens(node: t.Node | null | undefined): string[] {
  const tokens = new Set<string>();
  walk(node, (candidate) => {
    const literal = getStringLiteralValue(candidate);
    if (literal) {
      tokens.add(literal);
      return;
    }
    if (
      t.isIdentifier(candidate) &&
      /^[A-Za-z][A-Za-z0-9_]*$/u.test(candidate.name)
    ) {
      tokens.add(candidate.name);
      return;
    }
    if (t.isMemberExpression(candidate)) {
      const propertyName = getStaticPropertyName(candidate.property);
      if (propertyName && /^[A-Za-z][A-Za-z0-9_]*$/u.test(propertyName)) {
        tokens.add(propertyName);
      }
    }
  });
  return [...tokens].slice(0, 4);
}

function containsComputedLookup(node: t.Node | null | undefined): boolean {
  let found = false;
  walk(node, (candidate) => {
    if (t.isMemberExpression(candidate) && candidate.computed) {
      found = true;
    }
  });
  return found;
}

function containsNullishSentinel(node: t.Node | null | undefined): boolean {
  let found = false;
  walk(node, (candidate) => {
    if (
      t.isNullLiteral(candidate) ||
      t.isIdentifier(candidate, { name: "undefined" })
    ) {
      found = true;
    }
  });
  return found;
}

function addBranchHint(
  hints: Map<HighSignalBranchHint["family"], Set<string>>,
  family: HighSignalBranchHint["family"],
  coverageTokens: string[]
): void {
  const normalizedTokens = coverageTokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (normalizedTokens.length === 0) {
    return;
  }
  const existing = hints.get(family) ?? new Set<string>();
  for (const token of normalizedTokens) {
    existing.add(token);
  }
  hints.set(family, existing);
}

function collectHighSignalBranchHints(node: t.Node): HighSignalBranchHint[] {
  const hints = new Map<HighSignalBranchHint["family"], Set<string>>();
  const loadingTokens = collectNameTokens(
    node,
    /(?:isLoading|isPending|loading|pending)/iu
  );
  if (loadingTokens.length >= 2) {
    addBranchHint(hints, "split-loading-flags", loadingTokens);
  }

  walk(node, (candidate) => {
    if (
      t.isLogicalExpression(candidate) &&
      (candidate.operator === "||" || candidate.operator === "??")
    ) {
      if (
        containsComputedLookup(candidate.left) &&
        collectFallbackTokens(candidate.right).length > 0
      ) {
        addBranchHint(
          hints,
          "unknown-mapping-fallback",
          collectFallbackTokens(candidate.right)
        );
      }

      if (collectNameTokens(candidate.left, /^displayName$/iu).length > 0) {
        addBranchHint(hints, "display-name-fallback", [
          "displayName",
          ...collectFallbackTokens(candidate.right),
        ]);
      }
    }

    if (
      (t.isLogicalExpression(candidate) ||
        t.isConditionalExpression(candidate) ||
        t.isIfStatement(candidate)) &&
      containsComputedLookup(candidate) &&
      containsNullishSentinel(candidate)
    ) {
      addBranchHint(hints, "null-or-missing-mapped-values", [
        "null",
        "undefined",
      ]);
    }

    if (
      t.isConditionalExpression(candidate) ||
      t.isLogicalExpression(candidate) ||
      t.isIfStatement(candidate)
    ) {
      const conditionNode = t.isIfStatement(candidate)
        ? candidate.test
        : t.isConditionalExpression(candidate)
          ? candidate.test
          : candidate.left;
      const roleTokens = collectNameTokens(
        conditionNode,
        /(?:role|admin|permission|member|owner)/iu
      );
      if (roleTokens.length > 0) {
        addBranchHint(hints, "role-gated-prop-propagation", roleTokens);
      }
    }
  });

  return [...hints.entries()]
    .map(([family, coverageTokens]) => ({
      family,
      coverageTokens: [...coverageTokens].sort(),
    }))
    .sort((left, right) => left.family.localeCompare(right.family));
}

function collectComponentConditionalCount(node: t.Node): number {
  let count = 0;

  walk(node, (candidate) => {
    if (t.isConditionalExpression(candidate)) {
      count += 1;
      return;
    }

    if (
      t.isLogicalExpression(candidate) &&
      (candidate.operator === "&&" || candidate.operator === "??")
    ) {
      count += 1;
    }
  });

  return count;
}

function collectEventHandlerCount(node: t.Node): number {
  let count = 0;

  walk(node, (candidate) => {
    if (!t.isJSXAttribute(candidate) || !t.isJSXIdentifier(candidate.name)) {
      return;
    }

    if (/^on[A-Z]/u.test(candidate.name.name)) {
      count += 1;
    }
  });

  return count;
}

function collectExportedUtilityNames(
  ast: t.File,
  componentName: string
): string[] {
  const names = new Set<string>();

  const addExportedName = (name: string | null | undefined) => {
    if (!name || name === componentName || isComponentLikeName(name)) {
      return;
    }

    names.add(name);
  };

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      if (t.isFunctionDeclaration(node.declaration)) {
        addExportedName(node.declaration.id?.name);
      } else if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (t.isIdentifier(declarator.id)) {
            addExportedName(declarator.id.name);
          }
        }
      } else if (t.isClassDeclaration(node.declaration)) {
        addExportedName(node.declaration.id?.name);
      }

      for (const specifier of node.specifiers) {
        if (t.isExportSpecifier(specifier)) {
          addExportedName(
            t.isIdentifier(specifier.exported)
              ? specifier.exported.name
              : specifier.exported.value
          );
        }
      }
      continue;
    }

    if (
      t.isExportDefaultDeclaration(node) &&
      t.isIdentifier(node.declaration)
    ) {
      addExportedName(node.declaration.name);
    }
  }

  return [...names].sort();
}

function analyzeComponentScoreContextFromAst(params: {
  ast: t.File;
  fallbackDisplayName: string;
}): ComponentScoreContext | null {
  const definition = resolveComponentDefinitionFromAst(
    params.ast,
    params.fallbackDisplayName
  );
  if (!definition) {
    return null;
  }

  return {
    componentDisplayName: definition.name,
    componentConditionalCount: collectComponentConditionalCount(
      definition.node
    ),
    componentEventHandlerCount: collectEventHandlerCount(definition.node),
    componentImportReferences: collectImportReferences(params.ast),
    exportedUtilityNames: collectExportedUtilityNames(
      params.ast,
      definition.name
    ),
    dynamicImportTargets: collectDynamicImportTargetsFromAst(params.ast),
    highSignalBranchHints: collectHighSignalBranchHints(definition.node),
  };
}

function analyzeComponentScoreContextFromSource(params: {
  source: string;
  fallbackDisplayName: string;
}): ComponentScoreContext | null {
  let ast: t.File;
  try {
    ast = babelParser.parse(params.source, {
      sourceType: "module",
      plugins: AST_PLUGINS,
    });
  } catch {
    return null;
  }

  return analyzeComponentScoreContextFromAst({
    ast,
    fallbackDisplayName: params.fallbackDisplayName,
  });
}

export async function loadComponentScoreContext(
  filePath: string
): Promise<ComponentScoreContext | null> {
  let source: string;
  try {
    source = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const fallbackDisplayName =
    filePath
      .split("/")
      .pop()
      ?.replace(/\.[cm]?[jt]sx?$/u, "") ?? "Component";

  return analyzeComponentScoreContextFromSource({
    source,
    fallbackDisplayName,
  });
}

export async function loadDynamicImportTargets(
  filePath: string
): Promise<string[]> {
  let source: string;
  try {
    source = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  let ast: t.File;
  try {
    ast = babelParser.parse(source, {
      sourceType: "module",
      plugins: AST_PLUGINS,
    });
  } catch {
    return [];
  }

  return collectDynamicImportTargetsFromAst(ast);
}
