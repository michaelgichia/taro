/**
 * Test file filesystem writing
 * Writes generated test code to the filesystem.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { GeneratedTest } from './generator.js'

export interface WriterOptions {
  overwrite?: boolean
}

export async function writeTestFile(
  generated: GeneratedTest,
  outputPath: string,
  options: WriterOptions = {}
): Promise<void> {
  const resolvedPath = resolve(outputPath)
  const dir = dirname(resolvedPath)

  await mkdir(dir, { recursive: true })

  if (!options.overwrite) {
    const { access } = await import('node:fs/promises')
    try {
      await access(resolvedPath)
      throw new Error(
        `Output file already exists: ${resolvedPath}. Use --overwrite to replace it.`
      )
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  await writeFile(resolvedPath, generated.code, 'utf-8')
}
