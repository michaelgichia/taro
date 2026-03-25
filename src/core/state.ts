import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import pc from "picocolors";
import { createActor } from "xstate";

import {
  buildBoundaryTeachingProfile,
  classifyBoundaryKind,
  collectBoundaryLearning,
  getBoundaryGuardrailReason,
} from "#core/boundary-learning.ts";
import {
  analyzeTestFile,
  deriveConventions,
  extractRenderTargetCandidatesFromFile,
  readTestFiles,
  type TestFileContent,
} from "#core/convention-intelligence.ts";
import { createStateActors } from "#core/state.actors.ts";
import {
  FIXTURE_DIR_NAMES,
  JEST_DOM_IMPORT_REGEX,
  LOAD_OR_BOOTSTRAP_STATE_FAILURE_MESSAGE,
  MAX_EVIDENCE,
  MAX_FIXTURE_ROOTS,
  PLAYWRIGHT_AUTH_DIRS,
  PLAYWRIGHT_CONFIG_FILES,
  PLAYWRIGHT_STORAGE_STATE_REGEX,
  SCAN_STATE_FAILURE_MESSAGE,
  SKIP_DIRS,
  STATE_VERSION,
  TEST_CONFIG_FILE_REGEX,
} from "#core/state.constants.ts";
import {
  createLoadOrBootstrapStateMachine,
  createScanStateMachine,
} from "#core/state.machine.ts";
import type {
  GeneratedTestQualityIndex,
  TaroPackageProfileStaleness,
} from "#core/state.types.ts";
import {
  analyzeMutationLifecycleInFiles,
  buildExistingStateResult,
  buildGeneratedTestQualityIndex,
  buildStateSummaryMarkdown,
  buildSummaryFromPackages,
  buildSummaryPackages,
  calculateGeneratedTestQualityWeight,
  collectFixtureRootsFromImports,
  collectProviderWrappers,
  collectRenderHelpers,
  collectSharedMockFactories,
  collectStateSourceInsights,
  createInitialLoadOrBootstrapStateMachineContext,
  createInitialScanStateMachineContext,
  createPlaywrightAuthProfile,
  deriveInteractionContracts,
  deriveLegacyPackageProfile,
  deriveMockRecommendations,
  detectMockInstabilityInFiles,
  emptyState,
  extractSetupFileEntriesFromConfig,
  extractSetupFileEntriesFromPackageJson,
  findBestPackageProfile,
  findNearestPackageDescriptor,
  getRelativeFileQualityWeight,
  getTestConfigRoots,
  inferFileExtension,
  inferWeightedFileExtension,
  inferWeightedFolderPattern,
  inferWeightedImportStyle,
  inferWeightedMockPattern,
  migrateLegacyHistory,
  normalizeConventionPaths,
  normalizePackageKey,
  resolveConfiguredPath,
  resolveExistingPackageProfile,
  scanMockTargetsInFiles,
  shouldRefreshStateFromGeneratedHistory,
  summarizePackageScoreLearning,
  toConfidence,
  trimGeneratedTestHistory,
  waitForMachineCompletion,
} from "#core/state.utils.ts";
import {
  safeParseTaroOverrides,
  safeParseTaroState,
} from "#core/state.validation.ts";
import type {
  LoadedLegacyStateResult,
  PackageDescriptor,
  ReadOverridesDiagnostics,
  ReadStateDiagnostics,
  ScanStateOptions,
  ScanStateResult,
} from "#core/state-runtime-types.ts";
import {
  ensureProjectStateDir,
  findReadableProjectStatePath,
  getProjectStatePath,
} from "#project-state.ts";
import type {
  ConventionsSchema,
  InteractionContractKind,
} from "#types/conventions.ts";
import type { ScoreResult } from "#types/score.ts";
import type {
  ResolvedTaroPackageProfile,
  TaroBoundaryGuardrailReason,
  TaroFixtureRootKind,
  TaroFixtureRootProfile,
  TaroJestDomSetup,
  TaroMockStoreResource,
  TaroOverrides,
  TaroPackageOverrides,
  TaroPackageProfile,
  TaroPlaywrightAuthDetectedAt,
  TaroPlaywrightAuthProfile,
  TaroSignal,
  TaroState,
  TaroStateSummary,
  TaroTestRunner,
} from "#types/state.ts";
import { TARO_VERSION } from "#version.ts";

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function findStorageStateFromConfig(
  projectRoot: string,
  configPath: string,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    return null;
  }

  const matches = [...content.matchAll(PLAYWRIGHT_STORAGE_STATE_REGEX)];
  for (const match of matches) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }

    const resolvedPath = resolve(dirname(configPath), candidate);
    if (await isReadableFile(resolvedPath)) {
      return createPlaywrightAuthProfile(projectRoot, resolvedPath, {
        detectedAt,
        source: "detected",
      });
    }
  }

  return null;
}

async function findStorageStateInDirectory(
  projectRoot: string,
  dirPath: string,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    return null;
  }

  return createPlaywrightAuthProfile(projectRoot, files[0]!, {
    detectedAt,
    source: "detected",
  });
}

