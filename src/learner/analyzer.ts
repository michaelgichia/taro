/**
 * Convention analyzer - extracts patterns from test files using AST analysis
 */

import { parse } from "@typescript-eslint/typescript-estree";
import * as fs from "fs";
import * as path from "path";

import { getEstreeCalleeName as getCalleeName } from "#estree-utils.ts";
import {
  createEmptyConvention,
  ImportConventions,
  MatcherConventions,
  NamingConventions,
  NamingPattern,
  QueryPreferences,
  StructureConventions,
  TestConvention,
} from "#learner/types.ts";

interface ASTNode {
  type: string;
  name?: string;
  value?: string;
  body?: ASTNode | ASTNode[];
  expression?: ASTNode;
  callee?: ASTNode;
  arguments?: ASTNode[];
  properties?: ASTNode[];
  source?: ASTNode;
  specifiers?: ASTNode[];
  imports?: string[];
  [key: string]: unknown;
}

interface ParsedAST {
  type: string;
  body: ASTNode[];
}

/**
 * Analyze a single test file and extract conventions
 */
export function analyzeTestFile(filePath: string): Partial<TestConvention> {
  const code = fs.readFileSync(filePath, "utf-8");

  let ast: ParsedAST;
  try {
    ast = parse(code, {
      loc: true,
      range: true,
      jsx: true,
      ecmaVersion: 2020,
      sourceType: "module",
    }) as unknown as ParsedAST;
  } catch (error) {
    console.warn(`Failed to parse ${filePath}:`, error);
    return {};
  }

  const naming = extractNamingPatterns(code, ast);
  const queries = extractQueryPreferences(code);
  const matchers = extractMatcherPatterns(ast);
  const imports = extractImports(ast);
  const structure = extractStructurePatterns(code, ast);

  return { naming, structure, queries, matchers, imports };
}

/**
 * Extract naming patterns from describe blocks
 */
function extractNamingPatterns(
  code: string,
  ast: ParsedAST
): NamingConventions {
  const describeNames: string[] = [];
  const itNames: string[] = [];

  function traverse(node: ASTNode | undefined) {
    if (!node) return;

    if (node.type === "CallExpression" && node.callee) {
      const calleeName = getCalleeName(node.callee);
      if (calleeName === "describe" && node.arguments && node.arguments[0]) {
        const firstArg = node.arguments[0];
        if (firstArg.type === "Literal" || firstArg.type === "StringLiteral") {
          describeNames.push(String(firstArg.value || ""));
        }
      }
      if (
        (calleeName === "it" || calleeName === "test") &&
        node.arguments &&
        node.arguments[0]
      ) {
        const firstArg = node.arguments[0];
        if (firstArg.type === "Literal" || firstArg.type === "StringLiteral") {
          itNames.push(String(firstArg.value || ""));
        }
      }
    }

    traverseArray(node.body);
    traverseArray(node.arguments);
    traverseArray(node.expression);
  }

  function traverseArray(arr: ASTNode | ASTNode[] | undefined) {
    if (Array.isArray(arr)) {
      arr.forEach(traverse);
    } else if (arr && typeof arr === "object") {
      traverse(arr);
    }
  }

  traverse(ast as unknown as ASTNode);

  // Detect naming pattern from describe names
  const pattern = detectNamingPattern(describeNames);
  const describePrefix = extractDescribePrefix(describeNames);
  const itTemplate = extractItTemplate(itNames);

  return { pattern, describePrefix, itTemplate };
}

/**
 * Detect naming pattern (camelCase, kebab-case, snake_case)
 */
function detectNamingPattern(names: string[]): NamingPattern {
  if (names.length === 0) return "camelCase";

  const sample = names[0];

  // Check for kebab-case (has hyphens but not underscores)
  if (sample.includes("-") && !sample.includes("_")) {
    return "kebab-case";
  }

  // Check for snake_case (has underscores)
  if (sample.includes("_") && !sample.includes("-")) {
    return "snake_case";
  }

  // Check for camelCase (has uppercase letters)
  if (/[a-z][A-Z]/.test(sample)) {
    return "camelCase";
  }

  return "camelCase";
}

/**
 * Extract common describe block prefix
 */
function extractDescribePrefix(names: string[]): string {
  if (names.length === 0) return "";

  // Find common prefix among all describe names
  const sorted = [...names].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  let prefix = "";
  for (let i = 0; i < first.length; i++) {
    if (first[i] === last[i]) {
      prefix += first[i];
    } else {
      break;
    }
  }

  // Clean up prefix (remove trailing separators)
  return prefix.replace(/[-_ ]+$/, "");
}

/**
 * Extract test template from 'it' descriptions
 */
