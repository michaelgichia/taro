import type { InstallFileOperation, ResolvedInstallTarget } from "../types.js";
import { buildPromptRuntimeOperations } from "./prompt-runtimes.js";

export function buildClaudeRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== "claude") {
    throw new Error(`Claude runtime builder received ${target.id}.`);
  }

  return buildPromptRuntimeOperations(target, fromModuleUrl);
}
