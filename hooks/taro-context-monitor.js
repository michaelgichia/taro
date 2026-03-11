#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { findReadableStatePath } from './state-paths.js'

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function readDirectory(path) {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

const projectRoot = process.cwd()
const state = await readJson(
  (await findReadableStatePath(projectRoot, 'state.json')) ?? ''
)
const legacyConventions = state
  ? null
  : await readJson((await findReadableStatePath(projectRoot, 'conventions.json')) ?? '')
const visualArtifacts = await readDirectory(
  (await findReadableStatePath(projectRoot, 'visual')) ?? ''
)

const packageCount =
  state && typeof state === 'object' && state.packages && typeof state.packages === 'object'
    ? Object.keys(state.packages).length
    : 0
const importStyle =
  typeof state?.packages?.['.']?.importStyle?.value === 'string'
    ? state.packages['.'].importStyle.value
    : typeof legacyConventions?.importStyle === 'string'
      ? legacyConventions.importStyle
      : 'unlearned'

console.log(
  `[taro] context: packages=${packageCount}; importStyle=${importStyle}; visualArtifacts=${visualArtifacts.length}`
)
