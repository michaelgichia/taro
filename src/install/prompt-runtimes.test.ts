import { access, copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveInstallTargets } from './resolver.js'
import { TARO_REFERENCE_FILES } from './reference-files.js'
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
    if (operation.renderedContent != null) {
      await writeFile(operation.targetPath, operation.renderedContent)
    } else {
      await copyFile(operation.sourcePath, operation.targetPath)
    }
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

    const helpPath = join(home, '.claude', 'commands', '@taro-dev', 'rtl', 'help.md')
    const helpContent = await expectFile(helpPath)
    const initContent = await expectFile(
      join(home, '.claude', 'commands', '@taro-dev', 'rtl', 'init.md')
    )
    const refreshContent = await expectFile(
      join(home, '.claude', 'commands', '@taro-dev', 'rtl', 'refresh.md')
    )

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:help')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:init')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:refresh')
    expect(helpContent).toContain('/@taro-dev/rtl:help')
    expect(initContent).toContain(`${target.runtimeCommand} __init`)
    expect(refreshContent).toContain(`${target.runtimeCommand} __refresh`)
    expect(operations.map((operation) => operation.relativeDestinationPath)).toContain(
      'commands/@taro-dev/rtl/references/assertion-markers.md'
    )
  })

  it('installs Claude Code assets into the local .claude command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('claude', 'local', cwd, home)

    await materializeOperations(buildClaudeRuntimeOperations(target))

    const generateContent = await expectFile(
      join(cwd, '.claude', 'commands', '@taro-dev', 'rtl', 'generate.md')
    )
    expect(generateContent).toContain('allowed-tools:')
    expect(generateContent).toContain('references/assertion-markers.md')

    const installedGenerateReferences = (
      await readdir(join(cwd, '.claude', 'commands', '@taro-dev', 'rtl', 'references'))
    ).sort()
    expect(installedGenerateReferences).toEqual([...TARO_REFERENCE_FILES])
  })

  it('installs Gemini CLI assets into the global .gemini command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('gemini', 'global', cwd, home)

    const operations = buildGeminiRuntimeOperations(target)
    await materializeOperations(operations)

    const helpContent = await expectFile(
      join(home, '.gemini', 'commands', '@taro-dev', 'rtl', 'help.toml')
    )
    const initContent = await expectFile(
      join(home, '.gemini', 'commands', '@taro-dev', 'rtl', 'init.toml')
    )
    const refreshContent = await expectFile(
      join(home, '.gemini', 'commands', '@taro-dev', 'rtl', 'refresh.toml')
    )

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:help')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:init')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl:refresh')
    expect(helpContent).toContain('/@taro-dev/rtl:help')
    expect(initContent).toContain(`\`${target.runtimeCommand} __init\``)
    expect(refreshContent).toContain(`\`${target.runtimeCommand} __refresh\``)
  })

  it('installs Gemini CLI assets into the local .gemini command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('gemini', 'local', cwd, home)

    await materializeOperations(buildGeminiRuntimeOperations(target))

    const generateContent = await expectFile(
      join(cwd, '.gemini', 'commands', '@taro-dev', 'rtl', 'generate.toml')
    )
    expect(generateContent).toContain(`\`${target.runtimeCommand} __generate <recording-file>\``)
    expect(generateContent).not.toContain('--dry-run')
  })

  it('installs OpenCode assets into the global commands namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('opencode', 'global', cwd, home)

    const operations = buildOpenCodeRuntimeOperations(target)
    await materializeOperations(operations)

    const helpContent = await expectFile(
      join(home, '.config', 'opencode', 'commands', '@taro-dev', 'rtl-help.md')
    )
    const initContent = await expectFile(
      join(home, '.config', 'opencode', 'commands', '@taro-dev', 'rtl-init.md')
    )
    const refreshContent = await expectFile(
      join(home, '.config', 'opencode', 'commands', '@taro-dev', 'rtl-refresh.md')
    )

    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl-help')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl-init')
    expect(operations.map((operation) => operation.entrypoint)).toContain('/@taro-dev/rtl-refresh')
    expect(helpContent).toContain('/@taro-dev/rtl-help')
    expect(initContent).toContain(`${target.runtimeCommand} __init`)
    expect(refreshContent).toContain(`${target.runtimeCommand} __refresh`)
  })

  it('installs OpenCode assets into the local .opencode command namespace', async () => {
    const { cwd, home } = await createInstallContext()
    const target = resolveTarget('opencode', 'local', cwd, home)

    await materializeOperations(buildOpenCodeRuntimeOperations(target))

    const generateContent = await expectFile(
      join(cwd, '.opencode', 'commands', '@taro-dev', 'rtl-generate.md')
    )
    expect(generateContent).toContain(`\`${target.runtimeCommand} __generate <recording-file>\``)
    expect(generateContent).not.toContain('--dry-run')
  })
})
