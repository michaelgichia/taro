/**
 * Convention Learning Module
 * 
 * Analyzes existing test patterns to derive Taro's conventions.
 * Implements CNV-01: Taro derives conventions from observation.
 */

import { extractConventions } from './analyzer.js';
import {
  TestConvention,
  ConventionKey,
  createEmptyConvention
} from './types.js';

export type { TestConvention, ConventionKey };
export { createEmptyConvention };

/**
 * Learn conventions from test files in a directory
 * 
 * @param testDir - Directory containing test files to analyze
 * @returns TestConvention object with learned patterns
 */
export function learnConventions(testDir: string): TestConvention {
  return extractConventions(testDir);
}

/**
 * ConventionStore - stores and manages learned conventions
 */
export class ConventionStore {
  private conventions: Map<string, TestConvention> = new Map();
  
  /**
   * Add conventions for a specific context
   */
  add(key: string, convention: TestConvention): void {
    this.conventions.set(key, convention);
  }
  
  /**
   * Get conventions for a specific context
   */
  get(key: string): TestConvention | undefined {
    return this.conventions.get(key);
  }
  
  /**
   * Check if conventions exist for a context
   */
  has(key: string): boolean {
    return this.conventions.has(key);
  }
  
  /**
   * Get all stored conventions
   */
  getAll(): Map<string, TestConvention> {
    return new Map(this.conventions);
  }
  
  /**
   * Clear all stored conventions
   */
  clear(): void {
    this.conventions.clear();
  }
  
  /**
   * Merge multiple convention sets
   */
  merge(other: ConventionStore): TestConvention {
    const result = createEmptyConvention();
    
    for (const [, convention] of other.getAll()) {
      this.mergeInto(result, convention);
    }
    
    return result;
  }
  
  private mergeInto(target: TestConvention, source: TestConvention): void {
    // Merge naming
    if (source.naming.pattern !== target.naming.pattern) {
      // Keep target preference unless source has one
      if (target.naming.pattern === 'camelCase') {
        target.naming.pattern = source.naming.pattern;
      }
    }
    
    // Merge structure - OR logic
    target.structure.describePerComponent = 
      target.structure.describePerComponent || source.structure.describePerComponent;
    target.structure.helpersInDescribe = 
      target.structure.helpersInDescribe || source.structure.helpersInDescribe;
    
    // Merge queries - union
    const preferredSet = new Set([...target.queries.preferred, ...source.queries.preferred]);
    const avoidedSet = new Set([...target.queries.avoided, ...source.queries.avoided]);
    target.queries.preferred = Array.from(preferredSet);
    target.queries.avoided = Array.from(avoidedSet);
    
    // Merge matchers - union
    const matcherSet = new Set([...target.matchers.common, ...source.matchers.common]);
    target.matchers.common = Array.from(matcherSet);
    
    // Merge imports - union
    const importSet = new Set([...target.imports.common, ...source.imports.common]);
    target.imports.common = Array.from(importSet);
  }
}

export default {
  learnConventions,
  ConventionStore
};
