#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeBin = process.execPath
const installEntrypoint = join(rootDir, 'bin', 'install.js')
const globalCodexRoot = join(homedir(), '.codex')
const globalCodexSkillDirs = [
  join(globalCodexRoot, 'skills', '@tayo-dev', 'rtl-help'),
  join(globalCodexRoot, 'skills', '@tayo-dev', 'rtl-generate'),
  join(globalCodexRoot, 'skills', '@tayo-dev', 'rtl-conventions'),
  join(globalCodexRoot, 'skills', '@tayo-dev', 'rtl-mocks'),
]
const globalCodexManifestPath = join(globalCodexRoot, '@tayo-dev-rtl-manifest.json')

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

console.log('[tayo] Installing Codex skills locally...')
runInstall(['--codex', '--local'])

for (const skillDir of globalCodexSkillDirs) {
  console.log(`[tayo] Removing existing global Codex skill at ${skillDir}...`)
  await rm(skillDir, { recursive: true, force: true })
}

console.log(`[tayo] Removing existing global Codex manifest at ${globalCodexManifestPath}...`)
await rm(globalCodexManifestPath, { force: true })

console.log('[tayo] Installing Codex skills globally...')
runInstall(['--codex', '--global'])

console.log('[tayo] Codex build/install complete.')
