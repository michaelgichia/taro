import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { executeInstallPlan } from '#install/executor.ts'
import { buildInstallPlan } from '#install/planner.ts'
import type { InstallSelection, RuntimeLocationSelections, RuntimeTarget } from '#install/types.ts'
import { verifyInstalledRuntime } from '#install/verification.ts'

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
  const packageRoot = join(root, 'package')

  sandboxRoots.push(root)
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })
  await mkdir(join(packageRoot, 'dist'), { recursive: true })
  await writeFile(
    join(packageRoot, 'dist', 'index.js'),
    "if (process.argv.includes('--version')) process.stdout.write('0.0.0\\n')\n"
  )

  return { root, cwd, home, packageRoot }
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
    const { cwd, home, packageRoot } = await createSandbox('runtime')
    const plan = buildInstallPlan(
      createSelection(['claude', 'opencode', 'gemini', 'codex'], 'global'),
      { cwd, home, packageRoot }
    )

    await executeInstallPlan(plan)

    const results = await Promise.all(plan.targets.map((target) => verifyInstalledRuntime(target)))

    expect(results.map((result) => result.verificationCommand)).toEqual([
      '/@taro-test/rtl:help',
      '/@taro-test/rtl-help',
      '/@taro-test/rtl:help',
      '$@taro-test/rtl-help',
    ])
    expect(results.every((result) => result.status === 'verified')).toBe(true)
    expect(results.map((result) => result.checkedPath)).toEqual(
      plan.targets.map((target) => target.runtimeEntrypointPath)
    )
    expect(results.map((result) => result.launcherCommand)).toEqual(
      plan.targets.map((target) => target.runtimeCommand)
    )
  }, 10000)
})

describe('package smoke proof', () => {
  it('packs dist, authored runtime sources, and docs into the package tarball', async () => {
    const { root } = await createSandbox('pack')
    const packDir = join(root, 'pack')
    const repoDistPath = join(process.cwd(), 'dist', 'index.js')
    let createdRepoDist = false

    await mkdir(packDir, { recursive: true })
    try {
      await access(repoDistPath)
    } catch {
      createdRepoDist = true
      await mkdir(join(process.cwd(), 'dist'), { recursive: true })
      await writeFile(repoDistPath, "export {}\n")
    }

    try {
      const { stdout } = await execFileAsync('pnpm', ['pack', '--json', '--pack-destination', packDir], {
        cwd: process.cwd(),
      })

      const parsedPackResult = JSON.parse(stdout) as
        | { filename: string }
        | Array<{ filename: string }>
      const packResult = Array.isArray(parsedPackResult) ? parsedPackResult[0] : parsedPackResult
      const tarballPath = isAbsolute(packResult.filename)
        ? packResult.filename
        : join(packDir, packResult.filename)
      const tarList = await execFileAsync('tar', ['-tf', tarballPath], {
        cwd: process.cwd(),
      })

      expect(tarList.stdout).toContain('package/dist/index.js')
      expect(tarList.stdout).toContain('package/bin/install.js')
      expect(tarList.stdout).toContain('package/commands/claude/@taro-test/rtl/help.md')
      expect(tarList.stdout).toContain('package/commands/gemini/@taro-test/rtl/help.toml')
      expect(tarList.stdout).toContain('package/commands/opencode/@taro-test/rtl-help.md')
      expect(tarList.stdout).toContain('package/agents/taro-help.md')
      expect(tarList.stdout).toContain('package/taro/references/quality-scoring.md')
      expect(tarList.stdout).toContain('package/docs/USER-GUIDE.md')
      expect(tarList.stdout).toContain('package/README.md')
    } finally {
      if (createdRepoDist) {
        await rm(join(process.cwd(), 'dist'), { recursive: true, force: true })
      }
    }
  })
})