function extractItTemplate(names: string[]): string {
  if (names.length === 0) return "should {description}";

  // Look for common patterns like "should do X", "does Y", "renders Z"
  const patterns = [
    "should",
    "does",
    "renders",
    "shows",
    "displays",
    "returns",
  ];

  for (const name of names) {
    for (const pattern of patterns) {
      if (name.toLowerCase().startsWith(pattern)) {
        const remainder = name.slice(pattern.length).trim();
        if (remainder) {
          return `${pattern} {description}`;
        }
      }
    }
  }

  return "should {description}";
}

/**
 * Extract query preferences from code
 */
function extractQueryPreferences(code: string): QueryPreferences {
  const robustQueries = [
    "getByRole",
    "getByLabelText",
    "getByText",
    "getByPlaceholderText",
    "getByAltText",
    "getByTitle",
    "findByRole",
    "findByLabelText",
    "findByText",
    "queryByRole",
    "queryByLabelText",
  ];

  const fragileQueries = [
    "querySelector",
    "getByTestId",
    "queryByTestId",
    "findByTestId",
  ];

  const preferred: string[] = [];
  const avoided: string[] = [];

  robustQueries.forEach((q) => {
    if (code.includes(q)) preferred.push(q);
  });

  fragileQueries.forEach((q) => {
    if (code.includes(q)) avoided.push(q);
  });

  return { preferred, avoided };
}

/**
 * Extract matcher patterns from AST
 */
function extractMatcherPatterns(ast: ParsedAST): MatcherConventions {
  const commonMatchers = new Set<string>();
  const matcherNames = [
    "toBe",
    "toEqual",
    "toContain",
    "toHaveLength",
    "toBeTruthy",
    "toBeFalsy",
    "toBeInTheDocument",
    "toBeVisible",
    "toHaveTextContent",
    "toHaveValue",
    "toHaveBeenCalled",
    "toHaveBeenCalledWith",
    "toBeDisabled",
    "toBeEnabled",
    "toBeChecked",
    "toBeRequired",
    "not.toBe",
    "not.toEqual",
    "not.toContain",
  ];

  function traverse(node: ASTNode | undefined) {
    if (!node) return;

    // Check for member expressions like expect(x).toBe(y)
    if (node.type === "MemberExpression" && node.property) {
      const prop = node.property as ASTNode;
      const propName = typeof prop.name === "string" ? prop.name : "";

      // Handle "not.toBe" pattern
      if (propName === "not" && node.object) {
        const obj = node.object as ASTNode;
        if (obj.type === "MemberExpression" && obj.property) {
          const innerProp = obj.property as ASTNode;
          const innerName =
            typeof innerProp.name === "string" ? innerProp.name : "";
          if (matcherNames.includes(`not.${innerName}`)) {
            commonMatchers.add(`not.${innerName}`);
          }
        }
      } else if (matcherNames.includes(propName)) {
        commonMatchers.add(propName);
      }
    }

    traverseArray(node.body);
    traverseArray(node.arguments);
    traverseArray(node.expression);
  }

  function traverseArray(arr: ASTNode | ASTNode[] | undefined) {
    if (Array.isArray(arr)) {
      arr.forEach(traverse);
    } else if (arr && typeof arr === "object") {
      traverse(arr);
    }
  }

  traverse(ast as unknown as ASTNode);

  return { common: Array.from(commonMatchers) };
}

/**
 * Extract import statements from AST
 */
function extractImports(ast: ParsedAST): ImportConventions {
  const commonImports = new Set<string>();

  function traverse(node: ASTNode | undefined) {
    if (!node) return;

    if (node.type === "ImportDeclaration" && node.source) {
      const source = node.source as ASTNode;
      const sourceValue = source.value as string;

      if (sourceValue) {
        // Extract package name (before any / or @)
        const packageName = sourceValue.startsWith("@")
          ? sourceValue.split("/").slice(0, 2).join("/")
          : sourceValue.split("/")[0];

        if (!packageName.startsWith(".") && !packageName.startsWith("/")) {
          commonImports.add(packageName);
        }
      }
    }

    traverseArray(node.body);
    traverseArray(node.arguments);
  }

  function traverseArray(arr: ASTNode | ASTNode[] | undefined) {
    if (Array.isArray(arr)) {
      arr.forEach(traverse);
    } else if (arr && typeof arr === "object") {
      traverse(arr);
    }
  }

  traverse(ast as unknown as ASTNode);

  return { common: Array.from(commonImports) };
}

/**
 * Extract structure patterns
 */
