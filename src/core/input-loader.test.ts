import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { detectInputSource, loadInput } from './input-loader.js'

const tempDirs: string[] = []
const envOptionsLine = ` * @jest-environment${'-options'} {"url":"http://localhost:3000"}`
const nestedEnvOptionsLine = ` * @jest-environment${'-options'} {"url":"http://localhost:3000/workspace"}`

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
  it('rejects Chrome Recorder JSON by extension', () => {
    expect(() => detectInputSource('/tmp/recording.json', '{"steps":[]}')).toThrow(
      'Chrome Recorder JSON exports are no longer supported.'
    )
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
  it('rejects JSON input through the shared parsed-input envelope', async () => {
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

    await expect(loadInput(filePath)).rejects.toThrow(
      'Chrome Recorder JSON exports are no longer supported.'
    )
  })

  it('loads recorder JS input with preserved baseline metadata', async () => {
    const filePath = await writeTempFile(
      'recording.js',
      [
        '/**',
        ' * Example flow',
        nestedEnvOptionsLine,
        ' */',
        "test('recording', async () => {",
        "  await userEvent.click(screen.getByRole('button', {name: 'Save'}))",
        "  await userEvent.click(document.querySelector('#line-items input'))",
        "  screen.getByText('Saved')",
        '})',
      ].join('\n')
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('js')
    expect(parsed.recording.url).toBe('http://localhost:3000/workspace')
    expect(parsed.recording.steps[0]).toEqual(
      expect.objectContaining({
        id: 'js-step-1',
        source: 'js',
      })
    )
    expect(parsed.baseline.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'getByRole',
          quality: 'excellent',
          queryRoot: 'screen',
          raw: "screen.getByRole('button', {name: 'Save'})",
        }),
      ])
    )
    expect(parsed.baseline.selectors).toEqual([
      expect.objectContaining({
        selector: '#line-items input',
        selectorKind: 'document.querySelector',
      }),
    ])
    expect(parsed.baseline.assertions).toEqual([
      expect.objectContaining({
        kind: 'query-result',
        queryMethod: 'getByText',
        target: 'Saved',
      }),
    ])
    expect(parsed.baseline.semanticMarkerCandidates).toEqual([])
  })

  it('preserves nested query evidence on JS action steps', async () => {
    const filePath = await writeTempFile(
      'recording.js',
      [
        '/**',
        ' * Example flow',
        nestedEnvOptionsLine,
        ' */',
        "test('recording', async () => {",
        "  await userEvent.click(screen.getByRole('button', {name: 'Save'}))",
        '})',
      ].join('\n')
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('js')
    expect(parsed.recording.steps[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          query: expect.objectContaining({
            method: 'getByRole',
            raw: "screen.getByRole('button', {name: 'Save'})",
          }),
        }),
      })
    )
  })

  it('loads unresolved dblClick semantic marker candidates through the shared JS boundary', async () => {
    const filePath = await writeTempFile(
      'recording.js',
      [
        '/**',
        ' * Review example flow',
        nestedEnvOptionsLine,
        ' */',
        "test('recording', async () => {",
        "  await userEvent.dblClick(screen.getByRole('heading', {name: 'Review Example'}))",
        "  await userEvent.dblClick(screen.getByText('Customer Reference'))",
        "  await userEvent.dblClick(screen.getByText('USD 4,800.00'))",
        '})',
      ].join('\n')
    )

    const parsed = await loadInput(filePath)

    expect(parsed.source).toBe('js')
    expect(parsed.recording.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalType: 'dblClick',
          semanticMarkerCandidate: expect.objectContaining({
            status: 'unresolved',
            proofSubject: 'heading',
            proofText: 'Review Example',
          }),
        }),
        expect.objectContaining({
          originalType: 'dblClick',
          semanticMarkerCandidate: expect.objectContaining({
            status: 'unresolved',
            proofSubject: 'field-label',
            proofText: 'Customer Reference',
          }),
        }),
        expect.objectContaining({
          originalType: 'dblClick',
          semanticMarkerCandidate: expect.objectContaining({
            status: 'unresolved',
            proofSubject: 'concrete-value',
            proofText: 'USD 4,800.00',
          }),
        }),
      ])
    )
    expect(parsed.baseline.semanticMarkerCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'heading',
          proofText: 'Review Example',
        }),
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'field-label',
          proofText: 'Customer Reference',
        }),
        expect.objectContaining({
          status: 'unresolved',
          proofSubject: 'concrete-value',
          proofText: 'USD 4,800.00',
        }),
      ])
    )
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
