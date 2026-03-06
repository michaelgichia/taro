/**
 * Main scorer module - orchestrates test quality evaluation
 */

import { evaluateQualityGates } from './quality-gates.js';
import { QualityScore, ScoringResult } from './types.js';

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

export { QualityScore, QualityIssue, QualityCriteria } from './types.js';
export { evaluateQualityGates } from './quality-gates.js';
