import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePackageRoot(
  fromModuleUrl: string = import.meta.url
): string {
  let current = dirname(fileURLToPath(fromModuleUrl));

  while (true) {
    if (existsSync(join(current, "package.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate package root from ${fromModuleUrl}.`);
    }

    current = parent;
  }
}

export function resolveAssetSource(
  sourceSegments: string[] = [],
  fromModuleUrl: string = import.meta.url
): string {
  return join(resolvePackageRoot(fromModuleUrl), ...sourceSegments);
}
