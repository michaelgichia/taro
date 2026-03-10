import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { runInstallCommand } from './install.js'

const sandboxRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
  process.exitCode = undefined
})

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `tayo-cli-${label}-`))
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
    expect(output).toContain('/@tayo-dev/rtl:help (verified at')
    expect(output).toContain('/@tayo-dev/rtl-help (verified at')
    expect(output).toContain('$@tayo-dev/rtl-help (verified at')

    await expect(
      readFile(join(sandbox.home, '.codex', 'skills', '@tayo-dev', 'rtl-help', 'SKILL.md'), 'utf8')
    ).resolves.toContain('$@tayo-dev/rtl-help')
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
    expect(output).toContain('updated 2 owned asset(s)')
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

    await rm(join(sandbox.home, '.gemini', 'commands', '@tayo-dev', 'rtl', 'help.toml'), {
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
    expect(output).toContain('repaired 2 owned asset(s)')
  })
})
