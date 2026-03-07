import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  analyzeMocks,
  deriveMockRecommendations,
  scanMockTargets,
} from './mock-intelligence.js'
import { scanConventions } from './scanner.js'

let testDir: string

beforeEach(async () => {
  testDir = join(tmpdir(), `taro-mock-intel-${Date.now()}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('scanMockTargets', () => {
  it('detects repeated mock targets across discovered tests', async () => {
    await writeFile(
      join(testDir, 'alpha.test.ts'),
      `vi.mock('./api/orders')\nvi.mock('./api/users')`
    )
    await writeFile(
      join(testDir, 'beta.test.ts'),
      `jest.mock('./api/orders')`
    )

    const targets = await scanMockTargets(testDir)

    expect(targets).toEqual([
      {
        target: './api/orders',
        files: ['alpha.test.ts', 'beta.test.ts'],
        count: 2,
      },
      {
        target: './api/users',
        files: ['alpha.test.ts'],
        count: 1,
      },
    ])
  })
})

describe('deriveMockRecommendations', () => {
  it('recommends extract for repeated targets and inline for one-off targets', () => {
    const recommendations = deriveMockRecommendations([
      { target: './api/orders', files: ['a.test.ts', 'b.test.ts'], count: 2 },
      { target: './api/users', files: ['a.test.ts'], count: 1 },
    ])

    expect(recommendations).toEqual([
      {
        target: './api/orders',
        files: ['a.test.ts', 'b.test.ts'],
        count: 2,
        kind: 'extract',
        reason: 'Mock target appears in multiple tests and should be shared',
      },
      {
        target: './api/users',
        files: ['a.test.ts'],
        count: 1,
        kind: 'inline',
        reason: 'Mock target appears in one place and can stay local to the test',
      },
    ])
  })
})

describe('analyzeMocks', () => {
  it('combines conventions and repeated-target analysis', async () => {
    await writeFile(
      join(testDir, 'alpha.test.ts'),
      `import { describe, it } from 'vitest'\nvi.mock('./api/orders')\ndescribe('x', () => { it('y', () => {}) })`
    )
    await writeFile(
      join(testDir, 'beta.test.ts'),
      `import { describe, it } from 'vitest'\nvi.mock('./api/orders')\nvi.mock('./api/users')\ndescribe('x', () => { it('y', () => {}) })`
    )
    await scanConventions(testDir)

    const analysis = await analyzeMocks(testDir)

    expect(analysis.conventions?.mockPattern).toBe('vi.mock')
    expect(analysis.repeatedTargets).toEqual([
      {
        target: './api/orders',
        files: ['alpha.test.ts', 'beta.test.ts'],
        count: 2,
      },
    ])
    expect(analysis.recommendations[0]).toEqual(
      expect.objectContaining({
        target: './api/orders',
        kind: 'extract',
      })
    )
  })
})
