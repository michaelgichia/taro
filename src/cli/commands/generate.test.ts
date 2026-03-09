import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGenerateCommand } from './generate.js'

vi.mock('../../core/resolver.js', () => ({
  captureVisualState: vi.fn(async () => null),
  inspectElements: vi.fn(async () => new Map()),
  buildQuery: vi.fn((_info, selector: string) => ({
    query: `screen.getByTestId('${selector}')`,
    quality: 'fragile',
    method: 'getByTestId',
  })),
  selectMatcher: vi.fn(() => undefined),
  emitQry03Warning: vi.fn(),
}))

vi.mock('../../core/mock-intelligence.js', () => ({
  analyzeMocks: vi.fn(async () => null),
}))

vi.mock('../../core/scanner.js', () => ({
  analyzeSingleTestFile: vi.fn(async () => ({})),
  mergeConventions: vi.fn(async () => undefined),
  readConventions: vi.fn(async () => null),
  scanConventions: vi.fn(async () => ({
    scannedAt: new Date(0).toISOString(),
    projectRoot: '/tmp/project',
    importStyle: 'esm',
    mockPattern: 'none',
    testFiles: [],
    folderPattern: 'unknown',
    fileExtension: 'ts',
  })),
}))

const sandboxes: string[] = []

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-generate-${label}-`))
  sandboxes.push(root)
  await mkdir(join(root, 'project'), { recursive: true })
  return { outputDir: join(root, 'project'), root }
}

async function runGenerate(args: string[], cwdPath: string) {
  const command = createGenerateCommand()
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const originalCwd = process.cwd()

  process.chdir(cwdPath)

  try {
    await command.parseAsync(args, { from: 'user' })
  } finally {
    const result = {
      logs: logSpy.mock.calls.flat().join('\n'),
      warnings: warnSpy.mock.calls.flat().join('\n'),
      errors: errorSpy.mock.calls.flat().join('\n'),
    }

    process.chdir(originalCwd)
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    return result
  }
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  process.exitCode = undefined
})

describe('createGenerateCommand', () => {
  it('supports recorder JS dry-run with an explicit output path', async () => {
    const sandbox = await createSandbox('dry-run')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')
    const recordingPath = resolve(process.cwd(), 'sample/sample-rest-recordingextension-output.js')

    const result = await runGenerate(
      [recordingPath, '--dry-run', '--output', outputPath],
      sandbox.outputDir
    )

    expect(result.errors).toBe('')
    expect(result.logs).toContain('Parsed: Recording-Add-Sale-KE-06/03/2026 at 08:25:15')
    expect(result.logs).toContain(`Would write to: ${outputPath}`)
    expect(result.logs).toContain("screen.getByRole('button', {name: 'Add Sale (Invoice)'})")
  })

  it('overwrites an existing JS output file when --force is provided', async () => {
    const sandbox = await createSandbox('force')
    const outputPath = join(sandbox.outputDir, 'generated.test.tsx')
    const recordingPath = resolve(process.cwd(), 'sample/sample-rest-recordingextension-output.js')

    await writeFile(outputPath, 'stale content', 'utf-8')

    const result = await runGenerate(
      [recordingPath, '--output', outputPath, '--force'],
      sandbox.outputDir
    )

    const written = await readFile(outputPath, 'utf-8')

    expect(result.errors).toBe('')
    expect(result.logs).toContain(`Updated: ${outputPath}`)
    expect(written).toContain("screen.getByRole('button', {name: 'Add Sale (Invoice)'})")
    expect(written).not.toContain('stale content')
  })
})
