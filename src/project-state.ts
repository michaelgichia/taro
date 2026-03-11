import { access, mkdir, rename } from 'node:fs/promises'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export const TARO_STATE_DIRNAME = '.taro'
export const LEGACY_TAYO_STATE_DIRNAME = '.tayo'

export function getProjectStateDir(projectRoot: string): string {
  return join(projectRoot, TARO_STATE_DIRNAME)
}

export function getLegacyProjectStateDir(projectRoot: string): string {
  return join(projectRoot, LEGACY_TAYO_STATE_DIRNAME)
}

export function getProjectStatePath(
  projectRoot: string,
  ...segments: string[]
): string {
  return join(getProjectStateDir(projectRoot), ...segments)
}

export function getLegacyProjectStatePath(
  projectRoot: string,
  ...segments: string[]
): string {
  return join(getLegacyProjectStateDir(projectRoot), ...segments)
}

export async function ensureProjectStateDir(projectRoot: string): Promise<string> {
  const stateDir = getProjectStateDir(projectRoot)

  try {
    await access(stateDir)
    return stateDir
  } catch {
    // Current state directory does not exist yet.
  }

  const legacyStateDir = getLegacyProjectStateDir(projectRoot)

  try {
    await access(legacyStateDir)
    await rename(legacyStateDir, stateDir)
    return stateDir
  } catch {
    // Legacy state directory does not exist or could not be migrated.
  }

  await mkdir(stateDir, { recursive: true })
  return stateDir
}

export function ensureProjectStateDirSync(projectRoot: string): string {
  const stateDir = getProjectStateDir(projectRoot)
  if (existsSync(stateDir)) {
    return stateDir
  }

  const legacyStateDir = getLegacyProjectStateDir(projectRoot)
  if (existsSync(legacyStateDir)) {
    try {
      renameSync(legacyStateDir, stateDir)
      return stateDir
    } catch {
      // Fall through to mkdir and keep the legacy directory untouched.
    }
  }

  mkdirSync(stateDir, { recursive: true })
  return stateDir
}

export async function findReadableProjectStatePath(
  projectRoot: string,
  ...segments: string[]
): Promise<string | null> {
  const preferredPath = getProjectStatePath(projectRoot, ...segments)
  try {
    await access(preferredPath)
    return preferredPath
  } catch {
    // Preferred state path does not exist.
  }

  const legacyPath = getLegacyProjectStatePath(projectRoot, ...segments)
  try {
    await access(legacyPath)
    return legacyPath
  } catch {
    return null
  }
}

export function findReadableProjectStatePathSync(
  projectRoot: string,
  ...segments: string[]
): string | null {
  const preferredPath = getProjectStatePath(projectRoot, ...segments)
  if (existsSync(preferredPath)) {
    return preferredPath
  }

  const legacyPath = getLegacyProjectStatePath(projectRoot, ...segments)
  return existsSync(legacyPath) ? legacyPath : null
}