async function detectPlaywrightAuthForPackage(
  projectRoot: string,
  descriptor: PackageDescriptor,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPlaywrightAuthProfile | null> {
  const roots =
    descriptor.key === "." ? [descriptor.root] : [descriptor.root, projectRoot];
  const seenConfigs = new Set<string>();
  const seenDirs = new Set<string>();

  for (const root of roots) {
    for (const fileName of PLAYWRIGHT_CONFIG_FILES) {
      const configPath = join(root, fileName);
      if (seenConfigs.has(configPath)) {
        continue;
      }
      seenConfigs.add(configPath);

      const configProfile = await findStorageStateFromConfig(
        projectRoot,
        configPath,
        detectedAt
      );
      if (configProfile) {
        return configProfile;
      }
    }
  }

  for (const root of roots) {
    for (const dirName of PLAYWRIGHT_AUTH_DIRS) {
      const authDir = join(root, dirName);
      if (seenDirs.has(authDir)) {
        continue;
      }
      seenDirs.add(authDir);

      const dirProfile = await findStorageStateInDirectory(
        projectRoot,
        authDir,
        detectedAt
      );
      if (dirProfile) {
        return dirProfile;
      }
    }
  }

  return null;
}

async function canUsePersistedPlaywrightAuth(
  projectRoot: string,
  auth: TaroPlaywrightAuthProfile | null | undefined
): Promise<boolean> {
  if (!auth) {
    return false;
  }

  return isReadableFile(resolve(projectRoot, auth.path));
}

async function collectFixtureDirs(
  projectRoot: string
): Promise<TaroFixtureRootProfile[]> {
  const found = new Map<string, TaroFixtureRootProfile>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (found.size >= MAX_FIXTURE_ROOTS || depth > 6) {
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      const relativePath = relative(projectRoot, fullPath).replace(/\\/g, "/");

      if ((FIXTURE_DIR_NAMES as readonly string[]).includes(entry.name)) {
        found.set(relativePath, {
          path: relativePath,
          kind: entry.name as TaroFixtureRootKind,
          source: "directory",
        });
      }

      await walk(fullPath, depth + 1);
    }
  }

  await walk(projectRoot, 0);
  return [...found.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

async function readPackageName(packageRoot: string): Promise<string | null> {
  const packageJsonPath = join(packageRoot, "package.json");
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    const parsed = JSON.parse(content) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

async function hasConfigFile(
  packageRoot: string,
  prefix: string
): Promise<boolean> {
  try {
    const entries = await readdir(packageRoot);
    return entries.some((entry) => entry.startsWith(prefix));
  } catch {
    return false;
  }
}

async function listTestConfigFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root);
    return entries
      .filter((entry) => TEST_CONFIG_FILE_REGEX.test(entry))
      .sort()
      .map((entry) => join(root, entry));
  } catch {
    return [];
  }
}

async function collectConfiguredSetupFiles(
  projectRoot: string,
  packageRoot: string
): Promise<Map<string, string[]>> {
  const setupFiles = new Map<string, Set<string>>();

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    for (const configPath of await listTestConfigFiles(root)) {
      let content = "";
      try {
        content = await readFile(configPath, "utf-8");
      } catch {
        continue;
      }

      const sourcePath = relative(projectRoot, configPath).replace(/\\/g, "/");
      for (const entry of extractSetupFileEntriesFromConfig(content)) {
        const resolvedPath = resolveConfiguredPath(dirname(configPath), entry);
        const sources = setupFiles.get(resolvedPath) ?? new Set<string>();
        sources.add(sourcePath);
        setupFiles.set(resolvedPath, sources);
      }
    }

    const packageJsonPath = join(root, "package.json");
    try {
      const parsed = JSON.parse(
        await readFile(packageJsonPath, "utf-8")
      ) as unknown;
      const sourcePath = relative(projectRoot, packageJsonPath).replace(
        /\\/g,
        "/"
      );
      for (const entry of extractSetupFileEntriesFromPackageJson(parsed)) {
        const resolvedPath = resolveConfiguredPath(root, entry);
        const sources = setupFiles.get(resolvedPath) ?? new Set<string>();
        sources.add(sourcePath);
        setupFiles.set(resolvedPath, sources);
      }
    } catch {
      // Package metadata is optional for test setup detection.
    }
  }

  return new Map(
    [...setupFiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, sources]) => [path, [...sources].sort()])
  );
}

async function collectJestDomEvidenceFiles(
  projectRoot: string,
  packageRoot: string
): Promise<string[]> {
  const candidates = new Set<string>();

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    candidates.add(join(root, "package.json"));
    for (const configPath of await listTestConfigFiles(root)) {
      candidates.add(configPath);
    }
  }

  for (const setupFile of (
    await collectConfiguredSetupFiles(projectRoot, packageRoot)
  ).keys()) {
    candidates.add(setupFile);
  }

  return [...candidates];
}

async function detectJestDomSetup(
  projectRoot: string,
  descriptor: PackageDescriptor,
  testFiles: TestFileContent[],
  runner: TaroSignal<TaroTestRunner>
): Promise<TaroSignal<TaroJestDomSetup>> {
  const configuredSetupFiles = await collectConfiguredSetupFiles(
    projectRoot,
    descriptor.root
  );

  for (const [setupFile, sources] of configuredSetupFiles) {
    let content = "";
    try {
      content = await readFile(setupFile, "utf-8");
    } catch {
      continue;
    }

    if (!JEST_DOM_IMPORT_REGEX.test(content)) {
      continue;
    }

    const relativeSetupPath = relative(projectRoot, setupFile).replace(
      /\\/g,
      "/"
    );
    return {
      value: "global-setup",
      confidence: "high",
      evidence: [
        ...sources.map(
          (source) => `${source}: setupFiles -> ${relativeSetupPath}`
        ),
        `${relativeSetupPath}: imports @testing-library/jest-dom`,
      ].slice(0, MAX_EVIDENCE),
    };
  }

  const directImportFiles = testFiles.filter((file) =>
    JEST_DOM_IMPORT_REGEX.test(file.content)
  );
  if (directImportFiles.length > 0) {
    return {
      value: "per-test-import",
      confidence: "high",
      evidence: directImportFiles
        .map(
          (file) =>
            `${relative(projectRoot, file.path).replace(/\\/g, "/")}: imports @testing-library/jest-dom`
        )
        .slice(0, MAX_EVIDENCE),
    };
  }

  return {
    value: "per-test-import",
    confidence: runner.value === "unknown" ? "low" : "medium",
    evidence: [
      configuredSetupFiles.size > 0
        ? "Scanned configured test setup files without global jest-dom registration."
        : "No configured global jest-dom setup detected.",
    ],
  };
}

