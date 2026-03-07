import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeInstallPlan } from './executor.js'
import { buildInstallPlan } from './planner.js'
import { writeInstallPlan } from './writer.js'
import type { InstallSelection, RuntimeLocationSelections, RuntimeTarget } from './types.js'

const sandboxRoots: string[] = []
const FIXED_GENERATED_AT = '2026-03-07T20:55:00.000Z'

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-${label}-`))
  const cwd = join(root, 'project')
  const home = join(root, 'home')

  sandboxRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })

  return { cwd, home }
}

function createSelection(
  runtimes: RuntimeTarget[],
  location: 'global' | 'local'
): InstallSelection {
  return {
    mode: 'non-interactive',
    runtimes,
    locations: Object.fromEntries(
      runtimes.map((runtime) => [runtime, location])
    ) as RuntimeLocationSelections,
    source: 'flags',
  }
}

describe('executeInstallPlan', () => {
  it('writes all supported runtimes and ownership markers for --all --global', async () => {
    const { cwd, home } = await createSandbox('all-global')
    const plan = buildInstallPlan(
      createSelection(['claude', 'opencode', 'gemini', 'codex'], 'global'),
      { cwd, home }
    )

    const result = await executeInstallPlan(plan, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('installed')
    expect(result.targets.map((target) => target.runtime)).toEqual([
      'claude',
      'opencode',
      'gemini',
      'codex',
    ])

    await expect(readFile(join(home, '.claude', 'commands', '@tayo-dev', 'rtl', 'help.md'), 'utf8'))
      .resolves.toContain('/@tayo-dev/rtl:help')
    await expect(
      readFile(join(home, '.gemini', 'commands', '@tayo-dev', 'rtl', 'help.toml'), 'utf8')
    ).resolves.toContain('/@tayo-dev/rtl:help')
    await expect(
      readFile(join(home, '.config', 'opencode', 'commands', '@tayo-dev', 'rtl-help.md'), 'utf8')
    ).resolves.toContain('/@tayo-dev/rtl-help')
    await expect(
      readFile(join(home, '.codex', 'skills', '@tayo-dev', 'rtl-help', 'SKILL.md'), 'utf8')
    ).resolves.toContain('$@tayo-dev/rtl-help')

    await expect(readFile(join(home, '.claude', 'install-manifest.json'), 'utf8')).resolves.toContain(
      FIXED_GENERATED_AT
    )
    await expect(readFile(join(home, '.gemini', 'install-manifest.json'), 'utf8')).resolves.toContain(
      FIXED_GENERATED_AT
    )
    await expect(
      readFile(join(home, '.config', 'opencode', 'install-manifest.json'), 'utf8')
    ).resolves.toContain(FIXED_GENERATED_AT)
    await expect(
      readFile(join(home, '.codex', '@tayo-dev-rtl-manifest.json'), 'utf8')
    ).resolves.toContain(FIXED_GENERATED_AT)
  })
})

describe('writeInstallPlan conflict handling', () => {
  it('requires replace confirmation before overwriting unchanged installer-owned assets', async () => {
    const { cwd, home } = await createSandbox('replace-confirm')
    const plan = buildInstallPlan(createSelection(['claude'], 'global'), { cwd, home })
    const target = plan.targets[0]!

    await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    const secondPass = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })
    expect(secondPass.status).toBe('requires-replace-confirmation')

    const thirdPass = await writeInstallPlan(target, {
      generatedAt: FIXED_GENERATED_AT,
      confirmReplace: async () => true,
    })
    expect(thirdPass.status).toBe('installed')
  })

  it('protects user-edited installer assets instead of overwriting them', async () => {
    const { cwd, home } = await createSandbox('manual-edit')
    const plan = buildInstallPlan(createSelection(['claude'], 'global'), { cwd, home })
    const target = plan.targets[0]!
    const helpPath = join(home, '.claude', 'commands', '@tayo-dev', 'rtl', 'help.md')

    await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })
    await writeFile(helpPath, 'manual edit\n')

    const result = await writeInstallPlan(target, {
      generatedAt: FIXED_GENERATED_AT,
      confirmReplace: async () => true,
    })

    expect(result.status).toBe('blocked')
    expect(result.conflicts.map((conflict) => conflict.kind)).toContain('installer-owned-modified')
    await expect(readFile(helpPath, 'utf8')).resolves.toBe('manual edit\n')
  })

  it('blocks colliding non-Tayo files without mutating them', async () => {
    const { cwd, home } = await createSandbox('external-collision')
    const plan = buildInstallPlan(createSelection(['opencode'], 'global'), { cwd, home })
    const target = plan.targets[0]!
    const helpPath = join(home, '.config', 'opencode', 'commands', '@tayo-dev', 'rtl-help.md')

    await mkdir(join(home, '.config', 'opencode', 'commands', '@tayo-dev'), {
      recursive: true,
    })
    await writeFile(helpPath, 'external file\n')

    const result = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('blocked')
    expect(result.conflicts.map((conflict) => conflict.kind)).toContain('external-collision')
    await expect(readFile(helpPath, 'utf8')).resolves.toBe('external file\n')
  })
})
