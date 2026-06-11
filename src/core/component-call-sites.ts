import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

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
  componentName: string;
  props: CallSiteProp[];
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

function findCallSitesInFile(params: {
  ast: t.File;
  componentName: string;
  source: string;
}): CallSiteProp[][] {
  const matches: CallSiteProp[][] = [];
  function visit(node: t.Node | null | undefined): void {
    if (!node || typeof node !== "object") {
      return;
    }
    if (t.isJSXOpeningElement(node)) {
      const tagName = getJsxName(node.name);
      if (tagName === params.componentName) {
        matches.push(
          collectCallSiteProps({ element: node, source: params.source })
        );
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
  return matches;
}

export async function harvestComponentCallSites(
  options: HarvestCallSitesOptions
): Promise<CallSiteEvidence[]> {
  const {
    projectRoot,
    componentPath,
    componentName,
    maxFiles = DEFAULT_MAX_FILES,
  } = options;

  const files = await listProjectSourceFiles(projectRoot, maxFiles);
  const evidence: CallSiteEvidence[] = [];

  for (const file of files) {
    if (file === componentPath) {
      continue;
    }

    let source: string;
    try {
      source = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    if (!source.includes(componentName)) {
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

    const matches = findCallSitesInFile({ ast, componentName, source });
    if (matches.length === 0) {
      continue;
    }

    evidence.push({
      filePath: relative(projectRoot, file),
      componentName,
      props: matches[0],
    });
  }

  return evidence;
}
