/**
 * Convention Learning Module
 *
 * Analyzes existing test patterns to derive Taro's conventions.
 * Implements CNV-01: Taro derives conventions from observation.
 * Implements CNV-02: Conventions persist across runs via SQLite storage.
 * Implements CNV-03: Faster subsequent runs via caching.
 */

import * as fs from "fs";
import * as path from "path";
import { findReadableProjectStatePathSync } from "../project-state.js";
import { extractConventions } from "./analyzer.js";
import { ConventionStore, createStore } from "./storage.js";
import {
  TestConvention,
  ConventionKey,
  createEmptyConvention,
} from "./types.js";

export type { TestConvention, ConventionKey };
export { createEmptyConvention, ConventionStore, createStore };

/**
 * Find test directories in a project
 * @param projectRoot - Root directory to search
 * @returns Array of test directory paths
 */
function findTestDirectories(projectRoot: string): string[] {
  const candidates = [
    path.join(projectRoot, "src", "__tests__"),
    path.join(projectRoot, "tests"),
    path.join(projectRoot, "test"),
    path.join(projectRoot, "__tests__"),
  ];

  return candidates.filter(
    (dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()
  );
}

/**
 * Find all test files in a project (recursive)
 * @param projectRoot - Root directory to search
 * @returns Array of test file paths
 */
function findTestFiles(projectRoot: string): string[] {
  const testFiles: string[] = [];

  function searchDir(dir: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          searchDir(fullPath);
        }
      } else if (entry.isFile()) {
        // Match test files: *.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx
        if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          testFiles.push(fullPath);
        }
      }
    }
  }

  // Search in src and root
  const searchRoots = [projectRoot];
  const srcDir = path.join(projectRoot, "src");
  if (fs.existsSync(srcDir)) {
    searchRoots.push(srcDir);
  }

  for (const root of searchRoots) {
    searchDir(root);
  }

  return testFiles;
}

/**
 * Learn conventions from test files in a project
 *
 * @param projectRoot - Root directory of the project
 * @returns TestConvention object with learned patterns
 */
export function learnConventions(projectRoot: string): TestConvention {
  // Find test directories
  const testDirs = findTestDirectories(projectRoot);

  // Find individual test files
  const testFiles = findTestFiles(projectRoot);

  let conventions = createEmptyConvention();

  // Extract from test directories
  if (testDirs.length > 0) {
    for (const testDir of testDirs) {
      const dirConventions = extractConventions(testDir);
      conventions = mergeConventions(conventions, dirConventions);
    }
  }

  // Extract from individual test files
  if (testFiles.length > 0) {
    // Create a temporary directory for single-file analysis
    for (const testFile of testFiles) {
      const fileConventions = extractSingleFileConventions(testFile);
      conventions = mergeConventions(conventions, fileConventions);
    }
  }

  // Save to storage for persistence
  try {
    const store = createStore(projectRoot);
    store.saveConventions(conventions);
    store.close();
  } catch (error) {
    console.warn("[learnConventions] Failed to save conventions:", error);
  }

  return conventions;
}

/**
 * Extract conventions from a single test file
 */
function extractSingleFileConventions(filePath: string): TestConvention {
  return extractConventions(path.dirname(filePath));
}

/**
 * Merge two TestConvention objects
 */
function mergeConventions(
  a: TestConvention,
  b: TestConvention
): TestConvention {
  const result = { ...a };

  // Merge naming - prefer non-default values
  if (
    b.naming.pattern !== "camelCase" &&
    b.naming.pattern !== a.naming.pattern
  ) {
    result.naming.pattern = b.naming.pattern;
  }
  if (
    b.naming.describePrefix &&
    b.naming.describePrefix !== a.naming.describePrefix
  ) {
    result.naming.describePrefix = b.naming.describePrefix;
  }
  if (b.naming.itTemplate !== "should {description}") {
    result.naming.itTemplate = b.naming.itTemplate;
  }

  // Merge structure - OR logic
  result.structure.describePerComponent =
    result.structure.describePerComponent || b.structure.describePerComponent;
  result.structure.helpersInDescribe =
    result.structure.helpersInDescribe || b.structure.helpersInDescribe;

  // Merge queries - union
  const preferredSet = new Set([
    ...result.queries.preferred,
    ...b.queries.preferred,
  ]);
  const avoidedSet = new Set([...result.queries.avoided, ...b.queries.avoided]);
  result.queries.preferred = Array.from(preferredSet);
  result.queries.avoided = Array.from(avoidedSet);

  // Merge matchers - union
  const matcherSet = new Set([...result.matchers.common, ...b.matchers.common]);
  result.matchers.common = Array.from(matcherSet);

  // Merge imports - union
  const importSet = new Set([...result.imports.common, ...b.imports.common]);
  result.imports.common = Array.from(importSet);

  return result;
}

/**
 * Get conventions from persistent storage
 *
 * @param projectRoot - Root directory of the project
 * @returns TestConvention if stored conventions exist, null otherwise
 */
export function getConventions(projectRoot: string): TestConvention | null {
  try {
    const dbPath = findReadableProjectStatePathSync(
      projectRoot,
      "conventions.db"
    );

    // Check if database exists
    if (!dbPath || !fs.existsSync(dbPath)) {
      return null;
    }

    const store = new ConventionStore(dbPath);
    store.init();

    const conventions = store.loadConventions();
    store.close();

    return conventions;
  } catch (error) {
    console.warn("[getConventions] Failed to load conventions:", error);
    return null;
  }
}

/**
 * ConventionStore - stores and manages learned conventions (in-memory)
 */
export class InMemoryConventionStore {
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
  merge(other: InMemoryConventionStore): TestConvention {
    const result = createEmptyConvention();

    for (const [, convention] of Array.from(other.getAll())) {
      this.mergeInto(result, convention);
    }

    return result;
  }

  private mergeInto(target: TestConvention, source: TestConvention): void {
    // Merge naming
    if (source.naming.pattern !== target.naming.pattern) {
      // Keep target preference unless source has one
      if (target.naming.pattern === "camelCase") {
        target.naming.pattern = source.naming.pattern;
      }
    }

    // Merge structure - OR logic
    target.structure.describePerComponent =
      target.structure.describePerComponent ||
      source.structure.describePerComponent;
    target.structure.helpersInDescribe =
      target.structure.helpersInDescribe || source.structure.helpersInDescribe;

    // Merge queries - union
    const preferredSet = new Set([
      ...target.queries.preferred,
      ...source.queries.preferred,
    ]);
    const avoidedSet = new Set([
      ...target.queries.avoided,
      ...source.queries.avoided,
    ]);
    target.queries.preferred = Array.from(preferredSet);
    target.queries.avoided = Array.from(avoidedSet);

    // Merge matchers - union
    const matcherSet = new Set([
      ...target.matchers.common,
      ...source.matchers.common,
    ]);
    target.matchers.common = Array.from(matcherSet);

    // Merge imports - union
    const importSet = new Set([
      ...target.imports.common,
      ...source.imports.common,
    ]);
    target.imports.common = Array.from(importSet);
  }
}

export default {
  learnConventions,
  getConventions,
  ConventionStore,
  InMemoryConventionStore,
  createStore,
};
