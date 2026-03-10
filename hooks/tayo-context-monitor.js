#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

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
const conventions = await readJson(join(projectRoot, '.tayo', 'conventions.json'))
const visualArtifacts = await readDirectory(join(projectRoot, '.tayo', 'visual'))

const importStyle =
  typeof conventions?.importStyle === 'string' ? conventions.importStyle : 'unlearned'

console.log(
  `[tayo] context: importStyle=${importStyle}; visualArtifacts=${visualArtifacts.length}`
)
