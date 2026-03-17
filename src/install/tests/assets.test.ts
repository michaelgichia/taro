import { describe, expect, it, vi } from 'vitest'

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}))

import { resolveAssetSource, resolvePackageRoot } from '#install/assets.ts'

describe('install assets', () => {
  it('walks upward until it finds the package root', () => {
    existsSyncMock.mockImplementation((path: string) => path === '/repo/package.json')

    expect(resolvePackageRoot('file:///repo/src/install/assets.ts')).toBe('/repo')
  })

  it('throws when no package root can be located', () => {
    existsSyncMock.mockReturnValue(false)

    expect(() => resolvePackageRoot('file:///orphan/src/install/assets.ts')).toThrow(
      'Unable to locate package root'
    )
  })

  it('resolves asset paths relative to the discovered package root', () => {
    existsSyncMock.mockImplementation((path: string) => path === '/repo/package.json')

    expect(resolveAssetSource(['assets', 'claude', 'help.md'], 'file:///repo/src/install/assets.ts')).toBe(
      '/repo/assets/claude/help.md'
    )
  })
})
