#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeBin = process.execPath
const installEntrypoint = join(rootDir, 'bin', 'install.js')
const globalCodexRoot = join(homedir(), '.codex')
const localCodexRoot = join(rootDir, '.codex')
const currentNamespace = '@taro-test'
const deprecatedNamespace = '@taro-dev'
const legacyNamespace = '@tayo-dev'
const currentManifestFileName = '@taro-test-rtl-manifest.json'
const deprecatedManifestFileName = '@taro-dev-rtl-manifest.json'
const legacyManifestFileName = '@tayo-dev-rtl-manifest.json'
const localCodexSkillNamespaceDir = join(localCodexRoot, 'skills', currentNamespace)
const deprecatedLocalCodexSkillNamespaceDir = join(localCodexRoot, 'skills', deprecatedNamespace)
const legacyLocalCodexSkillNamespaceDir = join(localCodexRoot, 'skills', legacyNamespace)
const globalCodexSkillNamespaceDir = join(globalCodexRoot, 'skills', currentNamespace)
const deprecatedGlobalCodexSkillNamespaceDir = join(globalCodexRoot, 'skills', deprecatedNamespace)
const legacyGlobalCodexSkillNamespaceDir = join(globalCodexRoot, 'skills', legacyNamespace)
const localCodexManifestPath = join(localCodexRoot, currentManifestFileName)
const deprecatedLocalCodexManifestPath = join(localCodexRoot, deprecatedManifestFileName)
const legacyLocalCodexManifestPath = join(localCodexRoot, legacyManifestFileName)
const globalCodexManifestPath = join(globalCodexRoot, currentManifestFileName)
const deprecatedGlobalCodexManifestPath = join(globalCodexRoot, deprecatedManifestFileName)
const legacyGlobalCodexManifestPath = join(globalCodexRoot, legacyManifestFileName)

function runInstall(args) {
  const result = spawnSync(nodeBin, [installEntrypoint, ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function resolveGlobalCodexSkillDirs() {
  try {
    const entries = await readdir(localCodexSkillNamespaceDir, { withFileTypes: true })

    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('rtl-'))
      .map((entry) => join(globalCodexSkillNamespaceDir, entry.name))
      .sort()
  } catch (error) {
    const fsError = error
    if (fsError && typeof fsError === 'object' && 'code' in fsError && fsError.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

console.log(`[taro] Removing existing local Codex skills at ${localCodexSkillNamespaceDir}...`)
await rm(localCodexSkillNamespaceDir, { recursive: true, force: true })
console.log(
  `[taro] Removing deprecated local Codex skills at ${deprecatedLocalCodexSkillNamespaceDir}...`
)
await rm(deprecatedLocalCodexSkillNamespaceDir, { recursive: true, force: true })
console.log(`[taro] Removing legacy local Codex skills at ${legacyLocalCodexSkillNamespaceDir}...`)
await rm(legacyLocalCodexSkillNamespaceDir, { recursive: true, force: true })
console.log(`[taro] Removing existing local Codex manifest at ${localCodexManifestPath}...`)
await rm(localCodexManifestPath, { force: true })
console.log(
  `[taro] Removing deprecated local Codex manifest at ${deprecatedLocalCodexManifestPath}...`
)
await rm(deprecatedLocalCodexManifestPath, { force: true })
console.log(`[taro] Removing legacy local Codex manifest at ${legacyLocalCodexManifestPath}...`)
await rm(legacyLocalCodexManifestPath, { force: true })

console.log('[taro] Installing Codex skills locally...')
runInstall(['--codex', '--local'])

const globalCodexSkillDirs = await resolveGlobalCodexSkillDirs()

for (const skillDir of globalCodexSkillDirs) {
  console.log(`[taro] Removing existing global Codex skill at ${skillDir}...`)
  await rm(skillDir, { recursive: true, force: true })
}

console.log(
  `[taro] Removing deprecated global Codex skills at ${deprecatedGlobalCodexSkillNamespaceDir}...`
)
await rm(deprecatedGlobalCodexSkillNamespaceDir, { recursive: true, force: true })
console.log(`[taro] Removing legacy global Codex skills at ${legacyGlobalCodexSkillNamespaceDir}...`)
await rm(legacyGlobalCodexSkillNamespaceDir, { recursive: true, force: true })
console.log(`[taro] Removing existing global Codex manifest at ${globalCodexManifestPath}...`)
await rm(globalCodexManifestPath, { force: true })
console.log(
  `[taro] Removing deprecated global Codex manifest at ${deprecatedGlobalCodexManifestPath}...`
)
await rm(deprecatedGlobalCodexManifestPath, { force: true })
console.log(`[taro] Removing legacy global Codex manifest at ${legacyGlobalCodexManifestPath}...`)
await rm(legacyGlobalCodexManifestPath, { force: true })

console.log('[taro] Installing Codex skills globally...')
runInstall(['--codex', '--global'])

console.log('[taro] Codex build/install complete.')
