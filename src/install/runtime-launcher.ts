import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveAssetSource, resolvePackageRoot } from '#install/assets.ts'
import type { InstallFileOperation, ResolvedInstallTarget, RuntimeAssetDefinition } from '#install/types.ts'

export const TARO_RUNTIME_COMMAND_PLACEHOLDER = '{{TARO_RUNTIME_COMMAND}}'

interface RuntimeLauncherContext {
  packageRoot?: string
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function resolveRuntimeEntrypointPath(
  context: RuntimeLauncherContext = {},
  fromModuleUrl: string = import.meta.url
): string {
  const packageRoot = context.packageRoot ?? resolvePackageRoot(fromModuleUrl)
  return join(packageRoot, 'dist', 'index.js')
}

export function buildRuntimeCommand(nodePath: string, entrypointPath: string): string {
  return `${shellQuote(nodePath)} ${shellQuote(entrypointPath)}`
}

function renderRuntimeCommand(template: string, runtimeCommand: string): string | undefined {
  if (!template.includes(TARO_RUNTIME_COMMAND_PLACEHOLDER)) {
    return undefined
  }

  return template.split(TARO_RUNTIME_COMMAND_PLACEHOLDER).join(runtimeCommand)
}

export function buildRuntimeOperationsFromAssets(
  target: ResolvedInstallTarget,
  assets: RuntimeAssetDefinition[],
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  return assets.map((asset) => {
    const sourcePath = resolveAssetSource(asset.sourceSegments, fromModuleUrl)
    const relativeDestinationPath = join(...asset.destinationSegments)
    const renderedContent = renderRuntimeCommand(readFileSync(sourcePath, 'utf8'), target.runtimeCommand)

    return {
      assetId: asset.id,
      runtime: target.id,
      location: target.location,
      kind: asset.kind,
      sourcePath,
      relativeDestinationPath,
      targetPath: join(target.destinationDirectory, relativeDestinationPath),
      entrypoint: asset.entrypoint,
      renderedContent,
    }
  })
}
