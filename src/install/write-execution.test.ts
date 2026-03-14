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
  const packageRoot = join(root, 'package')

  sandboxRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })
  await mkdir(join(packageRoot, 'dist'), { recursive: true })
  await writeFile(
    join(packageRoot, 'dist', 'index.js'),
    "if (process.argv.includes('--version')) process.stdout.write('0.0.0\\n')\n"
  )

  return { cwd, home, packageRoot }
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
    const { cwd, home, packageRoot } = await createSandbox('all-global')
    const plan = buildInstallPlan(
      createSelection(['claude', 'opencode', 'gemini', 'codex'], 'global'),
      { cwd, home, packageRoot }
    )

    const result = await executeInstallPlan(plan, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('installed')
    expect(result.targets.map((target) => target.runtime)).toEqual([
      'claude',
      'opencode',
      'gemini',
      'codex',
    ])

    await expect(readFile(join(home, '.claude', 'commands', '@taro-test', 'rtl', 'help.md'), 'utf8'))
      .resolves.toContain('/@taro-test/rtl:help')
    await expect(
      readFile(join(home, '.gemini', 'commands', '@taro-test', 'rtl', 'help.toml'), 'utf8')
    ).resolves.toContain('/@taro-test/rtl:help')
    await expect(
      readFile(join(home, '.config', 'opencode', 'commands', '@taro-test', 'rtl-help.md'), 'utf8')
    ).resolves.toContain('/@taro-test/rtl-help')
    await expect(
      readFile(join(home, '.codex', 'skills', '@taro-test', 'rtl-help', 'SKILL.md'), 'utf8')
    ).resolves.toContain('$@taro-test/rtl-help')

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
      readFile(join(home, '.codex', '@taro-test-rtl-manifest.json'), 'utf8')
    ).resolves.toContain(FIXED_GENERATED_AT)
  })
})

describe('writeInstallPlan conflict handling', () => {
  it('refreshes unchanged installer-owned assets on rerun without manual cleanup', async () => {
    const { cwd, home, packageRoot } = await createSandbox('replace-confirm')
    const plan = buildInstallPlan(createSelection(['claude'], 'global'), {
      cwd,
      home,
      packageRoot,
    })
    const target = plan.targets[0]!

    await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    const secondPass = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })
    expect(secondPass.status).toBe('updated')
  })

  it('repairs missing owned assets when the manifest proves ownership', async () => {
    const { cwd, home, packageRoot } = await createSandbox('repair-missing')
    const plan = buildInstallPlan(createSelection(['gemini'], 'global'), {
      cwd,
      home,
      packageRoot,
    })
    const target = plan.targets[0]!
    const helpPath = join(home, '.gemini', 'commands', '@taro-test', 'rtl', 'help.toml')

    await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })
    await rm(helpPath, { force: true })

    const result = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('repaired')
    await expect(readFile(helpPath, 'utf8')).resolves.toContain('/@taro-test/rtl:help')
  })

  it('protects user-edited installer assets instead of overwriting them', async () => {
    const { cwd, home, packageRoot } = await createSandbox('manual-edit')
    const plan = buildInstallPlan(createSelection(['claude'], 'global'), {
      cwd,
      home,
      packageRoot,
    })
    const target = plan.targets[0]!
    const helpPath = join(home, '.claude', 'commands', '@taro-test', 'rtl', 'help.md')

    await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })
    await writeFile(helpPath, 'manual edit\n')

    const result = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('blocked')
    expect(result.conflicts.map((conflict) => conflict.kind)).toContain('installer-owned-modified')
    await expect(readFile(helpPath, 'utf8')).resolves.toBe('manual edit\n')
  })

  it('blocks colliding non-Taro files without mutating them', async () => {
    const { cwd, home, packageRoot } = await createSandbox('external-collision')
    const plan = buildInstallPlan(createSelection(['opencode'], 'global'), {
      cwd,
      home,
      packageRoot,
    })
    const target = plan.targets[0]!
    const helpPath = join(home, '.config', 'opencode', 'commands', '@taro-test', 'rtl-help.md')

    await mkdir(join(home, '.config', 'opencode', 'commands', '@taro-test'), {
      recursive: true,
    })
    await writeFile(helpPath, 'external file\n')

    const result = await writeInstallPlan(target, { generatedAt: FIXED_GENERATED_AT })

    expect(result.status).toBe('blocked')
    expect(result.conflicts.map((conflict) => conflict.kind)).toContain('external-collision')
    await expect(readFile(helpPath, 'utf8')).resolves.toBe('external file\n')
  })
})
