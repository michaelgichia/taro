import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveInstallTargets } from "#install/resolver.ts";
import type {
  InstallSelection,
  RuntimeLocationSelections,
} from "#install/types.ts";

function createSelection(
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

describe("resolveInstallTargets", () => {
  it("uses process.cwd() when cwd is omitted for local installs", () => {
    const [target] = resolveInstallTargets(createSelection("codex", "local"), {
      home: "/tmp/custom-home",
      nodePath: "/tmp/node",
      packageRoot: "/tmp/package-root",
    });

    expect(target.destinationDirectory).toBe(resolve(process.cwd(), ".codex"));
    expect(target.runtimeNodePath).toBe("/tmp/node");
    expect(target.runtimeEntrypointPath).toBe(
      "/tmp/package-root/dist/index.js"
    );
  });

  it("uses homedir() when home is omitted for global installs", () => {
    const [target] = resolveInstallTargets(
      createSelection("claude", "global"),
      {
        cwd: "/tmp/project",
        nodePath: "/tmp/node",
        packageRoot: "/tmp/package-root",
      }
    );

    expect(target.destinationDirectory).toBe(join(homedir(), ".claude"));
    expect(target.runtimeNodePath).toBe("/tmp/node");
    expect(target.runtimeEntrypointPath).toBe(
      "/tmp/package-root/dist/index.js"
    );
  });
});
