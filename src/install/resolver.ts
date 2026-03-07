import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { InstallSelection, ResolvedInstallTarget } from './types.js'
import { RUNTIME_REGISTRY } from './registry.js'

interface ResolveInstallTargetsContext {
  cwd?: string
  home?: string
}

export function resolveInstallTargets(
  selection: InstallSelection,
  context: ResolveInstallTargetsContext = {}
): ResolvedInstallTarget[] {
  const currentWorkingDirectory = context.cwd ?? process.cwd()
  const homeDirectory = context.home ?? homedir()

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
    }
  })
}
