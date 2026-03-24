import { access } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import pc from "picocolors";

import type {
  RepoRenderTargetCandidate,
  ResolvedTaroPackageProfile,
  TaroFolderPattern,
  TaroPlaywrightAuthProfile,
} from "#types/state.ts";

const DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH =
  ".taro/playwright/.auth/user.json";

function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function isRelativeImportPath(importPath: string): boolean {
  return importPath.startsWith("./") || importPath.startsWith("../");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function deriveOutputPath(
  inputPath: string,
  folderPattern?: TaroFolderPattern
): string {
  const dir = dirname(inputPath);
  const name = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, "");
  if (folderPattern === "__tests__") {
    return join(dir, "__tests__", `${name}.test.tsx`);
  }
  if (folderPattern === "tests") {
    return join(dir, "tests", `${name}.test.tsx`);
  }
  return join(dir, `${name}.test.tsx`);
}

export async function resolveImportedFilePath(params: {
  projectRoot: string;
  sourceFile: string;
  importPath: string;
}): Promise<string | null> {
  const { projectRoot, sourceFile, importPath } = params;
  if (!isRelativeImportPath(importPath)) {
    return null;
  }

  const sourceDir = dirname(resolve(projectRoot, sourceFile));
  const rawTargetPath = resolve(sourceDir, importPath);
  const candidates = [
    rawTargetPath,
    `${rawTargetPath}.ts`,
    `${rawTargetPath}.tsx`,
    `${rawTargetPath}.js`,
    `${rawTargetPath}.jsx`,
    join(rawTargetPath, "index.ts"),
    join(rawTargetPath, "index.tsx"),
    join(rawTargetPath, "index.js"),
    join(rawTargetPath, "index.jsx"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return rawTargetPath;
}

export async function resolveRenderTargetFile(params: {
  projectRoot: string;
  renderTarget: RepoRenderTargetCandidate | null;
}): Promise<string | null> {
  const { projectRoot, renderTarget } = params;
  if (!renderTarget) {
    return null;
  }

  if (!isTestFilePath(renderTarget.sourceTestFile)) {
    return resolve(projectRoot, renderTarget.sourceTestFile);
  }

  return resolveImportedFilePath({
    projectRoot,
    sourceFile: renderTarget.sourceTestFile,
    importPath: renderTarget.importPath,
  });
}

function normalizeComparablePath(value: string): string {
  return value.replace(/^\/private(?=\/var\/)/u, "");
}

export function toImportPath(
  fromDir: string,
  absoluteFilePath: string
): string {
  const withoutExtension = normalizeComparablePath(absoluteFilePath).replace(
    /\.[^.]+$/u,
    ""
  );
  const relativePath = relative(
    normalizeComparablePath(fromDir),
    withoutExtension
  ).replace(/\\/g, "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export function rebaseRenderHelperImportPath(params: {
  projectRoot: string;
  outputPath: string;
  renderHelper: ResolvedTaroPackageProfile["effectiveRenderHelper"];
}): ResolvedTaroPackageProfile["effectiveRenderHelper"] {
  const { projectRoot, outputPath, renderHelper } = params;
  if (
    !renderHelper ||
    !isRelativeImportPath(renderHelper.importPath) ||
    !isTestFilePath(renderHelper.sourceTestFile)
  ) {
    return renderHelper;
  }

  const absoluteImportPath = resolve(
    dirname(resolve(projectRoot, renderHelper.sourceTestFile)),
    renderHelper.importPath
  );

  return {
    ...renderHelper,
    importPath: toImportPath(dirname(outputPath), absoluteImportPath),
  };
}

export function toProjectRelativePath(
  projectRoot: string,
  filePath: string
): string {
  const absoluteFilePath = resolve(filePath);
  const normalized = relative(projectRoot, absoluteFilePath).replace(
    /\\/g,
    "/"
  );
  if (normalized && !normalized.startsWith("..")) {
    return normalized;
  }

  const authLikeSuffix = absoluteFilePath
    .replace(/\\/g, "/")
    .match(
      /(?:^|\/)(playwright\/\.auth\/.+|\.auth\/.+|e2e\/\.auth\/.+|tests\/e2e\/\.auth\/.+)$/
    );
  if (authLikeSuffix?.[1]) {
    return authLikeSuffix[1];
  }

  return normalized.length === 0 ? "." : normalized;
}

export async function resolveOptionalFilePath(
  projectRoot: string,
  inputPath: string | undefined
): Promise<{ absolutePath: string; relativePath: string } | null> {
  if (!inputPath) {
    return null;
  }

  const absolutePath = resolve(projectRoot, inputPath);
  try {
    await access(absolutePath);
    return {
      absolutePath,
      relativePath: toProjectRelativePath(projectRoot, absolutePath),
    };
  } catch {
    console.warn(
      pc.yellow(
        `[taro] Visual auth: file not found ${absolutePath}; continuing without it.`
      )
    );
    return null;
  }
}

export function resolveVisualAuthStorageStatePath(
  projectRoot: string,
  auth: TaroPlaywrightAuthProfile | null
): { absolutePath: string; relativePath: string } {
  const relativePath =
    auth?.strategy === "storageState"
      ? auth.path
      : DEFAULT_VISUAL_AUTH_STORAGE_STATE_PATH;

  return { absolutePath: resolve(projectRoot, relativePath), relativePath };
}
