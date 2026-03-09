import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { detectInputSource, loadInput } from './input-loader.js'

const tempDirs: string[] = []
const envOptionsLine = ` * @jest-environment${'-options'} {"url":"http://localhost:3000"}`
const dashboardEnvOptionsLine = ` * @jest-environment${'-options'} {"url":"http://localhost:3000/dashboard"}`

async function writeTempFile(name: string, content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'taro-input-loader-'))
  tempDirs.push(directory)
  const filePath = join(directory, name)
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('detectInputSource', () => {
  it('detects Chrome Recorder JSON by extension', () => {
    expect(detectInputSource('/tmp/recording.json', '{"steps":[]}')).toBe('json')
  })

  it('detects recorder JS by extension', () => {
    expect(detectInputSource('/tmp/recording.js', 'userEvent.click(screen.getByText("Save"))')).toBe(
      'js'
    )
  })

  it('detects recorder JS from environment-options content', () => {
    expect(
      detectInputSource(
        '/tmp/recording.txt',
        [
          '/**',
          envOptionsLine,
          ' */',
          'userEvent.click(screen.getByText("Save"))',
        ].join('\n')
      )
    ).toBe('js')
  })
})

describe('loadInput', () => {
  it('loads JSON input through the shared parsed-input envelope', async () => {
    const filePath = await writeTempFile(
      'recording.json',
      JSON.stringify({
        title: 'JSON flow',
        settings: {
          url: 'http://localhost:3000/orders',
        },
        steps: [
          {
            type: 'click',
            selectors: [['aria/Add sale']],
          },
        ],
      })
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('json')
    expect(parsed.recording.title).toBe('JSON flow')
    expect(parsed.recording.url).toBe('http://localhost:3000/orders')
    expect(parsed.recording.steps[0]).toEqual(
      expect.objectContaining({
        id: 'json-step-1',
        source: 'json',
        target: 'aria/Add sale',
      })
    )
    expect('baseline' in parsed).toBe(false)
  })

  it('loads recorder JS input with preserved baseline metadata', async () => {
    const filePath = await writeTempFile(
      'recording.js',
      [
        '/**',
        ' * Add sale flow',
        dashboardEnvOptionsLine,
        ' */',
        "test('recording', async () => {",
        "  await userEvent.click(screen.getByRole('button', {name: 'Save'}))",
        "  await userEvent.click(document.querySelector('#line-items input'))",
        '})',
      ].join('\n')
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('js')
    expect(parsed.recording.url).toBe('http://localhost:3000/dashboard')
    expect(parsed.recording.steps[0]).toEqual(
      expect.objectContaining({
        id: 'js-step-1',
        source: 'js',
      })
    )
    expect(parsed.baseline.queries).toEqual([
      expect.objectContaining({
        method: 'getByRole',
        quality: 'excellent',
        queryRoot: 'screen',
      }),
    ])
    expect(parsed.baseline.selectors).toEqual([
      expect.objectContaining({
        selector: '#line-items input',
        selectorKind: 'document.querySelector',
      }),
    ])
    expect(parsed.baseline.assertions).toEqual([
      expect.objectContaining({
        kind: 'query-result',
        queryMethod: 'getByRole',
      }),
    ])
  })

  it('treats environment-options content as recorder JS even without a JS extension', async () => {
    const filePath = await writeTempFile(
      'recording.txt',
      [
        '/**',
        ' * Recorder export',
        envOptionsLine,
        ' */',
        "test('recording', async () => {",
        "  await userEvent.click(screen.getByText('Continue'))",
        '})',
      ].join('\n')
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('js')
    expect(parsed.baseline.environmentUrl).toBe('http://localhost:3000')
  })
})
