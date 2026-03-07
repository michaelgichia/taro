import type { InstallFileOperation, ResolvedInstallTarget } from '../types.js'
import { buildPromptRuntimeOperations } from './prompt-runtimes.js'

export function buildOpenCodeRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'opencode') {
    throw new Error(`OpenCode runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
