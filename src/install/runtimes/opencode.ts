import type { InstallFileOperation, ResolvedInstallTarget } from '../types.ts'
import { buildPromptRuntimeOperations } from './prompt-runtimes.ts'

export function buildOpenCodeRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'opencode') {
    throw new Error(`OpenCode runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
