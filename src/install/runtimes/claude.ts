import type { InstallFileOperation, ResolvedInstallTarget } from '../types.ts'
import { buildPromptRuntimeOperations } from './prompt-runtimes.ts'

export function buildClaudeRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'claude') {
    throw new Error(`Claude runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
