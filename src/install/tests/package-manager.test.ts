import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allDlxCommands,
  DEFAULT_PACKAGE_MANAGER,
  detectPackageManager,
  dlxCommand,
  SUPPORTED_PACKAGE_MANAGERS,
} from "#install/package-manager.ts";

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "taro-pm-detect-"));
  return root;
}

describe("detectPackageManager", () => {
  let tempRoot: string;
  let savedUserAgent: string | undefined;
  let savedDenoVersion: string | undefined;

  beforeEach(async () => {
    tempRoot = await makeTempDir();
    // CI runs vitest under pnpm, which sets npm_config_user_agent and would
    // short-circuit every "no UA" test case. Clear both knobs before each test
    // and restore after so detection sees exactly what the test provides.
    savedUserAgent = process.env.npm_config_user_agent;
    savedDenoVersion = process.env.DENO_VERSION;
    delete process.env.npm_config_user_agent;
    delete process.env.DENO_VERSION;
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    if (savedUserAgent === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = savedUserAgent;
    }
    if (savedDenoVersion === undefined) {
      delete process.env.DENO_VERSION;
    } else {
      process.env.DENO_VERSION = savedDenoVersion;
    }
  });

  it("identifies pnpm from npm_config_user_agent", async () => {
    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: "pnpm/10.32.1 node/v22.0.0 darwin arm64",
    });

    expect(result).toEqual({
      packageManager: "pnpm",
      source: "user-agent",
      evidence: "pnpm/10.32.1 node/v22.0.0 darwin arm64",
    });
  });

  it.each([
    ["npm/10.8.2 node/v22.0.0 darwin x64", "npm"],
    ["yarn/4.5.0 npm/? node/v22.0.0 linux x64", "yarn"],
    ["bun/1.1.0", "bun"],
  ] as const)("identifies %s from user-agent", async (ua, expected) => {
    const result = await detectPackageManager({ cwd: tempRoot, userAgent: ua });

    expect(result.packageManager).toBe(expected);
    expect(result.source).toBe("user-agent");
  });

  it("identifies deno via DENO_VERSION when user-agent is absent", async () => {
    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: undefined,
      denoEnv: "2.0.0",
    });

    expect(result.packageManager).toBe("deno");
    expect(result.source).toBe("user-agent");
    expect(result.evidence).toBe("DENO_VERSION=2.0.0");
  });

  it("falls back to a lockfile when no user-agent is set", async () => {
    await writeFile(join(tempRoot, "yarn.lock"), "");

    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: undefined,
      denoEnv: undefined,
    });

    expect(result).toEqual({
      packageManager: "yarn",
      source: "lockfile",
      evidence: "yarn.lock",
    });
  });

  it("prefers pnpm-lock.yaml over package-lock.json when both exist", async () => {
    await writeFile(join(tempRoot, "pnpm-lock.yaml"), "");
    await writeFile(join(tempRoot, "package-lock.json"), "{}");

    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: undefined,
      denoEnv: undefined,
    });

    expect(result.packageManager).toBe("pnpm");
    expect(result.evidence).toBe("pnpm-lock.yaml");
  });

  it("detects bun via bun.lock", async () => {
    await writeFile(join(tempRoot, "bun.lock"), "");

    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: undefined,
      denoEnv: undefined,
    });

    expect(result.packageManager).toBe("bun");
  });

  it("returns the default when nothing matches", async () => {
    await mkdir(join(tempRoot, "src"), { recursive: true });

    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: undefined,
      denoEnv: undefined,
    });

    expect(result).toEqual({
      packageManager: DEFAULT_PACKAGE_MANAGER,
      source: "default",
    });
  });

  it("ignores unknown user-agent prefixes", async () => {
    const result = await detectPackageManager({
      cwd: tempRoot,
      userAgent: "ied/1.0.0 node/v22.0.0",
      denoEnv: undefined,
    });

    expect(result.packageManager).toBe(DEFAULT_PACKAGE_MANAGER);
    expect(result.source).toBe("default");
  });
});

describe("dlxCommand", () => {
  it("emits the canonical command for each supported package manager", () => {
    expect(dlxCommand("npm")).toBe("npx @tr-rtl/cli@latest");
    expect(dlxCommand("pnpm")).toBe("pnpm dlx @tr-rtl/cli@latest");
    expect(dlxCommand("yarn")).toBe("yarn dlx @tr-rtl/cli@latest");
    expect(dlxCommand("bun")).toBe("bunx @tr-rtl/cli@latest");
    expect(dlxCommand("deno")).toBe("deno run -A npm:@tr-rtl/cli@latest");
  });

  it("honours a custom version tag", () => {
    expect(dlxCommand("pnpm", "1.5.1")).toBe("pnpm dlx @tr-rtl/cli@1.5.1");
    expect(dlxCommand("deno", "1.5.1")).toBe(
      "deno run -A npm:@tr-rtl/cli@1.5.1"
    );
  });
});

describe("allDlxCommands", () => {
  it("includes every supported package manager", () => {
    const commands = allDlxCommands();
    for (const pm of SUPPORTED_PACKAGE_MANAGERS) {
      expect(commands[pm]).toBe(dlxCommand(pm));
    }
  });
});
