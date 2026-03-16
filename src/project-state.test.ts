import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureProjectStateDir,
  findReadableProjectStatePath,
  getProjectStatePath,
} from '#project-state.ts'

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

  it('reuses the canonical .taro directory when it already exists', async () => {
    const stateDir = join(projectRoot, '.taro')
    await mkdir(stateDir, { recursive: true })
    await writeFile(join(stateDir, 'history.json'), '[]', 'utf-8')

    expect(await ensureProjectStateDir(projectRoot)).toBe(stateDir)
    expect(await findReadableProjectStatePath(projectRoot, 'history.json')).toBe(
      getProjectStatePath(projectRoot, 'history.json')
    )
  })

  it('returns null when the requested state file is missing', async () => {
    await ensureProjectStateDir(projectRoot)

    expect(await findReadableProjectStatePath(projectRoot, 'conventions.json')).toBeNull()
  })
})
