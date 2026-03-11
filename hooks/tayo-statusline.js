#!/usr/bin/env node

import { findReadableStatePath } from './state-paths.js'

const projectRoot = process.cwd()
const hasConventions = (await findReadableStatePath(projectRoot, 'conventions.json')) !== null
const hasVisualState = (await findReadableStatePath(projectRoot, 'visual')) !== null

console.log(
  `Taro | conventions:${hasConventions ? 'yes' : 'no'} | visual:${hasVisualState ? 'yes' : 'no'}`
)
