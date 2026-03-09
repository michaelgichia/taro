import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRecording } from './parser.js'

const tempDirs: string[] = []

async function writeTempJson(content: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'taro-parser-'))
  tempDirs.push(directory)
  const filePath = join(directory, 'recording.json')
  await writeFile(filePath, JSON.stringify(content), 'utf-8')
  return filePath
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('parseRecording', () => {
  it('preserves JSON recorder URLs and assigns stable step ids', async () => {
    const filePath = await writeTempJson({
      title: 'JSON flow',
      settings: {
        url: 'http://localhost:3000/orders',
      },
      steps: [
        { type: 'navigate', url: 'http://localhost:3000/orders' },
        { type: 'click', selectors: [['aria/Add sale']] },
      ],
    })

    const recording = await parseRecording(filePath)

    expect(recording.title).toBe('JSON flow')
    expect(recording.url).toBe('http://localhost:3000/orders')
    expect(recording.steps).toEqual([
      expect.objectContaining({
        id: 'json-step-1',
        action: 'navigate',
        source: 'json',
        target: 'http://localhost:3000/orders',
      }),
      expect.objectContaining({
        id: 'json-step-2',
        action: 'click',
        source: 'json',
        target: 'aria/Add sale',
      }),
    ])
  })

  it('keeps the JSON parser independent from JS baseline semantics', async () => {
    const filePath = await writeTempJson({
      title: 'JSON assert flow',
      steps: [
        {
          type: 'assertElementVisible',
          selectors: [['aria/Order saved']],
        },
      ],
    })

    const recording = await parseRecording(filePath)

    expect(recording.steps[0]).toEqual(
      expect.objectContaining({
        action: 'assert',
        originalType: 'assertElementVisible',
        source: 'json',
        target: 'aria/Order saved',
      })
    )
    expect(recording.baseline).toBeUndefined()
  })
})
