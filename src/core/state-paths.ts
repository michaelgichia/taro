import { relative, resolve } from "node:path";

import { uniq } from "#core/lodash.ts";
import type { PackageDescriptor } from "#core/state-runtime-types.ts";
import type {
  TaroPlaywrightAuthDetectedAt,
  TaroPlaywrightAuthProfile,
  TaroState,
} from "#types/state.ts";

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function ensureDotPath(value: string): string {
  return value.length === 0 ? "." : value;
}

export function toProjectRelativePath(
  projectRoot: string,
  filePath: string
): string {
  return ensureDotPath(toPosixPath(relative(projectRoot, filePath)));
}

export function toProjectRelativeFilePath(
  projectRoot: string,
  filePath: string
): string {
  return toPosixPath(relative(projectRoot, filePath));
}

export function normalizePackageKey(
  projectRoot: string,
  packageRoot: string
): string {
  return toProjectRelativePath(projectRoot, packageRoot);
}

export function toStateRelativePath(
  projectRoot: string,
  filePath: string
): string {
  return toProjectRelativePath(projectRoot, filePath);
}

export function createPlaywrightAuthProfile(
  projectRoot: string,
  filePath: string,
  options: {
    detectedAt: TaroPlaywrightAuthDetectedAt;
    source: TaroPlaywrightAuthProfile["source"];
    strategy?: TaroPlaywrightAuthProfile["strategy"];
  }
): TaroPlaywrightAuthProfile {
  return {
    strategy: options.strategy ?? "storageState",
    path: toStateRelativePath(projectRoot, filePath),
    detectedAt: options.detectedAt,
    source: options.source,
  };
}

export function normalizeRepoRelativePath(
  projectRoot: string,
  filePath: string
): string | null {
  const relativePath = toPosixPath(relative(resolve(projectRoot), resolve(filePath)));

  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    return null;
  }

  return relativePath;
}

export function normalizeGeneratedTestHistoryPath(
  projectRoot: string,
  testFile: string
): string {
  return (
    normalizeRepoRelativePath(projectRoot, testFile) ??
    toPosixPath(resolve(projectRoot, testFile)).replace(
      /^\/private(?=\/var\/)/u,
      ""
    )
  );
}

export function getTestConfigRoots(
  projectRoot: string,
  packageRoot: string
): string[] {
  return uniq([resolve(packageRoot), resolve(projectRoot)]);
}

export function resolveConfiguredPath(baseDir: string, rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith("<rootDir>/")) {
    return resolve(baseDir, trimmed.slice("<rootDir>/".length));
  }

  return resolve(baseDir, trimmed);
}

export function findNearestPackageDescriptor(
  descriptors: PackageDescriptor[],
  filePath: string
): PackageDescriptor {
  const normalizedFilePath = resolve(filePath);
  const sorted = [...descriptors].sort(
    (left, right) => right.root.length - left.root.length
  );

  for (const descriptor of sorted) {
    if (
      normalizedFilePath === descriptor.root ||
      normalizedFilePath.startsWith(`${descriptor.root}/`) ||
      normalizedFilePath.startsWith(`${descriptor.root}\\`)
    ) {
      return descriptor;
    }
  }

  return (
    descriptors.find((descriptor) => descriptor.key === ".") ?? descriptors[0]!
  );
}

export function resolveExistingPackageProfile(
  state: TaroState | null,
  packageKey: string
) {
  if (!state) {
    return null;
  }

  return state.packages[packageKey] ?? null;
}

export function findRepoFallbackPackageProfile(state: TaroState) {
  if (state.packages["."]) {
    return state.packages["."]!;
  }

  const profiles = Object.values(state.packages);
  if (profiles.length === 0) {
    return null;
  }

  return [...profiles].sort((left, right) => {
    return (
      right.testFileCount - left.testFileCount ||
      left.packagePath.localeCompare(right.packagePath)
    );
  })[0]!;
}

export function findBestPackageProfile(
  state: TaroState,
  targetPath: string
) {
  const normalizedTarget = toPosixPath(targetPath);
  const profiles = Object.values(state.packages).sort(
    (left, right) => right.packagePath.length - left.packagePath.length
  );

  for (const profile of profiles) {
    if (
      profile.packagePath === "." ||
      normalizedTarget === profile.packagePath ||
      normalizedTarget.startsWith(`${profile.packagePath}/`)
    ) {
      return profile;
    }
  }

  return findRepoFallbackPackageProfile(state);
}
