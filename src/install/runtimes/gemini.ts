import type { InstallFileOperation, ResolvedInstallTarget } from '../types.ts'
import { buildPromptRuntimeOperations } from './prompt-runtimes.ts'

export function buildGeminiRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'gemini') {
    throw new Error(`Gemini runtime builder received ${target.id}.`)
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl)
}
