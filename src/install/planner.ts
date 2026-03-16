import { buildClaudeRuntimeOperations } from './runtimes/claude.ts'
import { buildCodexOperations } from './runtimes/codex.ts'
import { buildGeminiRuntimeOperations } from './runtimes/gemini.ts'
import { buildOpenCodeRuntimeOperations } from './runtimes/opencode.ts'
import { resolveInstallTargets } from './resolver.ts'
import type { InstallPlan, InstallSelection, ResolvedInstallTarget } from './types.ts'

interface BuildInstallPlanContext {
  cwd?: string
  home?: string
  nodePath?: string
  packageRoot?: string
}

function buildRuntimeOperations(target: ResolvedInstallTarget) {
  switch (target.id) {
    case 'claude':
      return buildClaudeRuntimeOperations(target)
    case 'opencode':
      return buildOpenCodeRuntimeOperations(target)
    case 'gemini':
      return buildGeminiRuntimeOperations(target)
    case 'codex':
      return buildCodexOperations(target)
  }
}

export function buildInstallPlan(
  selection: InstallSelection,
  context: BuildInstallPlanContext = {}
): InstallPlan {
  return {
    packageName: '@taro-test/rtl',
    commandName: 'taro',
    stage: 'ready-to-write',
    source: selection.source,
    mode: selection.mode,
    targets: resolveInstallTargets(selection, context).map((target) => ({
      ...target,
      operations: buildRuntimeOperations(target),
    })),
  }
}
