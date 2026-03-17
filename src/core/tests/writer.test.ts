import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { writeTestFile } from '#core/writer.ts'

const sandboxRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    sandboxRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function createSandbox(label: string) {
  const root = await mkdtemp(join(tmpdir(), `taro-writer-${label}-`))
  sandboxRoots.push(root)
  return root
}

describe('writeTestFile', () => {
  it('creates directories and writes new test files by default', async () => {
    const root = await createSandbox('create')
    const outputPath = join(root, 'src', 'generated', 'checkout.test.tsx')

    const result = await writeTestFile('export const ok = true\n', outputPath)

    expect(result).toEqual({
      filePath: outputPath,
      created: true,
      overwritten: false,
    })
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('export const ok = true\n')
  })

  it('rejects paths that do not have a supported test extension', async () => {
    const root = await createSandbox('invalid')

    await expect(writeTestFile('content', join(root, 'generated.ts'))).rejects.toThrow(
      'Output file must have a test extension (.test.ts, .test.tsx, .spec.ts, .spec.tsx). Got: ".ts"'
    )
    await expect(writeTestFile('content', join(root, 'generated'))).rejects.toThrow(
      'Output file must have a test extension (.test.ts, .test.tsx, .spec.ts, .spec.tsx). Got: "(no extension)"'
    )
  })

  it('respects createDir=false and fails when parent directories are missing', async () => {
    const root = await createSandbox('no-dir')

    await expect(
      writeTestFile('content', join(root, 'missing', 'checkout.test.ts'), {
        createDir: false,
      })
    ).rejects.toThrow()
  })

  it('blocks overwriting existing files unless overwriteExisting is enabled', async () => {
    const root = await createSandbox('overwrite')
    const outputPath = join(root, 'checkout.test.ts')
    await writeFile(outputPath, 'first\n')

    await expect(writeTestFile('second\n', outputPath)).rejects.toThrow(
      `Output file already exists: ${outputPath}\nDelete or rename it before generating again.`
    )

    const overwriteResult = await writeTestFile('second\n', outputPath, {
      overwriteExisting: true,
    })

    expect(overwriteResult).toEqual({
      filePath: outputPath,
      created: false,
      overwritten: true,
    })
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('second\n')
  })
})
