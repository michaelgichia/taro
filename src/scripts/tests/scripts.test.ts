import { createRequire } from 'node:module'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  getClaudeBuildPaths,
  runClaudeBuild,
} from '../../../scripts/build-claude.js'
import {
  getCodexBuildPaths,
  main as codexMain,
  resolveGlobalCodexSkillDirs,
  runCodexBuild,
  runInstallOrExit,
  shouldRunAsMain,
} from '../../../scripts/build-codex.js'
import {
  ensureStructuralScaffold,
  main as buildHooksMain,
  scaffoldDirectories,
} from '../../../scripts/build-hooks.js'

const require = createRequire(import.meta.url)
const { buildVitestArgs, runVitest } = require('../../../scripts/run-tests.cjs')
const {
  cleanSubject,
  detectRepoUrl,
  determineRange,
  generateChangelog,
  normalizeRepoUrl,
  parseArgs,
} = require('../../../scripts/generate-changelog.cjs')

describe('build-hooks.js', () => {
  it('creates the expected scaffold directories and logs completion', async () => {
    const mkdirImpl = vi.fn(async () => undefined)
    const log = vi.fn()

    await ensureStructuralScaffold('/repo', { mkdirImpl, log })

    expect(mkdirImpl).toHaveBeenCalledTimes(scaffoldDirectories.length)
    expect(mkdirImpl).toHaveBeenNthCalledWith(
      1,
      join('/repo', scaffoldDirectories[0]),
      { recursive: true }
    )
    expect(mkdirImpl).toHaveBeenLastCalledWith(
      join('/repo', scaffoldDirectories.at(-1) ?? ''),
      { recursive: true }
    )
    expect(log).toHaveBeenCalledWith('[taro] Structural scaffold verified.')
  })

  it('delegates main() to ensureStructuralScaffold', async () => {
    const mkdirImpl = vi.fn(async () => undefined)
    const log = vi.fn()

    await buildHooksMain('/repo', {
      mkdirImpl,
      log,
    })

    expect(mkdirImpl).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[taro] Structural scaffold verified.')
  })
})

describe('build-claude.js', () => {
  it('builds local and global Claude commands after removing legacy directories', async () => {
    const rmImpl = vi.fn(async () => undefined)
    const spawnImpl = vi.fn(() => ({ status: 0 }))
    const log = vi.fn()
    const exit = vi.fn()

    await runClaudeBuild({
      rootDir: '/repo',
      homeDir: '/home/tester',
      installEntrypoint: '/repo/bin/install.js',
      nodeBin: '/node',
      env: { TEST: '1' },
      rmImpl,
      spawnImpl,
      log,
      exit,
    })

    const paths = getClaudeBuildPaths('/repo', '/home/tester')
    expect(rmImpl).toHaveBeenCalledWith(paths.localClaudePackageDirs[0], {
      recursive: true,
      force: true,
    })
    expect(rmImpl).toHaveBeenCalledWith(paths.localClaudePackageDirs[1], {
      recursive: true,
      force: true,
    })
    expect(rmImpl).toHaveBeenCalledWith(paths.globalClaudePackageDir, {
      recursive: true,
      force: true,
    })
    expect(rmImpl).toHaveBeenCalledWith(paths.legacyGlobalClaudePackageDir, {
      recursive: true,
      force: true,
    })
    expect(spawnImpl).toHaveBeenNthCalledWith(
      1,
      '/node',
      ['/repo/bin/install.js', '--claude', '--local'],
      expect.objectContaining({ cwd: '/repo', env: { TEST: '1' }, stdio: 'inherit' })
    )
    expect(spawnImpl).toHaveBeenNthCalledWith(
      2,
      '/node',
      ['/repo/bin/install.js', '--claude', '--global'],
      expect.objectContaining({ cwd: '/repo', env: { TEST: '1' }, stdio: 'inherit' })
    )
    expect(exit).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[taro] Claude build/install complete.')
  })

  it('exits when an install step fails', async () => {
    const exitError = new Error('exit:7')
    const exit = vi.fn(() => {
      throw exitError
    })

    await expect(
      runClaudeBuild({
        rootDir: '/repo',
        homeDir: '/home/tester',
        installEntrypoint: '/repo/bin/install.js',
        nodeBin: '/node',
        rmImpl: vi.fn(async () => undefined),
        spawnImpl: vi.fn(() => ({ status: 7 })),
        log: vi.fn(),
        exit,
      })
    ).rejects.toBe(exitError)
    expect(exit).toHaveBeenCalledWith(7)
  })
})

