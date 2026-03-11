#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeBin = process.execPath
const installEntrypoint = join(rootDir, 'bin', 'install.js')
const globalClaudePackageDir = join(homedir(), '.claude', 'commands', '@tayo-dev', 'rtl')

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

console.log('[tayo] Installing Claude commands locally...')
runInstall(['--claude', '--local'])

console.log(`[tayo] Removing existing global Claude commands at ${globalClaudePackageDir}...`)
await rm(globalClaudePackageDir, { recursive: true, force: true })

console.log('[tayo] Installing Claude commands globally...')
runInstall(['--claude', '--global'])

console.log('[tayo] Claude build/install complete.')
