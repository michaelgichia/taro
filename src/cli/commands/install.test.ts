import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRuntimeCommand } from '../../install/runtime-launcher.js'
import { runInstallCommand } from './install.js'

const sandboxRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
  process.exitCode = undefined
})

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-cli-${label}-`))
  const cwd = join(root, 'project')
  const home = join(root, 'home')

  sandboxRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })

  return { cwd, home }
}

function createLogger() {
  const logs: string[] = []
  const errors: string[] = []

  return {
    logs,
    errors,
    logger: {
      log: (value: string) => logs.push(value),
      error: (value: string) => errors.push(value),
    },
  }
}

describe('runInstallCommand', () => {
  it('installs all runtimes and reports verification commands', async () => {
    const sandbox = await createSandbox('all-global')
    const { logs, logger } = createLogger()

    await runInstallCommand(
      { all: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        logger,
      }
    )

    const output = logs.join('\n')

    expect(process.exitCode).toBeUndefined()
    expect(output).toContain('Install complete.')
    expect(output).toContain('/@taro-dev/rtl:help (verified at')
    expect(output).toContain('/@taro-dev/rtl-help (verified at')
    expect(output).toContain('$@taro-dev/rtl-help (verified at')

    const runtimeCommand = buildRuntimeCommand(
      process.execPath,
      join(process.cwd(), 'dist', 'index.js')
    )

    await expect(
      readFile(join(sandbox.home, '.codex', 'skills', '@taro-dev', 'rtl-help', 'SKILL.md'), 'utf8')
    ).resolves.toContain('$@taro-dev/rtl-help')
    await expect(
      readFile(join(sandbox.home, '.claude', 'commands', '@taro-dev', 'rtl', 'init.md'), 'utf8')
    ).resolves.toContain(`${runtimeCommand} __init`)
    await expect(
      readFile(join(sandbox.home, '.claude', 'commands', '@taro-dev', 'rtl', 'refresh.md'), 'utf8')
    ).resolves.toContain(`${runtimeCommand} __refresh`)
    await expect(
      readFile(join(sandbox.home, '.codex', 'skills', '@taro-dev', 'rtl-init', 'SKILL.md'), 'utf8')
    ).resolves.toContain('$@taro-dev/rtl-init')
    await expect(
      readFile(
        join(sandbox.home, '.codex', 'skills', '@taro-dev', 'rtl-refresh', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('$@taro-dev/rtl-refresh')
  })

  it('reports update results on rerun in non-interactive mode', async () => {
    const sandbox = await createSandbox('replace')
    const firstRun = createLogger()
    const secondRun = createLogger()

    await runInstallCommand(
      { claude: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        logger: firstRun.logger,
      }
    )

    process.exitCode = undefined

    await runInstallCommand(
      { claude: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        logger: secondRun.logger,
      }
    )

    const output = secondRun.logs.join('\n')

    expect(process.exitCode).toBeUndefined()
    expect(output).toMatch(/updated \d+ owned asset\(s\)/)
  })

  it('reports repaired outcomes when a rerun restores a missing owned asset', async () => {
    const sandbox = await createSandbox('repair')
    const firstRun = createLogger()
    const secondRun = createLogger()

    await runInstallCommand(
      { gemini: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        logger: firstRun.logger,
      }
    )

    await rm(join(sandbox.home, '.gemini', 'commands', '@taro-dev', 'rtl', 'help.toml'), {
      force: true,
    })
    process.exitCode = undefined

    await runInstallCommand(
      { gemini: true, global: true },
      {
        cwd: sandbox.cwd,
        home: sandbox.home,
        logger: secondRun.logger,
      }
    )

    const output = secondRun.logs.join('\n')

    expect(process.exitCode).toBeUndefined()
    expect(output).toMatch(/repaired \d+ owned asset\(s\)/)
  })
})
