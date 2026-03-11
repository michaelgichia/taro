import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureProjectStateDir,
  findReadableProjectStatePath,
  getProjectStatePath,
} from './project-state.js'

let projectRoot: string

beforeEach(async () => {
  projectRoot = join(tmpdir(), `taro-state-${Date.now()}`)
  await mkdir(projectRoot, { recursive: true })
})

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true })
})

describe('project state helpers', () => {
  it('creates the canonical .taro directory when no state exists', async () => {
    const stateDir = await ensureProjectStateDir(projectRoot)

    expect(stateDir).toBe(join(projectRoot, '.taro'))
    expect(await findReadableProjectStatePath(projectRoot, 'conventions.json')).toBeNull()
  })

  it('migrates the legacy .tayo directory into .taro', async () => {
    const legacyDir = join(projectRoot, '.tayo')
    await mkdir(legacyDir, { recursive: true })
    await writeFile(join(legacyDir, 'history.json'), '[]', 'utf-8')

    const stateDir = await ensureProjectStateDir(projectRoot)
    const historyPath = await findReadableProjectStatePath(projectRoot, 'history.json')

    expect(stateDir).toBe(join(projectRoot, '.taro'))
    expect(historyPath).toBe(getProjectStatePath(projectRoot, 'history.json'))
  })

  it('falls back to legacy state files before migration', async () => {
    const legacyDir = join(projectRoot, '.tayo')
    await mkdir(legacyDir, { recursive: true })
    await writeFile(join(legacyDir, 'conventions.json'), '{"importStyle":"esm"}', 'utf-8')

    expect(await findReadableProjectStatePath(projectRoot, 'conventions.json')).toBe(
      join(projectRoot, '.tayo', 'conventions.json')
    )
  })
})
