import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildRuntimeCommand, resolveRuntimeEntrypointPath } from './runtime-launcher.js'
import type { InstallSelection, ResolvedInstallTarget } from './types.js'
import { RUNTIME_REGISTRY } from './registry.js'

interface ResolveInstallTargetsContext {
  cwd?: string
  home?: string
  nodePath?: string
  packageRoot?: string
}

export function resolveInstallTargets(
  selection: InstallSelection,
  context: ResolveInstallTargetsContext = {}
): ResolvedInstallTarget[] {
  const currentWorkingDirectory = context.cwd ?? process.cwd()
  const homeDirectory = context.home ?? homedir()
  const runtimeNodePath = context.nodePath ?? process.execPath
  const runtimeEntrypointPath = resolveRuntimeEntrypointPath(
    { packageRoot: context.packageRoot },
    import.meta.url
  )

  return selection.runtimes.map((runtime) => {
    const metadata = RUNTIME_REGISTRY[runtime]
    const location = selection.locations[runtime]
    const destinationDirectory =
      location === 'global'
        ? join(homeDirectory, ...metadata.globalDirectorySegments)
        : resolve(currentWorkingDirectory, metadata.localDirectoryName)

    return {
      ...metadata,
      location,
      destinationDirectory,
      runtimeNodePath,
      runtimeEntrypointPath,
      runtimeCommand: buildRuntimeCommand(runtimeNodePath, runtimeEntrypointPath),
    }
  })
}
