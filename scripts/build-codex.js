#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runInstallOrExit, shouldRunAsMain } from "./script-runtime-utils.js";

export { runInstallOrExit, shouldRunAsMain };

export function getCodexBuildPaths(rootDir, homeDirectory = homedir()) {
  const globalCodexRoot = join(homeDirectory, ".codex");
  const localCodexRoot = join(rootDir, ".codex");
  const currentNamespace = "@tr";
  const deprecatedNamespace = "@taro-dev";
  const legacyNamespace = "@tayo-dev";
  const currentManifestFileName = "@tr-rtl-manifest.json";
  const deprecatedManifestFileName = "@taro-dev-rtl-manifest.json";
  const legacyManifestFileName = "@tayo-dev-rtl-manifest.json";

  return {
    localCodexSkillNamespaceDir: join(
      localCodexRoot,
      "skills",
      currentNamespace
    ),
    deprecatedLocalCodexSkillNamespaceDir: join(
      localCodexRoot,
      "skills",
      deprecatedNamespace
    ),
    legacyLocalCodexSkillNamespaceDir: join(
      localCodexRoot,
      "skills",
      legacyNamespace
    ),
    globalCodexSkillNamespaceDir: join(
      globalCodexRoot,
      "skills",
      currentNamespace
    ),
    deprecatedGlobalCodexSkillNamespaceDir: join(
      globalCodexRoot,
      "skills",
      deprecatedNamespace
    ),
    legacyGlobalCodexSkillNamespaceDir: join(
      globalCodexRoot,
      "skills",
      legacyNamespace
    ),
    localCodexManifestPath: join(localCodexRoot, currentManifestFileName),
    deprecatedLocalCodexManifestPath: join(
      localCodexRoot,
      deprecatedManifestFileName
    ),
    legacyLocalCodexManifestPath: join(localCodexRoot, legacyManifestFileName),
    globalCodexManifestPath: join(globalCodexRoot, currentManifestFileName),
    deprecatedGlobalCodexManifestPath: join(
      globalCodexRoot,
      deprecatedManifestFileName
    ),
    legacyGlobalCodexManifestPath: join(
      globalCodexRoot,
      legacyManifestFileName
    ),
  };
}

export async function resolveGlobalCodexSkillDirs(options) {
  const {
    readdirImpl,
    localCodexSkillNamespaceDir,
    globalCodexSkillNamespaceDir,
  } = options;
  try {
    const entries = await readdirImpl(localCodexSkillNamespaceDir, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("rtl-"))
      .map((entry) => join(globalCodexSkillNamespaceDir, entry.name))
      .sort();
  } catch (error) {
    const fsError = error;
    if (
      fsError &&
      typeof fsError === "object" &&
      "code" in fsError &&
      fsError.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

export async function runCodexBuild(options = {}) {
  const rootDir =
    options.rootDir ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const nodeBin = options.nodeBin ?? process.execPath;
  const installEntrypoint =
    options.installEntrypoint ?? join(rootDir, "bin", "install.js");
  const env = options.env ?? process.env;
  const remove = options.rmImpl ?? rm;
  const log = options.log ?? console.log;
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const readdirImpl = options.readdirImpl ?? readdir;
  const exit = options.exit ?? process.exit;
  const paths = getCodexBuildPaths(rootDir, options.homeDir ?? homedir());

  log(
    `[taro] Removing existing local Codex skills at ${paths.localCodexSkillNamespaceDir}...`
  );
  await remove(paths.localCodexSkillNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing deprecated local Codex skills at ${paths.deprecatedLocalCodexSkillNamespaceDir}...`
  );
  await remove(paths.deprecatedLocalCodexSkillNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing legacy local Codex skills at ${paths.legacyLocalCodexSkillNamespaceDir}...`
  );
  await remove(paths.legacyLocalCodexSkillNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing existing local Codex manifest at ${paths.localCodexManifestPath}...`
  );
  await remove(paths.localCodexManifestPath, { force: true });
  log(
    `[taro] Removing deprecated local Codex manifest at ${paths.deprecatedLocalCodexManifestPath}...`
  );
  await remove(paths.deprecatedLocalCodexManifestPath, { force: true });
  log(
    `[taro] Removing legacy local Codex manifest at ${paths.legacyLocalCodexManifestPath}...`
  );
  await remove(paths.legacyLocalCodexManifestPath, { force: true });

  log("[taro] Installing Codex skills locally...");
  runInstallOrExit(["--codex", "--local"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  const globalCodexSkillDirs = await resolveGlobalCodexSkillDirs({
    readdirImpl,
    localCodexSkillNamespaceDir: paths.localCodexSkillNamespaceDir,
    globalCodexSkillNamespaceDir: paths.globalCodexSkillNamespaceDir,
  });

  for (const skillDir of globalCodexSkillDirs) {
    log(`[taro] Removing existing global Codex skill at ${skillDir}...`);
    await remove(skillDir, { recursive: true, force: true });
  }

  log(
    `[taro] Removing deprecated global Codex skills at ${paths.deprecatedGlobalCodexSkillNamespaceDir}...`
  );
  await remove(paths.deprecatedGlobalCodexSkillNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing legacy global Codex skills at ${paths.legacyGlobalCodexSkillNamespaceDir}...`
  );
  await remove(paths.legacyGlobalCodexSkillNamespaceDir, {
    recursive: true,
    force: true,
  });
  log(
    `[taro] Removing existing global Codex manifest at ${paths.globalCodexManifestPath}...`
  );
  await remove(paths.globalCodexManifestPath, { force: true });
  log(
    `[taro] Removing deprecated global Codex manifest at ${paths.deprecatedGlobalCodexManifestPath}...`
  );
  await remove(paths.deprecatedGlobalCodexManifestPath, { force: true });
  log(
    `[taro] Removing legacy global Codex manifest at ${paths.legacyGlobalCodexManifestPath}...`
  );
  await remove(paths.legacyGlobalCodexManifestPath, { force: true });

  log("[taro] Installing Codex skills globally...");
  runInstallOrExit(["--codex", "--global"], {
    spawnImpl,
    nodeBin,
    installEntrypoint,
    rootDir,
    env,
    exit,
  });

  log("[taro] Codex build/install complete.");
}

export async function main(options = {}) {
  await runCodexBuild(options);
}

/* v8 ignore next 3 -- exercised via the exported main() in tests */
if (shouldRunAsMain(process.argv[1], import.meta.url)) {
  await main();
}
