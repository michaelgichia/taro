import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuntimeTarget } from './types.js'

export function resolvePackageRoot(fromModuleUrl: string = import.meta.url): string {
  return resolve(dirname(fileURLToPath(fromModuleUrl)), '..', '..')
}

export function resolveAssetsRoot(fromModuleUrl: string = import.meta.url): string {
  return join(resolvePackageRoot(fromModuleUrl), 'assets')
}

export function resolveAssetSource(
  runtime: RuntimeTarget,
  sourceSegments: string[] = [],
  fromModuleUrl: string = import.meta.url
): string {
  return join(resolveAssetsRoot(fromModuleUrl), runtime, ...sourceSegments)
}