describe('build-codex.js', () => {
  it('exits with status 1 when an install step returns no status code', () => {
    const exit = vi.fn()

    runInstallOrExit(['--codex', '--local'], {
      spawnImpl: vi.fn(() => ({ status: null })),
      nodeBin: '/node',
      installEntrypoint: '/repo/bin/install.js',
      rootDir: '/repo',
      env: {},
      exit,
    })

    expect(exit).toHaveBeenCalledWith(1)
  })

  it('resolves global skill directories from local installed skill names', async () => {
    const readdirImpl = vi.fn(async () => [
      { name: 'rtl-generate', isDirectory: () => true },
      { name: 'rtl-help', isDirectory: () => true },
      { name: 'notes', isDirectory: () => false },
      { name: 'other-skill', isDirectory: () => true },
    ])

    await expect(
      resolveGlobalCodexSkillDirs({
        readdirImpl,
        localCodexSkillNamespaceDir: '/repo/.codex/skills/@taro-test',
        globalCodexSkillNamespaceDir: '/home/.codex/skills/@taro-test',
      })
    ).resolves.toEqual([
      '/home/.codex/skills/@taro-test/rtl-generate',
      '/home/.codex/skills/@taro-test/rtl-help',
    ])
  })

  it('treats a missing local skill directory as no global skill removals', async () => {
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const readdirImpl = vi.fn(async () => {
      throw error
    })

    await expect(
      resolveGlobalCodexSkillDirs({
        readdirImpl,
        localCodexSkillNamespaceDir: '/repo/.codex/skills/@taro-test',
        globalCodexSkillNamespaceDir: '/home/.codex/skills/@taro-test',
      })
    ).resolves.toEqual([])
  })

  it('rethrows unexpected readdir failures when resolving global skill directories', async () => {
    const error = new Error('permission denied')

    await expect(
      resolveGlobalCodexSkillDirs({
        readdirImpl: vi.fn(async () => {
          throw error
        }),
        localCodexSkillNamespaceDir: '/repo/.codex/skills/@taro-test',
        globalCodexSkillNamespaceDir: '/home/.codex/skills/@taro-test',
      })
    ).rejects.toBe(error)
  })

  it('removes local/global Codex assets and runs local then global installs', async () => {
    const rmImpl = vi.fn(async () => undefined)
    const spawnImpl = vi.fn(() => ({ status: 0 }))
    const log = vi.fn()
    const exit = vi.fn()
    const readdirImpl = vi.fn(async () => [
      { name: 'rtl-generate', isDirectory: () => true },
    ])

    await runCodexBuild({
      rootDir: '/repo',
      homeDir: '/home/tester',
      installEntrypoint: '/repo/bin/install.js',
      nodeBin: '/node',
      env: { TEST: '1' },
      rmImpl,
      spawnImpl,
      readdirImpl,
      log,
      exit,
    })

    const paths = getCodexBuildPaths('/repo', '/home/tester')
    expect(rmImpl).toHaveBeenCalledWith(paths.localCodexSkillNamespaceDir, {
      recursive: true,
      force: true,
    })
    expect(rmImpl).toHaveBeenCalledWith(paths.localCodexManifestPath, {
      force: true,
    })
    expect(rmImpl).toHaveBeenCalledWith(
      '/home/tester/.codex/skills/@taro-test/rtl-generate',
      { recursive: true, force: true }
    )
    expect(spawnImpl).toHaveBeenNthCalledWith(
      1,
      '/node',
      ['/repo/bin/install.js', '--codex', '--local'],
      expect.objectContaining({ cwd: '/repo', env: { TEST: '1' }, stdio: 'inherit' })
    )
    expect(spawnImpl).toHaveBeenNthCalledWith(
      2,
      '/node',
      ['/repo/bin/install.js', '--codex', '--global'],
      expect.objectContaining({ cwd: '/repo', env: { TEST: '1' }, stdio: 'inherit' })
    )
    expect(exit).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[taro] Codex build/install complete.')
  })

  it('exposes CLI detection and main() without changing build behavior', async () => {
    expect(shouldRunAsMain('/repo/scripts/build-codex.js', 'file:///repo/scripts/build-codex.js')).toBe(
      true
    )
    expect(shouldRunAsMain('/repo/scripts/build-codex.js', 'file:///repo/scripts/other.js')).toBe(
      false
    )

    const log = vi.fn()
    const rmImpl = vi.fn(async () => undefined)
    const spawnImpl = vi.fn(() => ({ status: 0 }))

    await codexMain({
      rootDir: '/repo',
      homeDir: '/home/tester',
      installEntrypoint: '/repo/bin/install.js',
      nodeBin: '/node',
      env: { TEST: '1' },
      rmImpl,
      readdirImpl: vi.fn(async () => []),
      spawnImpl,
      log,
      exit: vi.fn(),
    })

    expect(log).toHaveBeenCalledWith('[taro] Codex build/install complete.')
  })
})

