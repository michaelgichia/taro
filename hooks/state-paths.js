import { access } from "node:fs/promises";
import { join } from "node:path";

const STATE_DIRS = [".taro"];

export async function findReadableStatePath(projectRoot, ...segments) {
  for (const stateDir of STATE_DIRS) {
    const candidate = join(projectRoot, stateDir, ...segments);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported state directory.
    }
  }

  return null;
}

export function getPrimaryStatePath(projectRoot, ...segments) {
  return join(projectRoot, ".taro", ...segments);
}