async function detectRunner(
  packageRoot: string,
  packageKey: string,
  testFiles: TestFileContent[]
): Promise<TaroSignal<TaroTestRunner>> {
  const evidence: string[] = [];
  let vitestWeight = 0;
  let jestWeight = 0;
  const packageJsonPath = join(packageRoot, "package.json");

  if (await hasConfigFile(packageRoot, "vitest.config.")) {
    vitestWeight += 4;
    evidence.push(`${packageKey}: vitest.config.* present`);
  }
  if (await hasConfigFile(packageRoot, "jest.config.")) {
    jestWeight += 4;
    evidence.push(`${packageKey}: jest.config.* present`);
  }

  try {
    const packageJson = JSON.parse(
      await readFile(packageJsonPath, "utf-8")
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyMap = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    if (
      dependencyMap.vitest ||
      Object.values(packageJson.scripts ?? {}).some((script) =>
        /vitest/.test(script)
      )
    ) {
      vitestWeight += 3;
      evidence.push(`${packageKey}: package.json references vitest`);
    }
    if (
      dependencyMap.jest ||
      Object.values(packageJson.scripts ?? {}).some((script) =>
        /\bjest\b/.test(script)
      )
    ) {
      jestWeight += 3;
      evidence.push(`${packageKey}: package.json references jest`);
    }
  } catch {
    // Package metadata is optional for runner detection.
  }

  const vitestFileHits = testFiles.filter(
    (file) =>
      /from\s+['"]vitest['"]/.test(file.content) || /\bvi\./.test(file.content)
  );
  const jestFileHits = testFiles.filter(
    (file) =>
      /from\s+['"]@jest\/globals['"]/.test(file.content) ||
      /from\s+['"]jest['"]/.test(file.content) ||
      /\bjest\./.test(file.content)
  );

  vitestWeight += vitestFileHits.length * 2;
  jestWeight += jestFileHits.length * 2;

  const winner: TaroTestRunner =
    vitestWeight === 0 && jestWeight === 0
      ? "unknown"
      : vitestWeight >= jestWeight
        ? "vitest"
        : "jest";
  const winningWeight =
    winner === "vitest" ? vitestWeight : winner === "jest" ? jestWeight : 0;
  const totalWeight = Math.max(vitestWeight + jestWeight, 1);
  const fileEvidence =
    winner === "vitest"
      ? vitestFileHits.map((file) =>
          relative(packageRoot, file.path).replace(/\\/g, "/")
        )
      : jestFileHits.map((file) =>
          relative(packageRoot, file.path).replace(/\\/g, "/")
        );

  return {
    value: winner,
    confidence:
      winner === "unknown" ? "low" : toConfidence(winningWeight / totalWeight),
    evidence: [...evidence, ...fileEvidence].slice(0, MAX_EVIDENCE),
  };
}

async function findPackageDescriptors(
  projectRoot: string
): Promise<PackageDescriptor[]> {
  const packages = new Map<string, PackageDescriptor>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== "package.json") {
        continue;
      }

      const packageRoot = dirname(fullPath);
      const key = normalizePackageKey(projectRoot, packageRoot);
      packages.set(key, {
        key,
        root: packageRoot,
        name: await readPackageName(packageRoot),
      });
    }
  }

  await walk(projectRoot);

  if (packages.size === 0) {
    packages.set(".", {
      key: ".",
      root: projectRoot,
      name: await readPackageName(projectRoot),
    });
  }

  return [...packages.values()].sort(
    (left, right) => right.root.length - left.root.length
  );
}

async function buildPackageProfile(
  projectRoot: string,
  descriptor: PackageDescriptor,
  files: TestFileContent[],
  existingState: TaroState | null,
  qualityIndex: GeneratedTestQualityIndex,
  detectedAt: TaroPlaywrightAuthDetectedAt
): Promise<TaroPackageProfile> {
  const scannedAt = new Date().toISOString();
  const analyzedFiles = await Promise.all(
    files.map((file) => analyzeTestFile(file.path))
  );
  const importStyle = inferWeightedImportStyle(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const mockPattern = inferWeightedMockPattern(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const folderPattern = inferWeightedFolderPattern(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const fileExtension = inferWeightedFileExtension(
    projectRoot,
    analyzedFiles,
    qualityIndex
  );
  const conventions = normalizeConventionPaths(projectRoot, {
    ...deriveConventions(analyzedFiles, descriptor.root),
    importStyle: importStyle.value,
    mockPattern: mockPattern.value,
    folderPattern: folderPattern.value,
    fileExtension: fileExtension.value,
  });
  const sourceInsights = collectStateSourceInsights(
    projectRoot,
    files,
    qualityIndex
  );
  const repeatedMockTargets = scanMockTargetsInFiles(
    projectRoot,
    files,
    qualityIndex
  );
  const mockRecommendations = deriveMockRecommendations(repeatedMockTargets);
  const renderHelpers = sourceInsights.renderHelpers;
  const providerWrappers = sourceInsights.providerWrappers;
  const fixtureRoots = [
    ...sourceInsights.fixtureRoots,
    ...(await collectFixtureDirs(descriptor.root)).map((root) => ({
      ...root,
      path:
        descriptor.key === "."
          ? root.path
          : `${descriptor.key}/${root.path}`.replace(/\/+/g, "/"),
    })),
  ]
    .filter(
      (root, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.path === root.path && candidate.kind === root.kind
        ) === index
    )
    .slice(0, MAX_FIXTURE_ROOTS);

  const warnings: string[] = [];
  const runner = await detectRunner(descriptor.root, descriptor.key, files);
  const jestDomSetup = await detectJestDomSetup(
    projectRoot,
    descriptor,
    files,
    runner
  );

  if (runner.value === "unknown") {
    warnings.push(
      "Runner could not be detected confidently from local tests/config."
    );
  }
  if (renderHelpers.length === 0) {
    warnings.push(
      "No shared render helper detected; generation may fall back to plain render()."
    );
  }

  const renderTargets = files
    .flatMap((file) => extractRenderTargetCandidatesFromFile(projectRoot, file))
    .sort((left, right) => {
      return (
        getRelativeFileQualityWeight(qualityIndex, right.sourceTestFile) -
          getRelativeFileQualityWeight(qualityIndex, left.sourceTestFile) ||
        left.sourceTestFile.localeCompare(right.sourceTestFile) ||
        left.symbol.localeCompare(right.symbol)
      );
    });
  const mutationLifecycles = analyzeMutationLifecycleInFiles(
    projectRoot,
    files
  );
  const instabilityWarnings = detectMockInstabilityInFiles(projectRoot, files);
  const boundaryLearning = await collectBoundaryLearning({
    projectRoot,
    testFiles: files,
    renderTargets,
    providerWrappers,
    mutationLifecycles,
    getFileWeight: (relativeFile) =>
      getRelativeFileQualityWeight(qualityIndex, relativeFile),
  });
  const interactionContracts = deriveInteractionContracts({
    mutationLifecycles,
    boundaryExemplars: boundaryLearning.exemplars,
  });
  const existingProfile = resolveExistingPackageProfile(
    existingState,
    descriptor.key
  );
  const detectedPlaywrightAuth = await detectPlaywrightAuthForPackage(
    projectRoot,
    descriptor,
    detectedAt
  );
  const preservedManualAuth =
    existingProfile?.playwrightAuth?.source === "manual" &&
    (await canUsePersistedPlaywrightAuth(
      projectRoot,
      existingProfile.playwrightAuth
    ))
      ? existingProfile.playwrightAuth
      : null;
  const playwrightAuth = preservedManualAuth ?? detectedPlaywrightAuth;

  return {
    packagePath: descriptor.key,
    packageName: descriptor.name,
    scannedAt,
    testFileCount: files.length,
    conventions,
    importStyle,
    runner,
    jestDomSetup,
    mockPattern,
    folderPattern,
    fileExtension,
    renderHelpers,
    providerWrappers,
    renderTargets,
    repeatedMockTargets: repeatedMockTargets.filter(
      (target) => target.count > 1
    ),
    sharedMockFactories: sourceInsights.sharedMockFactories,
    boundaryProfiles: boundaryLearning.profiles,
    boundaryExemplars: boundaryLearning.exemplars,
    teaching: buildBoundaryTeachingProfile(boundaryLearning.profiles),
    interactionContracts,
    inlineSafeMockTargets: mockRecommendations
      .filter((recommendation) => recommendation.kind === "inline")
      .map((recommendation) => recommendation.target)
      .sort(),
    mutationLifecycles,
    instabilityWarnings,
    mockRecommendations,
    fixtureRoots,
    exemplars: sourceInsights.exemplars,
    playwrightAuth,
    warnings: [
      ...warnings,
      ...(existingProfile?.warnings ?? []).filter((warning) =>
        warning.startsWith("override:")
      ),
    ],
  };
}

async function collectMockStoreResources(
  projectRoot: string,
  statePackages: Record<string, TaroPackageProfile>
): Promise<TaroState["mockStore"]> {
  const fixtureRoots = Object.values(statePackages)
    .flatMap((profile) => profile.fixtureRoots)
    .filter((root) => root.kind === "mock-store");

  const rootDir =
    fixtureRoots.find((root) => root.source === "directory")?.path ??
    fixtureRoots[0]?.path ??
    null;
  const importHint =
    fixtureRoots.find((root) => root.source === "import")?.path ?? rootDir;

  if (!rootDir) {
    return { rootDir: null, importHint: null, resources: [] };
  }

  const diskRoot = join(projectRoot, rootDir);
  try {
    const info = await stat(diskRoot);
    if (!info.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    return { rootDir, importHint, resources: [] };
  }

  const files: string[] = [];

  function hasReachedMockStoreEvidenceLimit(): boolean {
    return files.length >= MAX_EVIDENCE;
  }

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (hasReachedMockStoreEvidenceLimit()) {
        return;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(diskRoot);
  const resources: TaroMockStoreResource[] = [];

  for (const filePath of files) {
    let content = "";
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const exports = new Set<string>();
    for (const match of content.matchAll(
      /export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g
    )) {
      exports.add(match[1]!);
    }
    for (const match of content.matchAll(/export\s*{([^}]+)}/g)) {
      for (const item of match[1]!.split(",")) {
        const [exported] = item.trim().split(/\s+as\s+/);
        if (exported) {
          exports.add(exported.trim());
        }
      }
    }

    resources.push({
      name: basename(filePath),
      file: relative(projectRoot, filePath).replace(/\\/g, "/"),
      exports: [...exports].sort(),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    rootDir,
    importHint,
    resources: resources.sort((left, right) =>
      left.file.localeCompare(right.file)
    ),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTaroStateWithDiagnostics(
  projectRoot: string
): Promise<ReadStateDiagnostics> {
  const statePath = await findReadableProjectStatePath(
    projectRoot,
    "state.json"
  );
  if (!statePath) {
    return { state: null, warnings: [] };
  }

  const parsed = await readJsonFile<unknown>(statePath);
  if (parsed === null) {
    return {
      state: null,
      warnings: [
        "Failed to parse .taro/state.json. Taro will ignore it and rebuild state.",
      ],
    };
  }

  const result = safeParseTaroState(parsed);
  if (!result.success) {
    return {
      state: null,
      warnings: [
        "Invalid .taro/state.json shape detected. Taro will ignore it and rebuild state.",
      ],
    };
  }

  return { state: result.data, warnings: [] };
}

async function readTaroOverridesWithDiagnostics(
  projectRoot: string
): Promise<ReadOverridesDiagnostics> {
  const overridesPath = await findReadableProjectStatePath(
    projectRoot,
    "overrides.json"
  );
  if (!overridesPath) {
    return { overrides: {}, warnings: [] };
  }

  const parsed = await readJsonFile<unknown>(overridesPath);
  if (parsed === null) {
    return {
      overrides: {},
      warnings: [
        "Failed to parse .taro/overrides.json. Taro will ignore overrides for this run.",
      ],
    };
  }

  const result = safeParseTaroOverrides(parsed);
  if (!result.success) {
    return {
      overrides: {},
      warnings: [
        "Invalid .taro/overrides.json shape detected. Taro will ignore overrides for this run.",
      ],
    };
  }

  return { overrides: result.data, warnings: [] };
}

export async function readTaroState(
  projectRoot: string
): Promise<TaroState | null> {
  return (await readTaroStateWithDiagnostics(projectRoot)).state;
}

export async function readTaroOverrides(
  projectRoot: string
): Promise<TaroOverrides> {
  return (await readTaroOverridesWithDiagnostics(projectRoot)).overrides;
}

async function loadLegacyState(
  projectRoot: string
): Promise<{
  state: TaroState | null;
  migratedLegacyState: boolean;
  warnings: string[];
}> {
  const currentState = await readTaroStateWithDiagnostics(projectRoot);
  if (currentState.state) {
    return {
      state: currentState.state,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    };
  }

  const [legacyConventionsPath, legacyHistoryPath] = await Promise.all([
    findReadableProjectStatePath(projectRoot, "conventions.json"),
    findReadableProjectStatePath(projectRoot, "history.json"),
  ]);
  const [legacyConventions, legacyHistory] = await Promise.all([
    legacyConventionsPath
      ? readJsonFile<ConventionsSchema>(legacyConventionsPath)
      : null,
    legacyHistoryPath
      ? readJsonFile<
          Array<{
            timestamp?: string;
            recordingFile?: string;
            score?: number;
            grade?: string;
            dimensions?: ScoreResult["dimensions"];
          }>
        >(legacyHistoryPath)
      : null,
  ]);

  if (!legacyConventions && !legacyHistory) {
    return {
      state: null,
      migratedLegacyState: false,
      warnings: currentState.warnings,
    };
  }

  const now = new Date().toISOString();
  const state = emptyState(now, TARO_VERSION);
  state.meta.createdAt = now;
  state.meta.updatedAt = now;

  if (legacyConventions) {
    state.packages["."] = deriveLegacyPackageProfile(
      projectRoot,
      legacyConventions
    );
  }
  if (legacyHistory) {
    state.generatedTests = migrateLegacyHistory(projectRoot, legacyHistory);
  }

  return { state, migratedLegacyState: true, warnings: currentState.warnings };
}

export async function writeTaroState(
  projectRoot: string,
  state: TaroState
): Promise<void> {
  await ensureProjectStateDir(projectRoot);
  const statePath = getProjectStatePath(projectRoot, "state.json");
  const result = safeParseTaroState(state);
  if (!result.success) {
    throw new Error("Refusing to write invalid .taro/state.json payload.");
  }

  const serialized = JSON.stringify(result.data, null, 2);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, serialized, "utf-8");
  await rename(tempPath, statePath);
  await writeTaroSummary(projectRoot, result.data);
}

async function writeTaroSummary(
  projectRoot: string,
  state: TaroState
): Promise<void> {
  const summaryPath = getProjectStatePath(projectRoot, "summary.md");
  const content = buildStateSummaryMarkdown(projectRoot, state);
  const tempPath = `${summaryPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf-8");
  await rename(tempPath, summaryPath);
}

async function finalizeScanResult(
  projectRoot: string,
  params: {
    generatedHistoryForLearning: TaroState["generatedTests"];
    loadedLegacy: LoadedLegacyStateResult;
    now: string;
    preserveGeneratedTests: boolean;
    overridesDiagnostics: ReadOverridesDiagnostics;
    packages: Record<string, TaroPackageProfile>;
  }
): Promise<ScanStateResult> {
  const existingState = params.loadedLegacy.state;
  const generatedTests = params.preserveGeneratedTests
    ? trimGeneratedTestHistory(projectRoot, existingState?.generatedTests ?? [])
    : [];
  const state: TaroState = {
    version: STATE_VERSION,
    meta: {
      createdAt: existingState?.meta.createdAt ?? params.now,
      updatedAt: params.now,
      taroVersion: TARO_VERSION,
    },
    packages: params.packages,
    mockStore: await collectMockStoreResources(projectRoot, params.packages),
    generatedTests,
  };
  const summaryPackages = buildSummaryPackages(
    projectRoot,
    params.packages,
    params.generatedHistoryForLearning
  );

  return {
    state,
    summary: buildSummaryFromPackages(summaryPackages, {
      migratedLegacyState: params.loadedLegacy.migratedLegacyState,
      overridePackageCount: Object.keys(
        params.overridesDiagnostics.overrides.packages ?? {}
      ).length,
      warnings: [
        ...(summaryPackages.length === 0
          ? ["No test files were detected; state contains defaults only."]
          : []),
        ...params.loadedLegacy.warnings,
        ...params.overridesDiagnostics.warnings,
      ],
    }),
  };
}

async function readRepoInventory(
  projectRoot: string
): Promise<{
  packageDescriptors: PackageDescriptor[];
  testFiles: TestFileContent[];
}> {
  const [testFiles, packageDescriptors] = await Promise.all([
    readTestFiles(projectRoot),
    findPackageDescriptors(projectRoot),
  ]);

  return { packageDescriptors, testFiles };
}

const stateActors = createStateActors({
  buildExistingStateResult,
  buildGeneratedTestQualityIndex,
  buildPackageProfile,
  finalizeScanResult,
  findNearestPackageDescriptor,
  loadLegacyState,
  readRepoInventory,
  readTaroOverridesWithDiagnostics,
  readTaroStateWithDiagnostics,
  runScanStateWorkflow,
  shouldRefreshStateFromGeneratedHistory,
  writeTaroState,
});

async function runScanStateWorkflow(
  projectRoot: string,
  options: ScanStateOptions = {}
): Promise<ScanStateResult> {
  const actor = createActor(createScanStateMachine(stateActors), {
    input: createInitialScanStateMachineContext(projectRoot, options),
  });
  const finalState = await waitForMachineCompletion<{
    error: Error | null;
    result: ScanStateResult | null;
  }>(actor);

  if (finalState.value === "done" && finalState.context.result) {
    return finalState.context.result;
  }

  throw finalState.context.error ?? new Error(SCAN_STATE_FAILURE_MESSAGE);
}

async function runLoadOrBootstrapStateWorkflow(
  projectRoot: string
): Promise<ScanStateResult> {
  const actor = createActor(createLoadOrBootstrapStateMachine(stateActors), {
    input: createInitialLoadOrBootstrapStateMachineContext(projectRoot),
  });
  const finalState = await waitForMachineCompletion<{
    error: Error | null;
    result: ScanStateResult | null;
  }>(actor);

  if (finalState.value === "done" && finalState.context.result) {
    return finalState.context.result;
  }

  throw (
    finalState.context.error ??
    new Error(LOAD_OR_BOOTSTRAP_STATE_FAILURE_MESSAGE)
  );
}

async function scanProjectState(
  projectRoot: string,
  options: ScanStateOptions = {}
): Promise<ScanStateResult> {
  return runScanStateWorkflow(projectRoot, options);
}

export async function initTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  const result = await runScanStateWorkflow(projectRoot, {
    detectedAt: "init",
  });
  await writeTaroState(projectRoot, result.state);
  return result;
}

export async function refreshTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  const result = await runScanStateWorkflow(projectRoot, {
    detectedAt: "refresh",
  });
  await writeTaroState(projectRoot, result.state);
  return result;
}

export async function loadOrBootstrapTaroState(
  projectRoot: string
): Promise<ScanStateResult> {
  return runLoadOrBootstrapStateWorkflow(projectRoot);
}

export { findRepoFallbackPackageProfile } from "#core/state.utils.ts";

async function getLatestPackageEvidence(
  projectRoot: string,
  profile: TaroPackageProfile
): Promise<{ latestMtimeMs: number; latestPath: string | null }> {
  const candidates = new Set<string>();
  const packageRoot =
    profile.packagePath === "."
      ? projectRoot
      : join(projectRoot, profile.packagePath);

  candidates.add(join(packageRoot, "package.json"));
  for (const file of profile.conventions.testFiles) {
    candidates.add(join(projectRoot, file.path));
  }

  for (const candidate of await collectJestDomEvidenceFiles(
    projectRoot,
    packageRoot
  )) {
    candidates.add(candidate);
  }

  for (const root of getTestConfigRoots(projectRoot, packageRoot)) {
    try {
      const entries = await readdir(root);
      for (const entry of entries) {
        if (
          PLAYWRIGHT_CONFIG_FILES.includes(
            entry as (typeof PLAYWRIGHT_CONFIG_FILES)[number]
          )
        ) {
          candidates.add(join(root, entry));
        }
      }
    } catch {
      // Best-effort only.
    }
  }

  if (profile.playwrightAuth?.path) {
    candidates.add(resolve(projectRoot, profile.playwrightAuth.path));
  }

  let latestMtimeMs = 0;
  let latestPath: string | null = null;

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.mtimeMs > latestMtimeMs) {
        latestMtimeMs = info.mtimeMs;
        latestPath = relative(projectRoot, candidate).replace(/\\/g, "/");
      }
    } catch {
      // Ignore unreadable probe paths.
    }
  }

  return { latestMtimeMs, latestPath };
}

export const __stateTestUtils = {
  buildGeneratedTestQualityIndex,
  calculateGeneratedTestQualityWeight,
  collectMockStoreResources,
  collectFixtureRootsFromImports,
  collectFixtureDirs,
  collectProviderWrappers,
  collectRenderHelpers,
  collectSharedMockFactories,
  deriveInteractionContracts,
  analyzeMutationLifecycleInFiles,
  detectMockInstabilityInFiles,
  findPackageDescriptors,
  getLatestPackageEvidence,
  hasReachedMockStoreEvidenceLimit: (fileCount: number) =>
    fileCount >= MAX_EVIDENCE,
  hasConfigFile,
  inferFileExtension,
  inferWeightedFileExtension,
  inferWeightedFolderPattern,
  inferWeightedImportStyle,
  inferWeightedMockPattern,
  scanMockTargetsInFiles,
  scanProjectState,
  shouldRefreshStateFromGeneratedHistory,
  summarizePackageScoreLearning,
  trimGeneratedTestHistory,
};

export async function detectPackageProfileStaleness(
  projectRoot: string,
  profile: TaroPackageProfile
): Promise<TaroPackageProfileStaleness> {
  if (profile.jestDomSetup.evidence.length === 0) {
    return {
      stale: true,
      reason:
        "Package profile predates jest-dom setup detection and should be refreshed.",
      latestEvidencePath: null,
    };
  }

  const scannedAtMs = Date.parse(profile.scannedAt);
  if (!Number.isFinite(scannedAtMs)) {
    return {
      stale: true,
      reason: "Package profile scan timestamp is invalid.",
      latestEvidencePath: null,
    };
  }

  const latestEvidence = await __stateTestUtils.getLatestPackageEvidence(
    projectRoot,
    profile
  );
  if (latestEvidence.latestMtimeMs === 0) {
    return { stale: false, reason: null, latestEvidencePath: null };
  }

  if (latestEvidence.latestMtimeMs > scannedAtMs + 1000) {
    return {
      stale: true,
      reason: latestEvidence.latestPath
        ? `${latestEvidence.latestPath} changed after the package profile was scanned.`
        : "Package evidence changed after the package profile was scanned.",
      latestEvidencePath: latestEvidence.latestPath,
    };
  }

  return {
    stale: false,
    reason: null,
    latestEvidencePath: latestEvidence.latestPath,
  };
}

export function resolveTaroPackageProfile(
  state: TaroState,
  projectRoot: string,
  targetPath: string,
  overrides: TaroOverrides = {}
): ResolvedTaroPackageProfile | null {
  const normalizedTarget = relative(projectRoot, resolve(targetPath)).replace(
    /\\/g,
    "/"
  );
  const profile = findBestPackageProfile(state, normalizedTarget);
  if (!profile) {
    return null;
  }

  const packageOverrides: TaroPackageOverrides | undefined =
    overrides.packages?.[profile.packagePath];
  const appliedOverrides: string[] = [];
  let effectiveRenderHelper = profile.renderHelpers[0] ?? null;
  const preferredBoundaryImplementations = {
    ...(packageOverrides?.preferredSharedMocks ?? {}),
    ...(packageOverrides?.preferredBoundaryImplementations ?? {}),
  };
  const forbidBoundaryTargets = [
    ...new Set([
      ...(packageOverrides?.forbidMocks ?? []),
      ...(packageOverrides?.forbidBoundaryTargets ?? []),
    ]),
  ];
  const boundaryPolicies = { ...(packageOverrides?.boundaryPolicies ?? {}) };
  const enabledContractFamilies = packageOverrides?.enabledContractFamilies
    ?.length
    ? [...packageOverrides.enabledContractFamilies]
    : (["mutation-form"] as InteractionContractKind[]);

  if (packageOverrides?.runner) {
    appliedOverrides.push(`runner:${packageOverrides.runner}`);
  }
  if (packageOverrides?.renderHelper) {
    appliedOverrides.push(`renderHelper:${packageOverrides.renderHelper.name}`);
    effectiveRenderHelper = {
      name: packageOverrides.renderHelper.name,
      importPath: packageOverrides.renderHelper.importPath,
      importKind: "named",
      sourceTestFile: ".taro/overrides.json",
      usageCount: 0,
      usesWithin: false,
    };
  }
  if (packageOverrides?.forbidMocks?.length) {
    appliedOverrides.push("forbidMocks");
  }
  if (
    packageOverrides?.preferredSharedMocks &&
    Object.keys(packageOverrides.preferredSharedMocks).length > 0
  ) {
    appliedOverrides.push("preferredSharedMocks");
  }
  if (
    packageOverrides?.preferredBoundaryImplementations &&
    Object.keys(packageOverrides.preferredBoundaryImplementations).length > 0
  ) {
    appliedOverrides.push("preferredBoundaryImplementations");
  }
  if (
    packageOverrides?.boundaryPolicies &&
    Object.keys(packageOverrides.boundaryPolicies).length > 0
  ) {
    appliedOverrides.push("boundaryPolicies");
  }
  if (packageOverrides?.forbidBoundaryTargets?.length) {
    appliedOverrides.push("forbidBoundaryTargets");
  }
  if (packageOverrides?.queryHookPolicy) {
    appliedOverrides.push(
      `queryHookPolicy:${packageOverrides.queryHookPolicy}`
    );
  }
  if (packageOverrides?.companionPolicy) {
    appliedOverrides.push(
      `companionPolicy:${packageOverrides.companionPolicy}`
    );
  }
  if (packageOverrides?.enabledContractFamilies?.length) {
    appliedOverrides.push("enabledContractFamilies");
  }

  const boundaryProfilesByTarget = new Map(
    profile.boundaryProfiles.map((boundaryProfile) => [
      boundaryProfile.target,
      boundaryProfile,
    ])
  );

  for (const [target, supportImportPath] of Object.entries(
    preferredBoundaryImplementations
  )) {
    if (!boundaryProfilesByTarget.has(target)) {
      boundaryProfilesByTarget.set(target, {
        target,
        kind: classifyBoundaryKind(target),
        strategy: "shared-module-factory",
        guardrailReason: getBoundaryGuardrailReason(target),
        supportImportPath,
        supportPath: null,
        supportExports: {
          factoryExport: null,
          resetExport: null,
          overrideExports: [],
          spyExports: [],
          fixtureExports: [],
        },
        payloadSource: /mock-store/i.test(supportImportPath)
          ? "mock-store"
          : /fixture/i.test(supportImportPath)
            ? "fixtures"
            : /mock/i.test(supportImportPath)
              ? "typed-defaults"
              : "manual",
        confidence: "high",
        files: [],
        evidence: [`Override: ${target} -> ${supportImportPath}`],
        conflictTargets: [],
        lowConfidenceScaffold: false,
      });
    }
  }

  const resolvedBoundaryProfiles = [...boundaryProfilesByTarget.values()]
    .map((boundaryProfile) => {
      const effectiveGuardrailReason: TaroBoundaryGuardrailReason | null =
        boundaryProfile.guardrailReason ??
        getBoundaryGuardrailReason(boundaryProfile.target);
      const forceKeepReal =
        effectiveGuardrailReason === "repo-owned-ui-wrapper";
      const forcedSupportImportPath = forceKeepReal
        ? null
        : (preferredBoundaryImplementations[boundaryProfile.target] ??
          boundaryProfile.supportImportPath);
      const forcedStrategy =
        forceKeepReal || forbidBoundaryTargets.includes(boundaryProfile.target)
          ? "forbid"
          : (boundaryPolicies[boundaryProfile.target] ??
            (preferredBoundaryImplementations[boundaryProfile.target]
              ? "shared-module-factory"
              : boundaryProfile.strategy));

      return {
        ...boundaryProfile,
        guardrailReason: effectiveGuardrailReason,
        strategy: forcedStrategy,
        pattern:
          forcedStrategy === "forbid" &&
          effectiveGuardrailReason === "repo-owned-ui-wrapper"
            ? "keep-real"
            : boundaryProfile.pattern,
        supportImportPath: forcedSupportImportPath,
        supportExports:
          forcedStrategy === "forbid"
            ? {
                factoryExport: null,
                resetExport: null,
                overrideExports: [],
                spyExports: [],
                fixtureExports: [],
              }
            : boundaryProfile.supportExports,
      };
    })
    .sort((left, right) => left.target.localeCompare(right.target));

  return {
    ...profile,
    boundaryProfiles: resolvedBoundaryProfiles,
    appliedOverrides,
    effectiveRunner: packageOverrides?.runner ?? profile.runner.value,
    effectiveRenderHelper,
    forbidMocks: packageOverrides?.forbidMocks ?? [],
    preferredSharedMocks: packageOverrides?.preferredSharedMocks ?? {},
    boundaryPolicies,
    preferredBoundaryImplementations,
    forbidBoundaryTargets,
    effectiveQueryHookPolicy: packageOverrides?.queryHookPolicy ?? "avoid",
    effectiveCompanionPolicy: packageOverrides?.companionPolicy ?? "heuristic",
    enabledContractFamilies,
  };
}

export async function persistPlaywrightAuthProfile(
  projectRoot: string,
  packagePath: string,
  playwrightAuth: TaroPlaywrightAuthProfile | null
): Promise<boolean> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot);
  const profile = bootstrap.state.packages[packagePath];

  if (!profile) {
    return false;
  }

  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: new Date().toISOString(),
      taroVersion: TARO_VERSION,
    },
    packages: {
      ...bootstrap.state.packages,
      [packagePath]: { ...profile, playwrightAuth },
    },
  };

  await writeTaroState(projectRoot, nextState);
  return true;
}

export async function appendGeneratedTestRecord(
  projectRoot: string,
  record: {
    packagePath: string;
    recordingFile?: string | null;
    testFile: string;
    scoreResult: ScoreResult;
  }
): Promise<void> {
  const bootstrap = await loadOrBootstrapTaroState(projectRoot);
  const createdAt = new Date().toISOString();
  const nextState: TaroState = {
    ...bootstrap.state,
    meta: {
      ...bootstrap.state.meta,
      updatedAt: createdAt,
      taroVersion: TARO_VERSION,
    },
    generatedTests: trimGeneratedTestHistory(projectRoot, [
      ...bootstrap.state.generatedTests,
      {
        createdAt,
        packagePath: record.packagePath,
        recordingFile: record.recordingFile ?? null,
        testFile: record.testFile,
        quality: {
          overall: record.scoreResult.total,
          grade: record.scoreResult.grade,
          dimensions: record.scoreResult.dimensions,
          signals: record.scoreResult.signals,
          reasons: record.scoreResult.reasons,
        },
        requiresReview: record.scoreResult.requiresReview,
      },
    ]),
  };

  await writeTaroState(projectRoot, nextState);
  await refreshTaroState(projectRoot);
}

export function formatStateSummary(
  summary: TaroStateSummary,
  action: "init" | "refresh"
): string[] {
  const lines = [
    `${pc.dim("[taro]")} ${action === "init" ? "Initialized" : "Refreshed"} project state`,
    `${pc.dim("[taro]")} packages=${summary.packageCount}, renderHelpers=${summary.renderHelperCount}, repeatedMockTargets=${summary.repeatedMockTargetCount}, boundaryProfiles=${summary.boundaryProfileCount}, lowConfidenceBoundaries=${summary.lowConfidenceBoundaryCount}, fixtureRoots=${summary.fixtureRootCount}`,
  ];

  if (summary.migratedLegacyState) {
    lines.push(
      `${pc.dim("[taro]")} consolidated compatibility .taro convention history into state.json`
    );
  }
  if (summary.overridePackageCount > 0) {
    lines.push(
      `${pc.dim("[taro]")} overrides applied from .taro/overrides.json for ${summary.overridePackageCount} package(s)`
    );
  }

  for (const pkg of summary.packages) {
    lines.push(
      `${pc.dim("[taro]")} ${pkg.packagePath}: runner=${pkg.runner}, scannedAt=${pkg.scannedAt}, renderHelpers=${pkg.renderHelperCount}, repeatedMocks=${pkg.repeatedMockTargetCount}, boundaryProfiles=${pkg.boundaryProfileCount}, lowConfidenceBoundaries=${pkg.lowConfidenceBoundaryCount}, fixtureRoots=${pkg.fixtureRootCount}, scoredTests=${pkg.scoredTestFileCount}, unscoredTests=${pkg.unscoredTestFileCount}`
    );
  }
  for (const warning of summary.warnings) {
    lines.push(`${pc.yellow("[taro]")} ${warning}`);
  }

  return lines;
}
