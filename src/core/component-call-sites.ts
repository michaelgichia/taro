import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import * as babelParser from "@babel/parser";
import * as t from "@babel/types";

import { getJsxName } from "#core/babel-utils.ts";

const AST_PLUGINS: babelParser.ParserPlugin[] = [
  "jsx",
  "typescript",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  "topLevelAwait",
];

const DEFAULT_MAX_FILES = 500;
const RESOLVABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];

const SKIPPED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".taro",
]);

export type CallSitePropOrigin =
  | "literal"
  | "handler"
  | "boolean"
  | "identifier"
  | "unknown";

export interface CallSiteProp {
  name: string;
  expression: string;
  rawExpression: string | null;
  origin: CallSitePropOrigin;
}

export interface CallSiteEvidence {
  filePath: string;
  localName: string;
  componentName: string;
  importKind: "default" | "named";
  importedName: string;
  resolvedImportPath: string;
  confidence: "import-resolved";
  props: CallSiteProp[];
}

export interface RejectedCallSiteEvidence {
  filePath: string;
  importPath: string | null;
  localName: string;
  reason: "missing-import" | "unresolved-import" | "different-component";
  resolvedImportPath: string | null;
}

export interface CallSiteHarvestDiagnostics {
  rejectedSameNameCallSites: RejectedCallSiteEvidence[];
}

export interface CallSiteHarvestResult {
  evidence: CallSiteEvidence[];
  diagnostics: CallSiteHarvestDiagnostics;
}

export interface HarvestCallSitesOptions {
  projectRoot: string;
  componentPath: string;
  componentName: string;
  propNames: string[];
  maxFiles?: number;
}

function isSourceFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/u.test(filePath);
}

function isTestFile(filePath: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function isRelativeImportPath(importPath: string): boolean {
  return importPath.startsWith("./") || importPath.startsWith("../");
}

function normalizeAbsolutePath(filePath: string): string {
  // macOS resolves /var and /tmp through /private symlinks; strip the prefix so
  // resolved paths round-trip when compared against non-symlinked equivalents
  // (e.g. temp-dir test fixtures).
  return resolve(filePath)
    .replace(/\\/g, "/")
    .replace(/^\/private(?=\/(?:var|tmp)\/)/u, "");
}

function normalizeProjectPath(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replace(/\\/g, "/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function listProjectSourceFiles(
  projectRoot: string,
  maxFiles: number
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") && entry.name !== ".taro") {
          continue;
        }
        if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
          continue;
        }
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!isSourceFile(entryPath) || isTestFile(entryPath)) {
        continue;
      }
      results.push(entryPath);
    }
  }

  await walk(projectRoot);
  return results;
}

function isHandlerPropName(name: string): boolean {
  return /^(?:on|handle)[A-Z]/u.test(name);
}

function isBooleanPropName(name: string): boolean {
  return (
    /^(?:is|has|can|should|are|allow|disable|enable|loading|pending|open|active|visible|required|readonly|checked|selected|hidden|disabled)/iu.test(
      name
    ) || /(?:Disabled|Pending|Loading|Open|Active|Visible|Required|Readonly|Checked|Selected|Hidden)$/u.test(name)
  );
}

function safeDefaultForName(name: string): {
  expression: string;
  origin: CallSitePropOrigin;
} {
  if (isHandlerPropName(name)) {
    return { expression: "() => {}", origin: "handler" };
  }
  if (isBooleanPropName(name)) {
    return { expression: "false", origin: "boolean" };
  }
  return { expression: "undefined", origin: "unknown" };
}

function sourceSliceOf(source: string, node: t.Node): string | null {
  if (typeof node.start !== "number" || typeof node.end !== "number") {
    return null;
  }
  return source.slice(node.start, node.end);
}

