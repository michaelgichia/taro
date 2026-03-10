import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

const sampleJsonBasicPath = resolve(process.cwd(), 'sample/sample-json-recording-basic.json')
const sampleJsonDialogPath = resolve(process.cwd(), 'sample/sample-json-recording-dialog.json')

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

  it('parses the representative JSON fixtures with stable ids and preserved recorder intent', async () => {
    const [basic, dialog] = await Promise.all([
      parseRecording(sampleJsonBasicPath),
      parseRecording(sampleJsonDialogPath),
    ])

    expect(basic.steps.map((step) => step.target)).toEqual([
      'http://localhost:3000/sales',
      'Add Sale',
      'Add Sale',
      'Customer Name',
      'Amount',
      'Submit Sale',
      'Sale created',
    ])
    expect(dialog.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'json-step-2',
          action: 'click',
          originalType: 'doubleClick',
          source: 'json',
          target: 'Open Add Sale dialog',
        }),
        expect.objectContaining({
          id: 'json-step-7',
          action: 'assert',
          originalType: 'assertElementVisible',
          source: 'json',
          target: 'Draft saved',
        }),
      ])
    )
    expect(dialog.settings).toEqual({
      url: 'http://localhost:3000/sales',
    })
    expect(dialog.baseline).toBeUndefined()
  })
})
