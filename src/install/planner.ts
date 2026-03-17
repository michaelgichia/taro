import { resolveInstallTargets } from '#install/resolver.ts'
import { buildClaudeRuntimeOperations } from '#install/runtimes/claude.ts'
import { buildCodexOperations } from '#install/runtimes/codex.ts'
import { buildGeminiRuntimeOperations } from '#install/runtimes/gemini.ts'
import { buildOpenCodeRuntimeOperations } from '#install/runtimes/opencode.ts'
import type { InstallPlan, InstallSelection, ResolvedInstallTarget } from '#install/types.ts'

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
