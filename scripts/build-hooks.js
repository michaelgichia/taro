#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const scaffoldDirectories = [
  'agents',
  'assets',
  'bin',
  'commands',
  'docs',
  'taro/bin',
  'taro/references',
  'taro/templates',
  'taro/workflows',
  'hooks',
  'scripts',
]

export async function ensureStructuralScaffold(
  root = process.cwd(),
  options = {}
) {
  const {
    mkdirImpl = mkdir,
    log = console.log,
  } = options

  for (const relativePath of scaffoldDirectories) {
    await mkdirImpl(join(root, relativePath), { recursive: true })
  }

  log('[taro] Structural scaffold verified.')
}

export async function main() {
  await ensureStructuralScaffold()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
