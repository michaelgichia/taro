import { access, copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveInstallTargets } from './resolver.js'
import type {
  InstallFileOperation,
  InstallLocation,
  InstallSelection,
  RuntimeLocationSelections,
  RuntimeTarget,
} from './types.js'
import { buildClaudeRuntimeOperations } from './runtimes/claude.js'
import { buildGeminiRuntimeOperations } from './runtimes/gemini.js'
import { buildOpenCodeRuntimeOperations } from './runtimes/opencode.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true }))
  )
})

function createSelection(runtime: RuntimeTarget, location: InstallLocation): InstallSelection {
  return {
    mode: 'non-interactive',
    runtimes: [runtime],
    locations: { [runtime]: location } as RuntimeLocationSelections,
    source: 'flags',
  }
}

async function createInstallContext(): Promise<{ cwd: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), 'taro-install-'))
  const cwd = join(root, 'project')
  const home = join(root, 'home')

  tempRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })

  return { cwd, home }
}

async function materializeOperations(operations: InstallFileOperation[]): Promise<void> {
  for (const operation of operations) {
    await mkdir(dirname(operation.targetPath), { recursive: true })
    await copyFile(operation.sourcePath, operation.targetPath)
  }
}

async function expectFile(path: string): Promise<string> {
  await access(path)
  return readFile(path, 'utf8')
}

function resolveTarget(runtime: RuntimeTarget, location: InstallLocation, cwd: string, home: string) {
  const [target] = resolveInstallTargets(createSelection(runtime, location), {
    cwd,
    home,
  })

  expect(target).toBeDefined()
  return target!
}

describe('prompt runtime install builders', () => {
  it('installs Claude Code assets into the global .claude command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('claude', 'global', cwd, home)

    const operations = buildClaudeRuntimeOperations(target)
    await materializeOperations(operations)

    const helpPath = join(home, '.claude', 'commands', '@tayo-dev', 'rtl', 'help.md')
    const helpContent = await expectFile(helpPath)

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@tayo-dev/rtl:help')
    expect(helpContent).toContain('/@tayo-dev/rtl:help')
  })

  it('installs Claude Code assets into the local .claude command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('claude', 'local', cwd, home)

    await materializeOperations(buildClaudeRuntimeOperations(target))

    await expectFile(join(cwd, '.claude', 'commands', '@tayo-dev', 'rtl', 'generate.md'))
  })

  it('installs Gemini CLI assets into the global .gemini command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('gemini', 'global', cwd, home)

    const operations = buildGeminiRuntimeOperations(target)
    await materializeOperations(operations)

    const helpContent = await expectFile(
      join(home, '.gemini', 'commands', '@tayo-dev', 'rtl', 'help.toml')
    )

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@tayo-dev/rtl:help')
    expect(helpContent).toContain('/@tayo-dev/rtl:help')
  })

  it('installs Gemini CLI assets into the local .gemini command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('gemini', 'local', cwd, home)

    await materializeOperations(buildGeminiRuntimeOperations(target))

    await expectFile(join(cwd, '.gemini', 'commands', '@tayo-dev', 'rtl', 'generate.toml'))
  })

  it('installs OpenCode assets into the global commands namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('opencode', 'global', cwd, home)

    const operations = buildOpenCodeRuntimeOperations(target)
    await materializeOperations(operations)

    const helpContent = await expectFile(
      join(home, '.config', 'opencode', 'commands', '@tayo-dev', 'rtl-help.md')
    )

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@tayo-dev/rtl-help')
    expect(helpContent).toContain('/@tayo-dev/rtl-help')
  })

  it('installs OpenCode assets into the local .opencode command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('opencode', 'local', cwd, home)

    await materializeOperations(buildOpenCodeRuntimeOperations(target))

    await expectFile(join(cwd, '.opencode', 'commands', '@tayo-dev', 'rtl-generate.md'))
  })
})
