#!/usr/bin/env node

import { access } from 'node:fs/promises'
import { join } from 'node:path'

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const projectRoot = process.cwd()
const hasConventions = await exists(join(projectRoot, '.tayo', 'conventions.json'))
const hasVisualState = await exists(join(projectRoot, '.tayo', 'visual'))

console.log(
  `Tayo | conventions:${hasConventions ? 'yes' : 'no'} | visual:${hasVisualState ? 'yes' : 'no'}`
)