function expressionFromAttributeValue(params: {
  attrName: string;
  attrValue: t.JSXAttribute["value"];
  source: string;
}): CallSiteProp {
  const { attrName, attrValue, source } = params;
  const fallback = safeDefaultForName(attrName);

  if (attrValue === null || attrValue === undefined) {
    return {
      name: attrName,
      expression: "true",
      rawExpression: null,
      origin: "boolean",
    };
  }

  if (t.isStringLiteral(attrValue)) {
    return {
      name: attrName,
      expression: `'${attrValue.value.replace(/'/gu, "\\'")}'`,
      rawExpression: sourceSliceOf(source, attrValue),
      origin: "literal",
    };
  }

  if (t.isJSXExpressionContainer(attrValue)) {
    const expr = attrValue.expression;
    const raw = sourceSliceOf(source, expr);

    if (t.isBooleanLiteral(expr)) {
      return {
        name: attrName,
        expression: expr.value ? "true" : "false",
        rawExpression: raw,
        origin: "boolean",
      };
    }

    if (t.isNumericLiteral(expr)) {
      return {
        name: attrName,
        expression: String(expr.value),
        rawExpression: raw,
        origin: "literal",
      };
    }

    if (t.isStringLiteral(expr)) {
      return {
        name: attrName,
        expression: `'${expr.value.replace(/'/gu, "\\'")}'`,
        rawExpression: raw,
        origin: "literal",
      };
    }

    if (t.isNullLiteral(expr)) {
      return {
        name: attrName,
        expression: "null",
        rawExpression: raw,
        origin: "literal",
      };
    }

    if (
      t.isArrowFunctionExpression(expr) ||
      t.isFunctionExpression(expr) ||
      (t.isIdentifier(expr) && isHandlerPropName(attrName))
    ) {
      return {
        name: attrName,
        expression: "() => {}",
        rawExpression: raw,
        origin: "handler",
      };
    }

    if (t.isIdentifier(expr)) {
      return {
        name: attrName,
        expression: fallback.expression,
        rawExpression: raw,
        origin: fallback.origin,
      };
    }

    return {
      name: attrName,
      expression: fallback.expression,
      rawExpression: raw,
      origin: fallback.origin,
    };
  }

  return {
    name: attrName,
    expression: fallback.expression,
    rawExpression: null,
    origin: fallback.origin,
  };
}

function collectCallSiteProps(params: {
  element: t.JSXOpeningElement;
  source: string;
}): CallSiteProp[] {
  const { element, source } = params;
  const props: CallSiteProp[] = [];
  for (const attribute of element.attributes) {
    if (!t.isJSXAttribute(attribute)) {
      continue;
    }
    if (!t.isJSXIdentifier(attribute.name)) {
      continue;
    }
    props.push(
      expressionFromAttributeValue({
        attrName: attribute.name.name,
        attrValue: attribute.value,
        source,
      })
    );
  }
  return props;
}

interface ResolvedComponentImport {
  importKind: "default" | "named";
  importedName: string;
  importPath: string;
  localName: string;
  resolvedImportPath: string;
}

interface CallSiteMatch {
  importBinding: ResolvedComponentImport;
  localName: string;
  props: CallSiteProp[];
}

function getImportCandidateBases(params: {
  importPath: string;
  importerFile: string;
  projectRoot: string;
}): string[] {
  const { importerFile, importPath, projectRoot } = params;
  if (isRelativeImportPath(importPath)) {
    return [resolve(dirname(importerFile), importPath)];
  }
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    const trimmed = importPath.slice(2);
    return [resolve(projectRoot, "src", trimmed), resolve(projectRoot, trimmed)];
  }

  return [];
}

