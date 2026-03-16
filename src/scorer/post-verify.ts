/**
 * Post-write verification for test files - validates file after creation
 */

import { parse } from '@typescript-eslint/typescript-estree';
import { existsSync, readFileSync } from 'fs';

import { detectRepoContractIssues } from '#core/repo-contracts.ts';

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  filePath: string;
  parsed?: boolean;
}

interface ASTNode {
  type: string;
  body?: ASTNode | ASTNode[];
  sourceType?: string;
  [key: string]: unknown;
}

/**
 * Run post-write verification on a test file
 * @param filePath Path to the test file to verify
 * @returns VerificationResult with errors and warnings
 */
export function postWriteVerification(filePath: string): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if file exists
  if (!existsSync(filePath)) {
    errors.push(`File does not exist: ${filePath}`);
    return {
      valid: false,
      errors,
      warnings,
      filePath,
      parsed: false
    };
  }

  // Read file content
  let code: string;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch (error) {
    errors.push(`Failed to read file: ${(error as Error).message}`);
    return {
      valid: false,
      errors,
      warnings,
      filePath,
      parsed: false
    };
  }

  // Check for valid TypeScript syntax
  try {
    parse(code, { 
      loc: true, 
      range: true,
      jsx: true,
      ecmaVersion: 2020,
      sourceType: 'module'
    }) as unknown as ASTNode;
  } catch (parseError) {
    const errorMessage = (parseError as Error).message;
    // Extract line number if available
    const lineMatch = errorMessage.match(/line (\d+)/i);
    const lineInfo = lineMatch ? ` at line ${lineMatch[1]}` : '';
    errors.push(`Syntax parse error${lineInfo}: ${errorMessage}`);
    return {
      valid: false,
      errors,
      warnings,
      filePath,
      parsed: false
    };
  }

  // Check for required imports
  const importChecks = checkRequiredImports(code);
  errors.push(...importChecks.errors);
  warnings.push(...importChecks.warnings);

  // Check for common issues
  const commonChecks = checkCommonIssues(code);
  warnings.push(...commonChecks.warnings);

  // Determine if valid (no errors)
  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    filePath,
    parsed: true
  };
}

/**
 * Check for required imports
 */
function checkRequiredImports(code: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for @testing-library/react import
  const hasTestingLibrary = /import\s+.*from\s+['"]@testing-library\/react['"]/.test(code);
  if (!hasTestingLibrary) {
    errors.push('Missing required import: @testing-library/react');
  }

  // Check for test framework imports (describe, it/test, expect)
  const hasDescribeImport = /import\s+.*\bdescribe\b/.test(code);
  const hasItImport = /import\s+.*\b(it|test)\b/.test(code);
  const hasExpectImport = /import\s+.*\bexpect\b/.test(code);

  // Check for inline imports or global usage
  const hasDescribeUsage = code.includes('describe(');
  const hasItUsage = code.includes('it(') || code.includes('test(');
  const hasExpectUsage = code.includes('expect(');

  // Check if using vitest globals (no import needed)
  const usesVitestGlobals = code.includes('/// <reference types="vitest" />') || 
                            /"vitest\/globals"/.test(code);

  if (!hasDescribeImport && !usesVitestGlobals && !hasDescribeUsage) {
    warnings.push('No describe import detected - ensure describe is available globally or imported');
  }

  if (!hasItImport && !usesVitestGlobals && !hasItUsage) {
    warnings.push('No it/test import detected - ensure test functions are available globally or imported');
  }

  if (!hasExpectImport && !usesVitestGlobals && !hasExpectUsage) {
    warnings.push('No expect import detected - ensure expect is available globally or imported');
  }

  // Check for render function (required for React Testing Library)
  const hasRender = /render\(/.test(code);
  if (!hasRender) {
    warnings.push('No render() call detected - tests should use Testing Library render');
  }

  return { errors, warnings };
}

/**
 * Check for common issues in test files
 */
function checkCommonIssues(code: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for screen.debug() - useful for debugging but should not be in production tests
  if (/screen\.debug\(/.test(code)) {
    warnings.push('screen.debug() found - remove before committing to production');
  }

  // Check for skipped tests
  const skippedTests = code.match(/\b(it|test)\.skip\s*\(/g);
  if (skippedTests) {
    warnings.push(`Found ${skippedTests.length} skipped test(s) - consider removing .skip or adding reason`);
  }

  // Check for only tests
  const onlyTests = code.match(/\b(it|test)\.only\s*\(/g);
  if (onlyTests) {
    warnings.push(`Found ${onlyTests.length} .only test(s) - remove .only before committing`);
  }

  // Check for console.log in tests
  const consoleLogs = code.match(/console\.log\s*\(/g);
  if (consoleLogs) {
    warnings.push(`Found ${consoleLogs.length} console.log statement(s) - consider removing for cleaner test output`);
  }

  // Check for empty test blocks
  const emptyTests = code.match(/it\s*\(\s*['"][^'"]+['"]\s*,\s*\(\s*\)\s*=>\s*\{\s*\}/g);
  if (emptyTests) {
    errors.push(`Found ${emptyTests.length} empty test block(s) - add test implementation or remove`);
  }

  // Check for TODO comments in tests
  const todoComments = code.match(/\/\/\s*TODO|\/\*\s*TODO/i);
  if (todoComments) {
    warnings.push('Found TODO comment(s) - ensure tests are complete before finishing');
  }

  warnings.push(...detectRepoContractIssues(code).map((issue) => issue.message))

  return { errors, warnings };
}
