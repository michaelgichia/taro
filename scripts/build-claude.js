#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeBin = process.execPath
const installEntrypoint = join(rootDir, 'bin', 'install.js')
const localClaudePackageDirs = [
  join(rootDir, '.claude', 'commands', '@taro-dev', 'rtl'),
  join(rootDir, '.claude', 'commands', '@tayo-dev', 'rtl'),
]
const globalClaudePackageDir = join(homedir(), '.claude', 'commands', '@taro-dev', 'rtl')
const legacyGlobalClaudePackageDir = join(homedir(), '.claude', 'commands', '@tayo-dev', 'rtl')

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

for (const localClaudePackageDir of localClaudePackageDirs) {
  console.log(`[taro] Removing existing local Claude commands at ${localClaudePackageDir}...`)
  await rm(localClaudePackageDir, { recursive: true, force: true })
}

console.log('[taro] Installing Claude commands locally...')
runInstall(['--claude', '--local'])

console.log(`[taro] Removing existing global Claude commands at ${globalClaudePackageDir}...`)
await rm(globalClaudePackageDir, { recursive: true, force: true })
console.log(`[taro] Removing legacy global Claude commands at ${legacyGlobalClaudePackageDir}...`)
await rm(legacyGlobalClaudePackageDir, { recursive: true, force: true })

console.log('[taro] Installing Claude commands globally...')
runInstall(['--claude', '--global'])

console.log('[taro] Claude build/install complete.')
