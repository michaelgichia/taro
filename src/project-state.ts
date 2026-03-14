import { access, mkdir } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const TARO_STATE_DIRNAME = ".taro";

export function getProjectStateDir(projectRoot: string): string {
  return join(projectRoot, TARO_STATE_DIRNAME);
}

export function getProjectStatePath(
  projectRoot: string,
  ...segments: string[]
): string {
  return join(getProjectStateDir(projectRoot), ...segments);
}

export async function ensureProjectStateDir(
  projectRoot: string
): Promise<string> {
  const stateDir = getProjectStateDir(projectRoot);
  await mkdir(stateDir, { recursive: true });
  return stateDir;
}

export function ensureProjectStateDirSync(projectRoot: string): string {
  const stateDir = getProjectStateDir(projectRoot);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

export async function findReadableProjectStatePath(
  projectRoot: string,
  ...segments: string[]
): Promise<string | null> {
  const statePath = getProjectStatePath(projectRoot, ...segments);
  try {
    await access(statePath);
    return statePath;
  } catch {
    return null;
  }
}

export function findReadableProjectStatePathSync(
  projectRoot: string,
  ...segments: string[]
): string | null {
  const statePath = getProjectStatePath(projectRoot, ...segments);
  return existsSync(statePath) ? statePath : null;
}
