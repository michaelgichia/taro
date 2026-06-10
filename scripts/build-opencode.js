#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runInstallOrExit, shouldRunAsMain } from "./script-runtime-utils.js";

export { runInstallOrExit, shouldRunAsMain };

export function getOpenCodeBuildPaths(rootDir, homeDirectory = homedir()) {
  const localOpenCodeRoot = join(rootDir, ".opencode");
  const globalOpenCodeRoot = join(homeDirectory, ".config", "opencode");

  return {
    localOpenCodeCommandNamespaceDir: join(
      localOpenCodeRoot,
      "commands",
      "@tr-rtl"
    ),
    globalOpenCodeCommandNamespaceDir: join(
      globalOpenCodeRoot,
      "commands",
      "@tr-rtl"
    ),
    localOpenCodeManifestPath: join(localOpenCodeRoot, "install-manifest.json"),
    globalOpenCodeManifestPath: join(
      globalOpenCodeRoot,
      "install-manifest.json"
    ),
  };
}

export async function runOpenCodeBuild(options = {}) {
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
  const paths = getOpenCodeBuildPaths(rootDir, options.homeDir ?? homedir());

  log(
    `[taro] Removing existing local OpenCode commands at ${paths.localOpenCodeCommandNamespaceDir}...`
  );
  await remove(paths.localOpenCodeCommandNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing existing local OpenCode manifest at ${paths.localOpenCodeManifestPath}...`
  );
  await remove(paths.localOpenCodeManifestPath, { force: true });

  log("[taro] Installing OpenCode commands locally...");
  runInstallOrExit(["--opencode", "--local"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  log(
    `[taro] Removing existing global OpenCode commands at ${paths.globalOpenCodeCommandNamespaceDir}...`
  );
  await remove(paths.globalOpenCodeCommandNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing existing global OpenCode manifest at ${paths.globalOpenCodeManifestPath}...`
  );
  await remove(paths.globalOpenCodeManifestPath, { force: true });

  log("[taro] Installing OpenCode commands globally...");
  runInstallOrExit(["--opencode", "--global"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  log("[taro] OpenCode build/install complete.");
}

if (shouldRunAsMain(process.argv[1], import.meta.url)) {
  await runOpenCodeBuild();
}
