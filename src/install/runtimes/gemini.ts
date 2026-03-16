import { buildPromptRuntimeOperations } from '#install/runtimes/prompt-runtimes.ts'
import type { InstallFileOperation, ResolvedInstallTarget } from '#install/types.ts'

export function buildGeminiRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'gemini') {
    throw new Error(`Gemini runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