async function resolveImportPath(params: {
  importPath: string;
  importerFile: string;
  projectRoot: string;
}): Promise<string | null> {
  const candidates = new Set<string>();
  for (const base of getImportCandidateBases(params)) {
    candidates.add(base);
    for (const extension of RESOLVABLE_EXTENSIONS) {
      candidates.add(`${base}${extension}`);
      candidates.add(join(base, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function buildComponentImportBindings(params: {
  ast: t.File;
  componentName: string;
  componentPath: string;
  importerFile: string;
  projectRoot: string;
}): Promise<{
  componentImports: Map<string, ResolvedComponentImport>;
  sameNameImports: Map<string, ResolvedComponentImport | null>;
}> {
  const componentImports = new Map<string, ResolvedComponentImport>();
  const sameNameImports = new Map<string, ResolvedComponentImport | null>();
  const normalizedComponentPath = normalizeAbsolutePath(params.componentPath);

  for (const node of params.ast.program.body) {
    if (!t.isImportDeclaration(node)) {
      continue;
    }

    const importPath = node.source.value;
    const resolvedImportPath = await resolveImportPath({
      importPath,
      importerFile: params.importerFile,
      projectRoot: params.projectRoot,
    });
    const normalizedResolvedImportPath = resolvedImportPath
      ? normalizeAbsolutePath(resolvedImportPath)
      : null;
    const matchesTarget =
      normalizedResolvedImportPath !== null &&
      normalizedResolvedImportPath === normalizedComponentPath;

    for (const specifier of node.specifiers) {
      let binding: ResolvedComponentImport | null = null;
      if (t.isImportDefaultSpecifier(specifier)) {
        binding = resolvedImportPath
          ? {
              importKind: "default",
              importedName: "default",
              importPath,
              localName: specifier.local.name,
              resolvedImportPath,
            }
          : null;
      } else if (t.isImportSpecifier(specifier)) {
        const importedName = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value;
        binding = resolvedImportPath
          ? {
              importKind: "named",
              importedName,
              importPath,
              localName: specifier.local.name,
              resolvedImportPath,
            }
          : null;
      }

      if (!binding) {
        if (
          t.isImportDefaultSpecifier(specifier) &&
          specifier.local.name === params.componentName
        ) {
          sameNameImports.set(specifier.local.name, null);
        } else if (t.isImportSpecifier(specifier)) {
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          if (
            importedName === params.componentName ||
            specifier.local.name === params.componentName
          ) {
            sameNameImports.set(specifier.local.name, null);
          }
        }
        continue;
      }

      if (
        binding.localName === params.componentName ||
        binding.importedName === params.componentName
      ) {
        sameNameImports.set(binding.localName, binding);
      }

      if (!matchesTarget) {
        continue;
      }

      if (
        binding.importKind === "default" ||
        binding.importedName === params.componentName
      ) {
        componentImports.set(binding.localName, binding);
      }
    }
  }

  return { componentImports, sameNameImports };
}

function findCallSitesInFile(params: {
  ast: t.File;
  componentImports: Map<string, ResolvedComponentImport>;
  componentName: string;
  source: string;
}): { matches: CallSiteMatch[]; rejected: RejectedCallSiteEvidence[] } {
  const matches: CallSiteMatch[] = [];
  const rejected: RejectedCallSiteEvidence[] = [];
  const seenRejected = new Set<string>();
  function visit(node: t.Node | null | undefined): void {
    if (!node || typeof node !== "object") {
      return;
    }
    if (t.isJSXOpeningElement(node)) {
      const tagName = getJsxName(node.name);
      const importBinding = tagName
        ? params.componentImports.get(tagName)
        : undefined;
      if (tagName && importBinding) {
        matches.push({
          importBinding,
          localName: tagName,
          props: collectCallSiteProps({ element: node, source: params.source }),
        });
      } else if (tagName === params.componentName) {
        const key = `${tagName}:${node.start ?? rejected.length}`;
        if (!seenRejected.has(key)) {
          seenRejected.add(key);
          rejected.push({
            filePath: "",
            importPath: null,
            localName: tagName,
            reason: "missing-import",
            resolvedImportPath: null,
          });
        }
      }
    }
    for (const key of Object.keys(node)) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) {
            visit(item as t.Node);
          }
        }
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value as t.Node);
      }
    }
  }
  visit(params.ast);
  return { matches, rejected };
}

