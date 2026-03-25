#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runInstallOrExit, shouldRunAsMain } from "./script-runtime-utils.js";

export { runInstallOrExit, shouldRunAsMain };

export function getClaudeBuildPaths(rootDir, homeDirectory = homedir()) {
  return {
    localClaudePackageDirs: [
      join(rootDir, ".claude", "commands", "@taro-dev", "rtl"),
      join(rootDir, ".claude", "commands", "@tayo-dev", "rtl"),
    ],
    globalClaudePackageDir: join(
      homeDirectory,
      ".claude",
      "commands",
      "@taro-dev",
      "rtl"
    ),
    legacyGlobalClaudePackageDir: join(
      homeDirectory,
      ".claude",
      "commands",
      "@tayo-dev",
      "rtl"
    ),
  };
}

export async function runClaudeBuild(options = {}) {
  const rootDir =
    options.rootDir ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const nodeBin = options.nodeBin ?? process.execPath;
  const installEntrypoint =
    options.installEntrypoint ?? join(rootDir, "bin", "install.js");
  const env = options.env ?? process.env;
  const remove = options.rmImpl ?? rm;
  const log = options.log ?? console.log;
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const exit = options.exit ?? process.exit;
  const paths = getClaudeBuildPaths(rootDir, options.homeDir ?? homedir());

  for (const localClaudePackageDir of paths.localClaudePackageDirs) {
    log(
      `[taro] Removing existing local Claude commands at ${localClaudePackageDir}...`
    );
    await remove(localClaudePackageDir, { recursive: true, force: true });
  }

  log("[taro] Installing Claude commands locally...");
  runInstallOrExit(["--claude", "--local"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  log(
    `[taro] Removing existing global Claude commands at ${paths.globalClaudePackageDir}...`
  );
  await remove(paths.globalClaudePackageDir, { recursive: true, force: true });
  log(
    `[taro] Removing legacy global Claude commands at ${paths.legacyGlobalClaudePackageDir}...`
  );
  await remove(paths.legacyGlobalClaudePackageDir, {
    recursive: true,
    force: true,
  });

  log("[taro] Installing Claude commands globally...");
  runInstallOrExit(["--claude", "--global"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  log("[taro] Claude build/install complete.");
}

if (shouldRunAsMain(process.argv[1], import.meta.url)) await runClaudeBuild();
