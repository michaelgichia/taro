import { readFile } from "node:fs/promises";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import {
  classifyBoundaryKind,
  getBoundaryGuardrailReason,
} from "#core/boundary-learning.ts";
import { resolveComponentDefinitionFromAst } from "#core/component-targeting.ts";
import type {
  ComponentScoreContext,
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

function isRepoOwnedImport(importPath: string): boolean {
  return /^(?:\.{1,2}\/|@\/|~\/)/u.test(importPath);
}

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

export function analyzeComponentScoreContextFromAst(params: {
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
  };
}

export function analyzeComponentScoreContextFromSource(params: {
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
