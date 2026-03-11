#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const scaffoldDirectories = [
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

for (const relativePath of scaffoldDirectories) {
  await mkdir(join(root, relativePath), { recursive: true })
}

console.log('[tayo] Structural scaffold verified.')
