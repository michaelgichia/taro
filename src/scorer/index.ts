/**
 * Main scorer module - orchestrates test quality evaluation
 */

import { writeFileSync, existsSync } from 'fs';
import { evaluateQualityGates } from './quality-gates.ts';
import { preWriteAudit, AuditResult } from './pre-audit.ts';
import { postWriteVerification, VerificationResult } from './post-verify.ts';
import { QualityScore, ScoringResult } from './types.ts';

export interface Recording {
  id: string;
  name: string;
  steps: Array<{
    action: string;
    selector?: string;
    value?: string;
  }>;
}

export interface OrchestrateOptions {
  recording: Recording;
  outputPath: string;
  generateTest: (recording: Recording) => string;
}

export interface OrchestrateResult {
  success: boolean;
  outputPath?: string;
  audit?: AuditResult;
  verification?: VerificationResult;
  score?: QualityScore;
  error?: string;
}

/**
 * Score a test file or code string
 */
export function scoreTest(code: string): ScoringResult {
  const score = evaluateQualityGates(code);
  
  return {
    score,
    code,
    timestamp: Date.now()
  };
}

/**
 * Orchestrate test generation with pre/post validation
 * @param options Recording and generation options
 * @returns Complete result with audit, verification, and scoring
 */
export function orchestrateWithScoring(options: OrchestrateOptions): OrchestrateResult {
  const { recording, outputPath, generateTest } = options;
  
  // Step 1: Generate test code
  let testCode: string;
  try {
    testCode = generateTest(recording);
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate test: ${(error as Error).message}`
    };
  }
  
  // Step 2: Pre-write audit
  const audit = preWriteAudit(testCode);
  
  // If blocking issues, don't write the file
  if (!audit.valid) {
    return {
      success: false,
      audit,
      error: 'Pre-write audit failed: ' + audit.blocking.join('; ')
    };
  }
  
  // Step 3: Write the file
  try {
    writeFileSync(outputPath, testCode, 'utf-8');
  } catch (error) {
    return {
      success: false,
      audit,
      error: `Failed to write test file: ${(error as Error).message}`
    };
  }
  
  // Step 4: Post-write verification
  const verification = postWriteVerification(outputPath);
  
  // If verification has errors, consider it a failure
  if (!verification.valid) {
    return {
      success: false,
      audit,
      verification,
      error: 'Post-write verification failed: ' + verification.errors.join('; ')
    };
  }
  
  // Step 5: Calculate quality score (get full QualityScore from evaluateQualityGates)
  const score = evaluateQualityGates(testCode);
  
  return {
    success: true,
    outputPath,
    audit,
    verification,
    score
  };
}

export { QualityScore, QualityIssue, QualityCriteria } from './types.ts';
export { evaluateQualityGates } from './quality-gates.ts';
export { preWriteAudit, AuditResult } from './pre-audit.ts';
export { postWriteVerification, VerificationResult } from './post-verify.ts';
