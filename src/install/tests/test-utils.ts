import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  InstallFileOperation,
  InstallLocation,
  InstallSelection,
  RuntimeLocationSelections,
  RuntimeTarget,
} from "#install/types.ts";

export function createSingleRuntimeSelection(
  runtime: keyof RuntimeLocationSelections,
  location: RuntimeLocationSelections[keyof RuntimeLocationSelections]
): InstallSelection {
  return {
    mode: "non-interactive",
    runtimes: [runtime],
    locations: { [runtime]: location } as RuntimeLocationSelections,
    source: "flags",
  };
}

export function createMultiRuntimeSelection(
  runtimes: RuntimeTarget[],
  location: InstallLocation
): InstallSelection {
  return {
    mode: "non-interactive",
    runtimes,
    locations: Object.fromEntries(
      runtimes.map((runtime) => [runtime, location])
    ) as RuntimeLocationSelections,
    source: "flags",
  };
}

export async function materializeOperations(
  operations: InstallFileOperation[]
): Promise<void> {
  for (const operation of operations) {
    await mkdir(dirname(operation.targetPath), { recursive: true });
    if (operation.renderedContent != null) {
      await writeFile(operation.targetPath, operation.renderedContent);
    } else {
      await copyFile(operation.sourcePath, operation.targetPath);
    }
  }
}
