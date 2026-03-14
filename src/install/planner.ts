import { buildClaudeRuntimeOperations } from "./runtimes/claude.js";
import { buildCodexOperations } from "./runtimes/codex.js";
import { buildGeminiRuntimeOperations } from "./runtimes/gemini.js";
import { buildOpenCodeRuntimeOperations } from "./runtimes/opencode.js";
import { resolveInstallTargets } from "./resolver.js";
import type {
  InstallPlan,
  InstallSelection,
  ResolvedInstallTarget,
} from "./types.js";

interface BuildInstallPlanContext {
  cwd?: string;
  home?: string;
}

function buildRuntimeOperations(target: ResolvedInstallTarget) {
  switch (target.id) {
    case "claude":
      return buildClaudeRuntimeOperations(target);
    case "opencode":
      return buildOpenCodeRuntimeOperations(target);
    case "gemini":
      return buildGeminiRuntimeOperations(target);
    case "codex":
      return buildCodexOperations(target);
  }
}

export function buildInstallPlan(
  selection: InstallSelection,
  context: BuildInstallPlanContext = {}
): InstallPlan {
  return {
    packageName: "@taro-test/rtl",
    commandName: "taro",
    stage: "ready-to-write",
    source: selection.source,
    mode: selection.mode,
    targets: resolveInstallTargets(selection, context).map((target) => ({
      ...target,
      operations: buildRuntimeOperations(target),
    })),
  };
}
