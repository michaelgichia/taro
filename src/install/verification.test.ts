import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildInstallPlan } from './planner.js'
import { verifyInstalledRuntime } from './verification.js'
import { executeInstallPlan } from './executor.js'
import type { InstallSelection, RuntimeLocationSelections, RuntimeTarget } from './types.js'

const execFileAsync = promisify(execFile)
const sandboxRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-verify-${label}-`))
  const cwd = join(root, 'project')
  const home = join(root, 'home')

  sandboxRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })

  return { root, cwd, home }
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

describe('verifyInstalledRuntime', () => {
  it('verifies the documented runtime entrypoints after installation', async () => {
    const { cwd, home } = await createSandbox('runtime')
    const plan = buildInstallPlan(
      createSelection(['claude', 'opencode', 'gemini', 'codex'], 'global'),
      { cwd, home }
    )

    await executeInstallPlan(plan)

    const results = await Promise.all(plan.targets.map((target) => verifyInstalledRuntime(target)))

    expect(results.map((result) => result.verificationCommand)).toEqual([
      '/@tayo-dev/rtl:help',
      '/@tayo-dev/rtl-help',
      '/@tayo-dev/rtl:help',
      '$@tayo-dev/rtl-help',
    ])
    expect(results.every((result) => result.status === 'verified')).toBe(true)
  })
})

describe('package smoke proof', () => {
  it('packs dist and runtime assets into the npm tarball', async () => {
    const { root } = await createSandbox('pack')
    const packDir = join(root, 'pack')
    const cacheDir = join(root, 'npm-cache')

    await mkdir(packDir, { recursive: true })
    await mkdir(cacheDir, { recursive: true })

    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--json', '--pack-destination', packDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NPM_CONFIG_CACHE: cacheDir,
        },
      }
    )

    const packResult = JSON.parse(stdout) as Array<{ filename: string }>
    const tarballPath = join(packDir, packResult[0]!.filename)
    const tarList = await execFileAsync('tar', ['-tf', tarballPath], {
      cwd: process.cwd(),
    })

    expect(tarList.stdout).toContain('package/dist/index.js')
    expect(tarList.stdout).toContain('package/assets/claude/commands/@tayo-dev/rtl/help.md')
    expect(tarList.stdout).toContain('package/assets/gemini/commands/@tayo-dev/rtl/help.toml')
    expect(tarList.stdout).toContain('package/assets/opencode/commands/@tayo-dev/rtl-help.md')
    expect(tarList.stdout).toContain('package/assets/codex/@tayo-dev/rtl-help/SKILL.md')
    expect(tarList.stdout).toContain('package/README.md')
  })
})