describe('run-tests.cjs', () => {
  it('builds default Vitest arguments when no targets are provided', () => {
    expect(buildVitestArgs([], { vitestCli: '/repo/node_modules/vitest/vitest.mjs' })).toEqual([
      '/repo/node_modules/vitest/vitest.mjs',
      'src',
      'tests',
    ])
  })

  it('preserves the run subcommand and forwarded arguments', () => {
    expect(
      buildVitestArgs(['run', '--coverage'], {
        vitestCli: '/repo/node_modules/vitest/vitest.mjs',
      })
    ).toEqual(['/repo/node_modules/vitest/vitest.mjs', 'run', '--coverage'])
  })

  it('exits with the child process status', () => {
    const exit = vi.fn()
    const spawnImpl = vi.fn(() => ({ status: 3 }))

    runVitest(['watch', 'src/core'], {
      vitestCli: '/repo/node_modules/vitest/vitest.mjs',
      execPath: '/node',
      spawnImpl,
      exit,
    })

    expect(spawnImpl).toHaveBeenCalledWith(
      '/node',
      ['/repo/node_modules/vitest/vitest.mjs', 'watch', 'src/core'],
      { stdio: 'inherit' }
    )
    expect(exit).toHaveBeenCalledWith(3)
  })
})

describe('generate-changelog.cjs', () => {
  it('normalizes GitHub SSH and git+ URLs', () => {
    expect(normalizeRepoUrl('git+https://github.com/acme/repo.git')).toBe(
      'https://github.com/acme/repo'
    )
    expect(normalizeRepoUrl('git@github.com:acme/repo.git')).toBe(
      'https://github.com/acme/repo'
    )
  })

  it('parses explicit range arguments', () => {
    expect(parseArgs(['--from', 'v1.0.0', '--to', 'v1.1.0'])).toEqual({
      from: 'v1.0.0',
      to: 'v1.1.0',
    })
  })

  it('keeps default range values when flags are missing values', () => {
    expect(parseArgs(['--from', '--to'])).toEqual({
      from: '--to',
      to: 'HEAD',
    })
  })

  it('falls back to remote.origin.url when origin get-url is unavailable', () => {
    const execImpl = vi.fn((command) => {
      if (command === 'git remote get-url origin') {
        throw new Error('missing origin')
      }
      if (command === 'git config --get remote.origin.url') {
        return 'git@github.com:acme/repo.git'
      }
      throw new Error(`unexpected command: ${command}`)
    })

    expect(detectRepoUrl(execImpl)).toBe('https://github.com/acme/repo')
  })

  it('determines the previous-tag range when HEAD is tagged', () => {
    const execImpl = vi.fn((command) => {
      if (command === 'git tag --points-at HEAD') return 'v1.2.0'
      if (command === 'git describe --tags --abbrev=0 HEAD^') return 'v1.1.0'
      throw new Error(`unexpected command: ${command}`)
    })

    expect(determineRange({ from: '', to: 'HEAD' }, execImpl)).toEqual({
      from: 'v1.1.0',
      to: 'v1.2.0',
      heading: '### Changes in v1.2.0\n',
    })
  })

  it('uses the explicit to ref when --from and --to are both provided', () => {
    const execImpl = vi.fn()

    expect(determineRange({ from: 'v1.0.0', to: 'v1.1.0' }, execImpl)).toEqual({
      from: 'v1.0.0',
      to: 'v1.1.0',
      heading: '### Changes in v1.1.0\n',
    })
  })

  it('throws when HEAD is tagged but no previous tag can be found', () => {
    const execImpl = vi.fn((command) => {
      if (command === 'git tag --points-at HEAD') return 'v1.2.0'
      if (command === 'git describe --tags --abbrev=0 HEAD^') return ''
      throw new Error(`unexpected command: ${command}`)
    })

    expect(() => determineRange({ from: '', to: 'HEAD' }, execImpl)).toThrow(
      'Could not find a previous tag before v1.2.0.'
    )
  })

  it('falls back to the merge commit subject when the commit body has no extracted title', () => {
    const execImpl = vi.fn(() => 'Merge pull request #12 from branch')

    expect(
      cleanSubject('abc123', 'Merge pull request #12 from branch', execImpl)
    ).toBe('Merge pull request #12 from branch')
  })

  it('prints categorized changelog entries and deduplicates repeated subjects', () => {
    const logs = []
    const execImpl = vi.fn((command) => {
      switch (command) {
        case 'git remote get-url origin':
          return 'https://github.com/acme/repo.git'
        case 'git tag --points-at HEAD':
          return ''
        case 'git describe --tags --abbrev=0':
          return 'v1.0.0'
        case 'git log v1.0.0..HEAD --pretty=format:"%h|%s"':
          return [
            'aaa111|feat: add coverage support (#12)',
            'bbb222|fix: restore fixture (#13)',
            'ccc333|docs: update readme',
            'ddd444|feat: add coverage support (#12)',
          ].join('\n')
        default:
          throw new Error(`unexpected command: ${command}`)
      }
    })

    generateChangelog([], {
      execImpl,
      log: (line) => logs.push(line),
      error: vi.fn(),
      exit: vi.fn(),
    })

    expect(logs).toContain('### Changes since v1.0.0\n')
    expect(logs).toContain('#### Added')
    expect(logs).toContain(
      '- feat: add coverage support ([aaa111](https://github.com/acme/repo/commit/aaa111)) [PR #12](https://github.com/acme/repo/pull/12)'
    )
    expect(logs).toContain('#### Fixed')
    expect(logs).toContain('#### Changed')
    expect(
      logs.filter((line) => String(line).includes('feat: add coverage support'))
    ).toHaveLength(1)
  })

  it('exits with status 0 when there are no new commits in the requested range', () => {
    const exit = vi.fn()
    const log = vi.fn()
    const execImpl = vi.fn((command) => {
      switch (command) {
        case 'git remote get-url origin':
          return 'https://github.com/acme/repo.git'
        case 'git tag --points-at HEAD':
          return ''
        case 'git describe --tags --abbrev=0':
          return 'v1.0.0'
        case 'git log v1.0.0..HEAD --pretty=format:"%h|%s"':
          return ''
        default:
          throw new Error(`unexpected command: ${command}`)
      }
    })

    generateChangelog([], { execImpl, log, error: vi.fn(), exit })

    expect(log).toHaveBeenCalledWith('No new changes found between v1.0.0 and HEAD.')
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('reports repository detection failures through the error logger', () => {
    const error = vi.fn()
    const exit = vi.fn()
    const execImpl = vi.fn(() => {
      throw new Error('missing origin')
    })

    generateChangelog([], { execImpl, log: vi.fn(), error, exit })

    expect(error).toHaveBeenCalledWith(
      'Could not detect repository URL from git remote "origin".'
    )
    expect(exit).toHaveBeenCalledWith(1)
  })
})
