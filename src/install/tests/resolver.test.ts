import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveInstallTargets } from "#install/resolver.ts";
import { createSingleRuntimeSelection as createSelection } from "#install/tests/test-utils.ts";

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
