import type { InstallFileOperation, ResolvedInstallTarget } from '#install/types.ts'
import { buildPromptRuntimeOperations } from '#install/runtimes/prompt-runtimes.ts'

export function buildOpenCodeRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'opencode') {
    throw new Error(`OpenCode runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
