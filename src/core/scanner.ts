/**
 * Compatibility scanner surface.
 * Persistent convention learning now lives in .taro/state.json via src/core/state.ts.
 */

import pc from 'picocolors'
import { readFile } from 'node:fs/promises'
import {
  analyzeSingleTestFile,
  analyzeTestFile,
  deriveConventions,
  discoverRepoRenderTargets,
  findTestFiles,
  readTestFiles,
} from './convention-intelligence.js'
import { findRepoFallbackPackageProfile, initTaroState, refreshTaroState, writeTaroState, readTaroState } from './state.js'
import { findReadableProjectStatePath } from '../project-state.js'
import { DEFAULT_CONVENTIONS } from '../types/conventions.js'
import type { ConventionFile, ConventionsSchema } from '../types/conventions.js'
import type { RepoRenderTargetCandidate } from '../types/state.js'

export type { RepoRenderTargetCandidate } from '../types/state.js'
export type { TestFileContent } from './convention-intelligence.js'
export {
  analyzeSingleTestFile,
  analyzeTestFile,
  deriveConventions,
  discoverRepoRenderTargets,
  findTestFiles,
  readTestFiles,
}

function defaultConventions(projectRoot: string): ConventionsSchema {
  return {
    ...DEFAULT_CONVENTIONS,
    projectRoot,
    scannedAt: new Date().toISOString(),
  }
}

export async function readConventions(projectRoot: string): Promise<ConventionsSchema | null> {
  const state = await readTaroState(projectRoot)
  if (!state) {
    const legacyPath = await findReadableProjectStatePath(projectRoot, 'conventions.json')
    if (!legacyPath) {
      return null
    }

    try {
      return JSON.parse(await readFile(legacyPath, 'utf-8')) as ConventionsSchema
    } catch {
      return null
    }
  }

  return findRepoFallbackPackageProfile(state)?.conventions ?? null
}

export async function scanConventions(projectRoot: string): Promise<ConventionsSchema> {
  const { state, summary } = await initTaroState(projectRoot)
  if (summary.packageCount === 0) {
    console.log(pc.yellow('[taro] CTX: No test files found — using defaults'))
    return defaultConventions(projectRoot)
  }

  return findRepoFallbackPackageProfile(state)?.conventions ?? defaultConventions(projectRoot)
}

export async function persistConventions(
  projectRoot: string,
  conventions: ConventionsSchema
): Promise<void> {
  const state = (await readTaroState(projectRoot)) ?? {
    version: 1 as const,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taroVersion: 'unknown',
    },
    packages: {},
    mockStore: {
      rootDir: null,
      importHint: null,
      resources: [],
    },
    generatedTests: [],
  }

  state.packages['.'] = {
    packagePath: '.',
    packageName: null,
    scannedAt: conventions.scannedAt || new Date().toISOString(),
    testFileCount: conventions.testFiles.length,
    conventions,
    importStyle: {
      value: conventions.importStyle,
      confidence: conventions.testFiles.length > 0 ? 'high' : 'low',
      evidence: conventions.testFiles.map((file) => file.path),
    },
    runner: {
      value: 'unknown',
      confidence: 'low',
      evidence: ['Persisted from compatibility scanner'],
    },
    mockPattern: {
      value: conventions.mockPattern,
      confidence: conventions.testFiles.length > 0 ? 'high' : 'low',
      evidence: conventions.testFiles.map((file) => file.path),
    },
    folderPattern: {
      value: conventions.folderPattern,
      confidence: conventions.folderPattern === 'unknown' ? 'low' : 'high',
      evidence: conventions.testFiles.map((file) => file.path),
    },
    fileExtension: {
      value: conventions.fileExtension,
      confidence: conventions.fileExtension === 'mixed' ? 'medium' : 'high',
      evidence: conventions.testFiles.map((file) => file.path),
    },
    renderHelpers: [],
    providerWrappers: [],
    renderTargets: [],
    repeatedMockTargets: [],
    sharedMockFactories: [],
    boundaryProfiles: [],
    boundaryExemplars: [],
    inlineSafeMockTargets: [],
    mutationLifecycles: [],
    instabilityWarnings: [],
    mockRecommendations: [],
    fixtureRoots: [],
    exemplars: [],
    playwrightAuth: null,
    warnings: ['Persisted from compatibility conventions interface'],
  }
  state.meta.updatedAt = new Date().toISOString()
  await writeTaroState(projectRoot, state)
}

export async function mergeConventions(
  projectRoot: string,
  _newPatterns: ConventionFile
): Promise<void> {
  await refreshTaroState(projectRoot)
}