function extractStructurePatterns(
  code: string,
  ast: ParsedAST
): StructureConventions {
  let hasDescribePerComponent = false;
  let hasHelpersInDescribe = false;
  let setupLocation: "inside-describe" | "outside-describe" | "beforeeach" =
    "inside-describe";

  const describeBlocks: ASTNode[] = [];
  const helperFunctions = new Set<string>();
  const setupCalls = new Set<string>();

  function traverse(node: ASTNode | undefined, inDescribe = false) {
    if (!node) return;

    if (node.type === "CallExpression" && node.callee) {
      const calleeName = getCalleeName(node.callee);

      if (calleeName === "describe") {
        describeBlocks.push(node);
        hasDescribePerComponent = true;

        // Check what's inside the describe
        if (node.arguments && node.arguments[1]) {
          const body = node.arguments[1];
          traverse(body, true);
        }
      }

      if (
        calleeName === "beforeEach" ||
        calleeName === "beforeAll" ||
        calleeName === "afterEach" ||
        calleeName === "afterAll"
      ) {
        setupCalls.add(calleeName);
        if (!inDescribe) {
          setupLocation = "outside-describe";
        } else {
          setupLocation = "beforeeach";
        }
      }

      if (calleeName === "it" || calleeName === "test") {
        if (inDescribe) {
          setupLocation = "inside-describe";
        }
      }
    }

    // Detect helper functions (functions defined at top level)
    if (node.type === "FunctionDeclaration" && node.name && !inDescribe) {
      helperFunctions.add(node.name as string);
    }

    traverseArray(node.body, inDescribe);
    traverseArray(node.arguments, inDescribe);
  }

  function traverseArray(
    arr: ASTNode | ASTNode[] | undefined,
    inDescribe: boolean
  ) {
    if (Array.isArray(arr)) {
      arr.forEach((n) => traverse(n, inDescribe));
    } else if (arr && typeof arr === "object") {
      traverse(arr, inDescribe);
    }
  }

  traverse(ast as unknown as ASTNode);

  hasHelpersInDescribe = describeBlocks.length > 0 && helperFunctions.size > 0;

  return {
    describePerComponent: hasDescribePerComponent,
    helpersInDescribe: hasHelpersInDescribe,
    setupLocation,
  };
}

/**
 * Extract conventions from all test files in a directory
 */
export function extractConventions(testDir: string): TestConvention {
  const convention = createEmptyConvention();

  // Find all test files
  const testFiles = findTestFiles(testDir);

  if (testFiles.length === 0) {
    console.warn(`No test files found in ${testDir}`);
    return convention;
  }

  // Analyze each test file
  const partials = testFiles.map((file) => analyzeTestFile(file));

  // Merge conventions from all files
  return mergeConventions(partials);
}

/**
 * Find all test files in directory
 */
function findTestFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.isFile()) {
      // Match *.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx
      if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Merge conventions from multiple files
 */
function mergeConventions(partials: Partial<TestConvention>[]): TestConvention {
  const result = createEmptyConvention();

  // Merge naming - take most common pattern
  const patternCounts: Record<string, number> = {};
  const prefixCounts: Record<string, number> = {};

  for (const partial of partials) {
    if (partial.naming) {
      if (partial.naming.pattern) {
        patternCounts[partial.naming.pattern] =
          (patternCounts[partial.naming.pattern] || 0) + 1;
      }
      if (partial.naming.describePrefix) {
        prefixCounts[partial.naming.describePrefix] =
          (prefixCounts[partial.naming.describePrefix] || 0) + 1;
      }
      if (
        partial.naming.itTemplate &&
        partial.naming.itTemplate !== "should {description}"
      ) {
        result.naming.itTemplate = partial.naming.itTemplate;
      }
    }
  }

  // Find most common pattern
  let maxCount = 0;
  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (count > maxCount) {
      maxCount = count;
      result.naming.pattern = pattern as NamingPattern;
    }
  }

  // Find most common prefix
  maxCount = 0;
  for (const [prefix, count] of Object.entries(prefixCounts)) {
    if (count > maxCount) {
      maxCount = count;
      result.naming.describePrefix = prefix;
    }
  }

  // Merge structure - OR logic (if any file has it, set to true)
  for (const partial of partials) {
    if (partial.structure) {
      if (partial.structure.describePerComponent) {
        result.structure.describePerComponent = true;
      }
      if (partial.structure.helpersInDescribe) {
        result.structure.helpersInDescribe = true;
      }
      if (partial.structure.setupLocation === "beforeeach") {
        result.structure.setupLocation = "beforeeach";
      }
    }
  }

  // Merge queries - combine all preferred and avoided
  const preferredSet = new Set<string>();
  const avoidedSet = new Set<string>();

  for (const partial of partials) {
    if (partial.queries) {
      partial.queries.preferred?.forEach((q) => preferredSet.add(q));
      partial.queries.avoided?.forEach((q) => avoidedSet.add(q));
    }
  }

  result.queries.preferred = Array.from(preferredSet);
  result.queries.avoided = Array.from(avoidedSet);

  // Merge matchers - combine all common matchers
  const matcherSet = new Set<string>();
  for (const partial of partials) {
    if (partial.matchers) {
      partial.matchers.common?.forEach((m) => matcherSet.add(m));
    }
  }
  result.matchers.common = Array.from(matcherSet);

  // Merge imports - combine all common imports
  const importSet = new Set<string>();
  for (const partial of partials) {
    if (partial.imports) {
      partial.imports.common?.forEach((i) => importSet.add(i));
    }
  }
  result.imports.common = Array.from(importSet);

  return result;
}
