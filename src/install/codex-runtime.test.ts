import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveInstallTargets } from './resolver.js'
import { buildCodexOperations } from './runtimes/codex.js'
import type {
  InstallFileOperation,
  InstallLocation,
  InstallSelection,
  RuntimeLocationSelections,
} from './types.js'

const EXPECTED_SKILLS = [
  '@tayo-dev/rtl-conventions',
  '@tayo-dev/rtl-generate',
  '@tayo-dev/rtl-help',
  '@tayo-dev/rtl-mocks',
] as const
const EXPECTED_SKILL_DIRECTORIES = EXPECTED_SKILLS.map((skillName) => skillName.split('/')[1]!)
const sandboxRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true }))
  )
})

function createSelection(location: InstallLocation): InstallSelection {
  return {
    mode: 'non-interactive',
    runtimes: ['codex'],
    locations: { codex: location } as RuntimeLocationSelections,
    source: 'flags',
  }
}

async function createSandbox(label: string) {
  const rootPath = await mkdtemp(join(tmpdir(), `tayo-${label}-`))
  sandboxRoots.push(rootPath)

  const homePath = join(rootPath, 'home')
  const projectPath = join(rootPath, 'workspace', 'app')

  await mkdir(homePath, { recursive: true })
  await mkdir(projectPath, { recursive: true })

  return { rootPath, homePath, projectPath }
}

async function materializeOperations(operations: InstallFileOperation[]): Promise<void> {
  for (const operation of operations) {
    await mkdir(dirname(operation.targetPath), { recursive: true })
    await copyFile(operation.sourcePath, operation.targetPath)
  }
}

function resolveTarget(location: InstallLocation, cwd: string, home: string) {
  const [target] = resolveInstallTargets(createSelection(location), {
    cwd,
    home,
  })

  expect(target).toBeDefined()
  return target!
}

describe('buildCodexOperations', () => {
  it('installs multiple namespaced skill directories into the global Codex home', async () => {
    const sandbox = await createSandbox('codex-global')
    const target = resolveTarget('global', sandbox.projectPath, sandbox.homePath)
    const operations = buildCodexOperations(target)

    await materializeOperations(operations)

    expect(target.destinationDirectory).toBe(join(sandbox.homePath, '.codex'))

    const installedSkills = (await readdir(join(target.destinationDirectory, 'skills', '@tayo-dev'))).sort()
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES])

    const helpSkill = await readFile(
      join(target.destinationDirectory, 'skills', '@tayo-dev', 'rtl-help', 'SKILL.md'),
      'utf8'
    )
    expect(helpSkill).toContain('$@tayo-dev/rtl-help')
    expect(helpSkill).toContain('## Routing guide')
    expect(operations.map((operation) => operation.entrypoint)).toContain('$@tayo-dev/rtl-help')
  })

  it('installs the same packaged skill surface into a local .codex directory', async () => {
    const sandbox = await createSandbox('codex-local')
    const target = resolveTarget('local', sandbox.projectPath, sandbox.homePath)
    const operations = buildCodexOperations(target)

    await materializeOperations(operations)

    expect(target.destinationDirectory).toBe(join(sandbox.projectPath, '.codex'))

    const installedSkills = (await readdir(join(target.destinationDirectory, 'skills', '@tayo-dev'))).sort()
    expect(installedSkills).toEqual([...EXPECTED_SKILL_DIRECTORIES])

    const helpSkill = await readFile(
      join(target.destinationDirectory, 'skills', '@tayo-dev', 'rtl-help', 'SKILL.md'),
      'utf8'
    )
    expect(helpSkill).toContain('Invoke this skill with `$@tayo-dev/rtl-help`.')
    expect(helpSkill).toContain('Return:')

    const generateSkill = await readFile(
      join(target.destinationDirectory, 'skills', '@tayo-dev', 'rtl-generate', 'SKILL.md'),
      'utf8'
    )
    expect(generateSkill).toContain('Run `tayo __generate <recording-file>`')
    expect(generateSkill).toContain('## Post-run Review')
    expect(generateSkill).not.toContain('--dry-run')

    const conventionsSkill = await readFile(
      join(target.destinationDirectory, 'skills', '@tayo-dev', 'rtl-conventions', 'SKILL.md'),
      'utf8'
    )
    expect(conventionsSkill).toContain('## Investigation Workflow')

    const mocksSkillPath = join(
      target.destinationDirectory,
      'skills',
      '@tayo-dev',
      'rtl-mocks',
      'SKILL.md'
    )
    await access(mocksSkillPath)
    const mocksSkill = await readFile(mocksSkillPath, 'utf8')
    expect(mocksSkill).toContain('## Boundary Review Workflow')
  })
})
