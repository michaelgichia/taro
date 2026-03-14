/**
 * Quality gates evaluation using AST-based analysis
 */

import { parse } from '@typescript-eslint/typescript-estree';
import { QualityScore, QualityCriteria, QualityIssue } from './types.js';

interface ASTNode {
  type: string;
  body?: ASTNode | ASTNode[];
  expression?: ASTNode;
  callee?: ASTNode;
  arguments?: ASTNode[];
  properties?: ASTNode[];
  [key: string]: unknown;
}

interface ParsedAST {
  type: string;
  body: ASTNode[];
}

/**
 * Evaluate quality gates on test code
 */
export function evaluateQualityGates(code: string): QualityScore {
  const issues: QualityIssue[] = [];
  
  let ast: ParsedAST;
  try {
    ast = parse(code, { 
      loc: true, 
      range: true,
      jsx: true,
      ecmaVersion: 2020,
      sourceType: 'module'
    }) as unknown as ParsedAST;
  } catch (error) {
    issues.push({
      type: 'structure',
      severity: 'error',
      message: 'Failed to parse code - syntax error',
      suggestion: 'Check for valid TypeScript/JavaScript syntax'
    });
    return {
      overall: 0,
      criteria: { structure: 0, queries: 0, matchers: 0, noFragility: 0 },
      issues,
      passed: false
    };
  }

  // Evaluate each criterion
  const structure = evaluateStructure(ast, issues);
  const queries = evaluateQueries(code, ast, issues);
  const matchers = evaluateMatchers(code, ast, issues);
  const noFragility = evaluateNoFragility(code, ast, issues);

  // Calculate weighted overall score
  const overall = Math.round(
    structure * 0.25 +
    queries * 0.25 +
    matchers * 0.30 +
    noFragility * 0.20
  );

  return {
    overall,
    criteria: { structure, queries, matchers, noFragility },
    issues,
    passed: overall >= 50 // Minimum threshold to pass
  };
}

/**
 * Evaluate test structure (describe/it blocks)
 */
function evaluateStructure(ast: ParsedAST, issues: QualityIssue[]): number {
  let hasDescribe = false;
  let hasTest = false;

  function traverse(node: ASTNode | undefined) {
    if (!node) return;
    
    if (node.type === 'CallExpression' && node.callee) {
      const calleeName = getCalleeName(node.callee);
      if (calleeName === 'describe') hasDescribe = true;
      if (calleeName === 'it' || calleeName === 'test') hasTest = true;
    }
    
    // Recursively traverse children
    if (Array.isArray(node.body)) {
      node.body.forEach(traverse);
    } else if (node.body && typeof node.body === 'object') {
      traverse(node.body as ASTNode);
    }
    // Also traverse function expression and arrow function bodies
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      if (node.body) {
        if (Array.isArray(node.body)) {
          node.body.forEach(traverse);
        } else if (typeof node.body === 'object') {
          traverse(node.body as ASTNode);
        }
      }
    }
    if (node.arguments) {
      node.arguments.forEach(arg => traverse(arg as ASTNode));
    }
    // Traverse expression for chaining like expect(x).toBe()
    if (node.expression) {
      traverse(node.expression);
    }
  }

  traverse(ast as unknown as ASTNode);

  if (!hasDescribe) {
    issues.push({
      type: 'structure',
      severity: 'error',
      message: 'Missing describe block',
      suggestion: 'Wrap tests in describe() to organize test cases'
    });
  }

  if (!hasTest) {
    issues.push({
      type: 'structure',
      severity: 'error',
      message: 'Missing test case (it/test)',
      suggestion: 'Add it() or test() blocks for test cases'
    });
  }

  // Score: 50 for having describe, +50 for having test block
  return (hasDescribe ? 50 : 0) + (hasTest ? 50 : 0);
}

/**
 * Evaluate query robustness
 */
function evaluateQueries(code: string, ast: ParsedAST, issues: QualityIssue[]): number {
  const robustQueries = ['getByRole', 'getByLabelText', 'getByText', 'findByRole', 'findByLabelText', 'queryByRole', 'getByPlaceholderText'];
  const fragileQueries = ['querySelector', 'getByTestId', 'queryByTestId'];

  let robustCount = 0;
  let fragileCount = 0;

  // Check for query methods in code
  robustQueries.forEach(q => {
    if (code.includes(q)) robustCount++;
  });
  fragileQueries.forEach(q => {
    if (code.includes(q)) fragileCount++;
  });

  if (fragileCount > 0 && robustCount === 0) {
    issues.push({
      type: 'queries',
      severity: 'warning',
      message: 'Using fragile queries (getByTestId, querySelector)',
      suggestion: 'Prefer getByRole, getByLabelText, getByText for accessibility'
    });
  }

  if (robustCount > 0) {
    return Math.min(100, 50 + (robustCount * 10));
  }
  
  return fragileCount > 0 ? 30 : 50;
}

