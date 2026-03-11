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
const conventions = await readJson(
  (await findReadableStatePath(projectRoot, 'conventions.json')) ?? ''
)
const visualArtifacts = await readDirectory(
  (await findReadableStatePath(projectRoot, 'visual')) ?? ''
)

const importStyle =
  typeof conventions?.importStyle === 'string' ? conventions.importStyle : 'unlearned'

console.log(
  `[taro] context: importStyle=${importStyle}; visualArtifacts=${visualArtifacts.length}`
)
