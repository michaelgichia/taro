/**
 * Pre-write audit for test files - validates structure before file creation
 */


import { evaluateQualityGates } from '#scorer/quality-gates.ts';

export interface AuditResult {
  valid: boolean;
  blocking: string[];
  warnings: string[];
  qualityScore?: {
    overall: number;
    criteria: {
      structure: number;
      queries: number;
      matchers: number;
      noFragility: number;
    };
    issues: Array<{
      type: string;
      severity: string;
      message: string;
      suggestion?: string;
    }>;
    passed: boolean;
  };
}

/**
 * Run pre-write audit on test code before file creation
 * @param code The test code to audit
 * @returns AuditResult with blocking issues and warnings
 */
export function preWriteAudit(code: string): AuditResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  // Run quality gates first for detailed analysis
  const qualityResult = evaluateQualityGates(code);
  
  // Extract blocking issues from quality gates (errors only)
  const qualityErrors = qualityResult.issues.filter(i => i.severity === 'error');
  const qualityWarnings = qualityResult.issues.filter(i => i.severity === 'warning');

  // Add quality gate errors as blocking issues
  for (const error of qualityErrors) {
    blocking.push(error.message);
  }

  // Add quality gate warnings as warnings
  for (const warning of qualityWarnings) {
    warnings.push(warning.message);
  }

  // Additional structural checks beyond quality gates
  const structuralChecks = performStructuralChecks(code);
  blocking.push(...structuralChecks.blocking);
  warnings.push(...structuralChecks.warnings);

  // Determine if valid (no blocking issues)
  const valid = blocking.length === 0;

  return {
    valid,
    blocking,
    warnings,
    qualityScore: valid ? {
      overall: qualityResult.overall,
      criteria: qualityResult.criteria,
      issues: qualityResult.issues.map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        suggestion: i.suggestion
      })),
      passed: qualityResult.passed
    } : undefined
  };
}

/**
 * Perform additional structural validation checks
 */
function performStructuralChecks(code: string): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];

  // Check for required imports
  const hasTestingLibrary = /@testing-library\/react/.test(code);
  const hasDescribe = /import\s+.*\bdescribe\b/.test(code) || code.includes("describe('") || code.includes('describe("');
  const hasIt = /\bit\(|\btest\(/.test(code);
  const hasExpect = /\bexpect\(/.test(code);

  // Blocking: Missing essential imports
  if (!hasTestingLibrary && !code.includes('render(')) {
    blocking.push('Missing @testing-library/react import or render() call');
  }

  // Blocking: No test structure
  if (!hasDescribe) {
    blocking.push('Missing describe block - tests must be organized in describe()');
  }

  // Blocking: No test cases
  if (!hasIt) {
    blocking.push('Missing test case - need it() or test() blocks');
  }

  // Blocking: No assertions
  if (!hasExpect) {
    blocking.push('Missing expect statements - tests must have assertions');
  }

  // Warnings: Check for fragile queries
  const fragileQueryPatterns = [
    { pattern: /getByTestId|queryByTestId|findByTestId/, message: 'Using getByTestId - consider semantic queries' },
    { pattern: /querySelector/, message: 'Using querySelector - consider Testing Library queries' }
  ];

  for (const { pattern, message } of fragileQueryPatterns) {
    if (pattern.test(code)) {
      warnings.push(message);
    }
  }

  // Warnings: Missing common matchers
  const hasCommonMatchers = /toBe|toEqual|toContain|toHaveLength|toBeTruthy|toBeFalsy/.test(code);
  if (hasExpect && !hasCommonMatchers) {
    warnings.push('Consider using more specific matchers (toBe, toEqual, toContain)');
  }

  // Warnings: Check for async without findBy
  const hasAsync = code.includes('async') || code.includes('await');
  const hasFindBy = /findBy/.test(code);
  if (hasAsync && !hasFindBy) {
    warnings.push('Async operations detected - consider using findBy* queries for async elements');
  }

  return { blocking, warnings };
}

export type { QueryRules,StructureRules } from '#scorer/quality-gates.ts';