/**
 * Evaluate assertion matchers
 */
function evaluateMatchers(code: string, ast: ParsedAST, issues: QualityIssue[]): number {
  let expectCount = 0;
  let matcherCount = 0;

  function traverse(node: ASTNode | undefined) {
    if (!node) return;

    // Check for expect() calls - look for CallExpression where callee starts with 'expect'
    if (node.type === 'CallExpression' && node.callee) {
      const calleeSource = getCalleeSource(node.callee);
      if (calleeSource && calleeSource.startsWith('expect')) {
        expectCount++;
        // Check if has arguments
        if (node.arguments && node.arguments.length > 0) {
          matcherCount++;
        }
      }
    }

    // Check for common matchers in chained calls like expect(x).toBe(y)
    const matcherNames = ['toBe', 'toEqual', 'toContain', 'toHaveLength', 'toBeTruthy', 'toBeFalsy', 'toBeInTheDocument', 'toBeVisible', 'toHaveTextContent'];
    if (node.type === 'MemberExpression' && node.property) {
      const prop = node.property as ASTNode;
      const propName = typeof prop.name === 'string' ? prop.name : '';
      if (matcherNames.includes(propName)) {
        matcherCount++;
      }
    }

    // Recursively traverse all node types
    if (Array.isArray(node.body)) {
      node.body.forEach(traverse);
    } else if (node.body && typeof node.body === 'object') {
      traverse(node.body as ASTNode);
    }
    // Handle function expressions and arrow functions
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      if (node.body) {
        if (Array.isArray(node.body)) {
          node.body.forEach(traverse);
        } else if (typeof node.body === 'object') {
          traverse(node.body as ASTNode);
        }
      }
    }
    if (node.arguments) {
      node.arguments.forEach(arg => traverse(arg as ASTNode));
    }
    if (node.expression) {
      traverse(node.expression);
    }
    // Handle object properties
    if (node.properties) {
      node.properties.forEach((prop: ASTNode) => traverse(prop));
    }
  }

  traverse(ast as unknown as ASTNode);

  if (expectCount === 0) {
    issues.push({
      type: 'matchers',
      severity: 'error',
      message: 'No expect statements found',
      suggestion: 'Add assertions using expect() with matchers like toBe(), toEqual()'
    });
    return 0;
  }

  if (/\bexpect\s*\(\s*(?:await\s+)?(?:screen|within\([^)]*\)|[a-zA-Z_$][\w$]*\.(?:getBy|findBy|queryBy))/m.test(code) &&
      /\.toBeDefined\s*\(\s*\)/.test(code)) {
    issues.push({
      type: 'matchers',
      severity: 'warning',
      message: 'RTL query results are wrapped in .toBeDefined()',
      suggestion: 'Let the query throw or use .toBeInTheDocument() for explicit DOM assertions'
    });
    matcherCount = Math.max(0, matcherCount - 1);
  }

  if (/toHaveBeenCalledWith\s*\([\s\S]*expect\.(?:any|anything)\s*\(/.test(code)) {
    issues.push({
      type: 'matchers',
      severity: 'warning',
      message: 'Mutation payload assertions use loose expect.any/expect.anything matchers',
      suggestion: 'Assert exact payload values for fields the test explicitly typed or selected'
    });
    matcherCount = Math.max(0, matcherCount - 1);
  }

  if (/waitFor\s*\(/.test(code) &&
      /toHaveBeenCalledTimes\(/.test(code) &&
      /toHaveBeenCalledWith\(/.test(code)) {
    issues.push({
      type: 'matchers',
      severity: 'warning',
      message: 'Mock call count and payload assertions are split across an async boundary',
      suggestion: 'Keep both assertions inside the same waitFor callback'
    });
    matcherCount = Math.max(0, matcherCount - 1);
  }

  if (matcherCount < expectCount) {
    return Math.min(100, 50 + (matcherCount * 15));
  }

  return Math.min(100, 50 + (expectCount * 10));
}

/**
 * Evaluate fragility - avoid CSS selectors and test IDs as primary queries
 */
function evaluateNoFragility(code: string, ast: ParsedAST, issues: QualityIssue[]): number {
  // Check for CSS selectors - but avoid false positives from method calls
  // More careful patterns that exclude method chains like getByRole, queryByText
  const cssSelectors = [
    /(?:^|[^.\w])#[a-zA-Z][\w-]*/,           // ID selectors (#button) - not preceded by word char
    /\[[\w-]+=["'][^"']*["']\]/,              // attribute selectors [data-testid="x"]
    /document\.querySelector/,
    /document\.getElementBy/
  ];

  // Also check for standalone class selectors that are not part of method chains
  const classSelectorRegex = /(?<![a-zA-Z])\.[a-zA-Z][\w-]*(?![a-zA-Z(])/g;
  
  let cssSelectorCount = 0;
  cssSelectors.forEach(regex => {
    const matches = code.match(regex);
    if (matches) cssSelectorCount += matches.length;
  });
  
  // Check for class selectors separately
  const classMatches = code.match(classSelectorRegex);
  if (classMatches) cssSelectorCount += classMatches.length;

  // Check for test IDs (data-testid)
  const testIdRegex = /data-testid=["']([^"']+)["']/g;
  const testIdMatches = code.match(testIdRegex);
  const testIdCount = testIdMatches ? testIdMatches.length : 0;

  if (cssSelectorCount > 0) {
    issues.push({
      type: 'fragility',
      severity: 'warning',
      message: `Found ${cssSelectorCount} CSS selector(s) - fragile to style changes`,
      suggestion: 'Use semantic queries like getByRole for better resilience'
    });
  }

  if (testIdCount > 0) {
    issues.push({
      type: 'fragility',
      severity: 'info',
      message: `Found ${testIdCount} test ID(s) - acceptable but not ideal`,
      suggestion: 'Prefer semantic queries when possible'
    });
  }

  if (/(?:const|function)\s+(?:setup|plan[A-Z]\w*|open[A-Z]\w*|prepare[A-Z]\w*|render[A-Z]\w*)[\s\S]{0,1200}?\bexpect\s*\(/.test(code)) {
    issues.push({
      type: 'fragility',
      severity: 'warning',
      message: 'Setup helper contains assertions',
      suggestion: 'Keep expect() calls in the test body so failures point to the broken contract'
    });
  }

  if (
    /const\s+\w+\s*=\s*\{[\s\S]*?\bbeforeEach\s*\([\s\S]*?\b\w+\.\w+\s*=/.test(code) ||
    /vi\.hoisted\s*\(\s*\(\)\s*=>[\s\S]*?(?::\s*(?:false|true|null|"|'|\d)|(?:outcome|control|state|shouldFail)\s*:)/.test(code)
  ) {
    issues.push({
      type: 'fragility',
      severity: 'warning',
      message: 'Shared mutable state is controlling mock behavior',
      suggestion:
        'Hoist plain vi.fn() mocks, keep vi.mock factories shape-only, set a default mockImplementation in beforeEach, and override per-test with a complete mockImplementation'
    });
  }

  if (/afterEach\s*\([\s\S]*cleanup\s*\(/.test(code) && /afterEach\s*\([\s\S]*document\.body\./.test(code)) {
    issues.push({
      type: 'fragility',
      severity: 'warning',
      message: 'Teardown compensates for leaked document.body side effects',
      suggestion: 'Fix the leak in the component or portal implementation instead of patching every test'
    });
  }

  if (/(?:getByText|findByText|queryByText)\s*\(\s*\/.*\/[gimsuy]*\s*[),]/.test(code)) {
    issues.push({
      type: 'fragility',
      severity: 'info',
      message: 'Regex text matcher detected for rendered output',
      suggestion: 'Prefer exact text assertions unless the pattern itself is under test'
    });
  }

  // Score based on absence of fragile patterns
  let score = 100;
  if (cssSelectorCount > 0) score -= 30;
  else if (testIdCount > 0) score -= 20;
  const penalties = issues.filter((issue) => issue.type === 'fragility').length;
  score -= penalties * 10;
  return Math.max(20, score);
}

/**
 * Get the full source of a callee including chained calls (e.g., "expect", "expect().toBe")
 */
function getCalleeSource(callee: ASTNode): string {
  if (callee.type === 'Identifier') {
    return (callee.name as string) || '';
  }
  if (callee.type === 'MemberExpression' && callee.object) {
    // For chained calls like expect().toBe(), get the object part first
    const objectSource = getCalleeSource(callee.object as ASTNode);
    const prop = callee.property as ASTNode;
    const propName = typeof prop.name === 'string' ? prop.name : '';
    return objectSource ? `${objectSource}.${propName}` : propName;
  }
  if (callee.type === 'CallExpression' && callee.callee) {
    return getCalleeSource(callee.callee);
  }
  return '';
}

/**
 * Get the name of a callee (handles nested calls like expect().toBe)
 */
function getCalleeName(callee: ASTNode): string {
  if (callee.type === 'Identifier') {
    return (callee.name as string) || '';
  }
  if (callee.type === 'MemberExpression' && callee.property) {
    const prop = callee.property as ASTNode;
    return typeof prop.name === 'string' ? prop.name : '';
  }
  if (callee.type === 'CallExpression' && callee.callee) {
    return getCalleeName(callee.callee);
  }
  return '';
}

export interface StructureRules {
  requireDescribe: boolean;
  requireTest: boolean;
}

export interface QueryRules {
  preferRobust: boolean;
  disallowTestId: boolean;
}
