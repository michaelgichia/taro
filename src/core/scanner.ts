/**
 * Compatibility scanner surface.
 * Persistent convention learning now lives in .taro/state.json via src/core/state.ts.
 */

import { readFile } from "node:fs/promises";

import pc from "picocolors";

import { findTestFiles, readTestFiles } from "#core/convention-intelligence.ts";
import {
  findRepoFallbackPackageProfile,
  initTaroState,
  readTaroState,
  refreshTaroState,
  writeTaroState,
} from "#core/state.ts";
import { findReadableProjectStatePath } from "#project-state.ts";
import type { ConventionFile, ConventionsSchema } from "#types/conventions.ts";
import { DEFAULT_CONVENTIONS } from "#types/conventions.ts";
import type { TaroState } from "#types/state.ts";

export type { TestFileContent } from "#core/convention-intelligence.ts";
export { findTestFiles, readTestFiles };

function defaultConventions(projectRoot: string): ConventionsSchema {
  return {
    ...DEFAULT_CONVENTIONS,
    projectRoot,
    scannedAt: new Date().toISOString(),
  };
}

export async function readConventions(
  projectRoot: string
): Promise<ConventionsSchema | null> {
  const state = await readTaroState(projectRoot);
  if (!state) {
    const legacyPath = await findReadableProjectStatePath(
      projectRoot,
      "conventions.json"
    );
    if (!legacyPath) {
      return null;
    }

    try {
      return JSON.parse(
        await readFile(legacyPath, "utf-8")
      ) as ConventionsSchema;
    } catch {
      return null;
    }
  }

  return findRepoFallbackPackageProfile(state)?.conventions ?? null;
}

export async function scanConventions(
  projectRoot: string
): Promise<ConventionsSchema> {
  const { state, summary } = await initTaroState(projectRoot);
  if (summary.packageCount === 0) {
    process.stderr.write(
      pc.yellow("[taro] CTX: No test files found — using defaults") + "\n"
    );
    return defaultConventions(projectRoot);
  }

  return (
    findRepoFallbackPackageProfile(state)?.conventions ??
    defaultConventions(projectRoot)
  );
}

export async function persistConventions(
  projectRoot: string,
  conventions: ConventionsSchema
): Promise<void> {
  const state =
    (await readTaroState(projectRoot)) ??
    ({
      version: 2 as const,
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        taroVersion: "unknown",
      },
      packages: {},
      mockStore: { rootDir: null, importHint: null, resources: [] },
      generatedTests: [],
      gradedTests: [],
    } satisfies TaroState);

  state.packages["."] = {
    packagePath: ".",
    packageName: null,
    scannedAt: conventions.scannedAt || new Date().toISOString(),
    testFileCount: conventions.testFiles.length,
    conventions,
    importStyle: {
      value: conventions.importStyle,
      confidence: conventions.testFiles.length > 0 ? "high" : "low",
      evidence: conventions.testFiles.map((file) => file.path),
    },
    runner: {
      value: "unknown",
      confidence: "low",
      evidence: ["Persisted from compatibility scanner"],
    },
    jestDomSetup: {
      value: "per-test-import",
      confidence: "low",
      evidence: ["Persisted from compatibility scanner"],
    },
    mockPattern: {
      value: conventions.mockPattern,
      confidence: conventions.testFiles.length > 0 ? "high" : "low",
      evidence: conventions.testFiles.map((file) => file.path),
    },
    folderPattern: {
      value: conventions.folderPattern,
      confidence: conventions.folderPattern === "unknown" ? "low" : "high",
      evidence: conventions.testFiles.map((file) => file.path),
    },
    fileExtension: {
      value: conventions.fileExtension,
      confidence: conventions.fileExtension === "mixed" ? "medium" : "high",
      evidence: conventions.testFiles.map((file) => file.path),
    },
    renderHelpers: [],
    providerWrappers: [],
    renderTargets: [],
    repeatedMockTargets: [],
    sharedMockFactories: [],
    boundaryProfiles: [],
    boundaryExemplars: [],
    interactionContracts: [],
    inlineSafeMockTargets: [],
    mutationLifecycles: [],
    instabilityWarnings: [],
    mockRecommendations: [],
    fixtureRoots: [],
    exemplars: [],
    playwrightAuth: null,
    warnings: ["Persisted from compatibility conventions interface"],
  };
  state.meta.updatedAt = new Date().toISOString();
  await writeTaroState(projectRoot, state);
}

export async function mergeConventions(
  projectRoot: string,
  _newPatterns: ConventionFile
): Promise<void> {
  await refreshTaroState(projectRoot);
}
