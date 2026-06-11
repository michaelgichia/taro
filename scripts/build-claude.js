#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runInstallOrExit, shouldRunAsMain } from "./script-runtime-utils.js";

export { runInstallOrExit, shouldRunAsMain };

export function getClaudeBuildPaths(rootDir, homeDirectory = homedir()) {
  const localCommandsRoot = join(rootDir, ".claude", "commands");
  const globalCommandsRoot = join(homeDirectory, ".claude", "commands");

  // current = the package's live namespace (matches the asset registry)
  // deprecated = the previous public namespace
  // legacy = the original pre-rename namespace
  const currentSegments = ["@tr-rtl", "cli"];
  const deprecatedSegments = ["@taro-dev", "rtl"];
  const legacySegments = ["@tayo-dev", "rtl"];

  return {
    localClaudePackageDir: join(localCommandsRoot, ...currentSegments),
    deprecatedLocalClaudePackageDir: join(
      localCommandsRoot,
      ...deprecatedSegments
    ),
    legacyLocalClaudePackageDir: join(localCommandsRoot, ...legacySegments),
    // Retained for backwards compatibility with callers that consumed the
    // pre-rename shape; lists the two pre-rename local namespaces only.
    localClaudePackageDirs: [
      join(localCommandsRoot, ...deprecatedSegments),
      join(localCommandsRoot, ...legacySegments),
    ],
    globalClaudePackageDir: join(globalCommandsRoot, ...currentSegments),
    deprecatedGlobalClaudePackageDir: join(
      globalCommandsRoot,
      ...deprecatedSegments
    ),
    legacyGlobalClaudePackageDir: join(globalCommandsRoot, ...legacySegments),
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

  log(
    `[taro] Removing existing local Claude commands at ${paths.localClaudePackageDir}...`
  );
  await remove(paths.localClaudePackageDir, { recursive: true, force: true });
  log(
    `[taro] Removing deprecated local Claude commands at ${paths.deprecatedLocalClaudePackageDir}...`
  );
  await remove(paths.deprecatedLocalClaudePackageDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing legacy local Claude commands at ${paths.legacyLocalClaudePackageDir}...`
  );
  await remove(paths.legacyLocalClaudePackageDir, {
    recursive: true,
    force: true,
  });

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
    `[taro] Removing deprecated global Claude commands at ${paths.deprecatedGlobalClaudePackageDir}...`
  );
  await remove(paths.deprecatedGlobalClaudePackageDir, {
    recursive: true,
    force: true,
  });
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