function countConcreteProps(props: CallSiteProp[]): number {
  return props.filter((prop) => prop.origin !== "unknown").length;
}

function countCommonPathSegments(left: string, right: string): number {
  const leftSegments = left.split(/[\\/]+/u);
  const rightSegments = right.split(/[\\/]+/u);
  let count = 0;
  const max = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < max; index += 1) {
    if (leftSegments[index] !== rightSegments[index]) {
      break;
    }
    count += 1;
  }
  return count;
}

function sortEvidence(
  evidence: CallSiteEvidence[],
  componentPath: string,
  projectRoot: string
): CallSiteEvidence[] {
  const componentDir = dirname(normalizeProjectPath(projectRoot, componentPath));

  return evidence.sort((left, right) => {
    const leftPrefix = countCommonPathSegments(
      dirname(left.filePath),
      componentDir
    );
    const rightPrefix = countCommonPathSegments(
      dirname(right.filePath),
      componentDir
    );
    if (leftPrefix !== rightPrefix) {
      return rightPrefix - leftPrefix;
    }

    const concreteDelta =
      countConcreteProps(right.props) - countConcreteProps(left.props);
    if (concreteDelta !== 0) {
      return concreteDelta;
    }

    return left.filePath.localeCompare(right.filePath);
  });
}

function withDiagnostics(
  evidence: CallSiteEvidence[],
  diagnostics: CallSiteHarvestDiagnostics
): CallSiteHarvestResult {
  return { diagnostics, evidence };
}

export async function harvestComponentCallSites(
  options: HarvestCallSitesOptions
): Promise<CallSiteHarvestResult> {
  const {
    projectRoot,
    componentPath,
    componentName,
    maxFiles = DEFAULT_MAX_FILES,
  } = options;

  const files = await listProjectSourceFiles(projectRoot, maxFiles);
  const evidence: CallSiteEvidence[] = [];
  const rejectedSameNameCallSites: RejectedCallSiteEvidence[] = [];

  for (const file of files) {
    if (normalizeAbsolutePath(file) === normalizeAbsolutePath(componentPath)) {
      continue;
    }

    let source: string;
    try {
      source = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    let ast: t.File;
    try {
      ast = babelParser.parse(source, {
        sourceType: "module",
        plugins: AST_PLUGINS,
      });
    } catch {
      continue;
    }

    const { componentImports, sameNameImports } =
      await buildComponentImportBindings({
        ast,
        componentName,
        componentPath,
        importerFile: file,
        projectRoot,
      });
    const matches = findCallSitesInFile({
      ast,
      componentImports,
      componentName,
      source,
    });
    for (const rejected of matches.rejected) {
      const sameNameImport = sameNameImports.get(rejected.localName);
      rejectedSameNameCallSites.push({
        filePath: normalizeProjectPath(projectRoot, file),
        importPath: sameNameImport?.importPath ?? null,
        localName: rejected.localName,
        reason:
          sameNameImport === undefined
            ? "missing-import"
            : sameNameImport === null
              ? "unresolved-import"
              : "different-component",
        resolvedImportPath: sameNameImport?.resolvedImportPath
          ? normalizeProjectPath(projectRoot, sameNameImport.resolvedImportPath)
          : null,
      });
    }

    if (matches.matches.length === 0) {
      continue;
    }

    for (const match of matches.matches) {
      evidence.push({
        filePath: normalizeProjectPath(projectRoot, file),
        localName: match.localName,
        componentName,
        importKind: match.importBinding.importKind,
        importedName: match.importBinding.importedName,
        resolvedImportPath: normalizeProjectPath(
          projectRoot,
          match.importBinding.resolvedImportPath
        ),
        confidence: "import-resolved",
        props: match.props,
      });
    }
  }

  return withDiagnostics(sortEvidence(evidence, componentPath, projectRoot), {
    rejectedSameNameCallSites,
  });
}
