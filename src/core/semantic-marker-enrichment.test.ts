import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { enrichCanonicalSemanticMarkers } from '#core/semantic-marker-enrichment.ts'
import type { NormalizedRecording } from '#types/recording.ts'

const tempDirs: string[] = []

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'taro-marker-recovery-'))
  tempDirs.push(projectRoot)
  return projectRoot
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      const { rm } = await import('node:fs/promises')
      await rm(dir, { force: true, recursive: true })
    })
  )
})

function createRecording(target = 'Please enter or'): NormalizedRecording {
  return {
    title: 'Validation flow',
    rawStepCount: 2,
    steps: [
      {
        id: 'js-step-1',
        action: 'click',
        target: '+ Add Item to Cart',
        originalType: 'click',
        source: 'js',
      },
      {
        id: 'js-step-2',
        action: 'click',
        target,
        originalType: 'dblClick',
        source: 'js',
        semanticMarkerCandidate: {
          stepId: 'js-step-2',
          status: 'qualified',
          originalGesture: 'dblClick',
          proofSubject: 'visible-message',
          target,
          proofText: target,
          sourceContext: {
            originalType: 'dblClick',
          },
          query: {
            stepId: 'js-step-2',
            method: 'getByText',
            queryRoot: 'screen',
            raw: `screen.getByText('${target}')`,
            target,
          },
          anchor: {
            anchorStepId: 'js-step-1',
            relation: 'follows',
          },
        },
        metadata: {
          semanticMarkerCandidate: {
            stepId: 'js-step-2',
            status: 'qualified',
            originalGesture: 'dblClick',
            proofSubject: 'visible-message',
            target,
            proofText: target,
            sourceContext: {
              originalType: 'dblClick',
            },
            query: {
              stepId: 'js-step-2',
              method: 'getByText',
              queryRoot: 'screen',
              raw: `screen.getByText('${target}')`,
              target,
            },
            anchor: {
              anchorStepId: 'js-step-1',
              relation: 'follows',
            },
          },
        },
      },
    ],
  }
}

describe('enrichCanonicalSemanticMarkers', () => {
  it('upgrades partial visible text from a unique source-file match', async () => {
    const projectRoot = await createProject()
    await mkdir(join(projectRoot, 'src', 'modules'), { recursive: true })
    await writeFile(
      join(projectRoot, 'src', 'modules', 'validators.ts'),
      `export const validationMessage = "Please enter or select an item"\n`,
      'utf-8'
    )

    const recording = createRecording()
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: 'src/modules/validators.ts',
          kind: 'source',
          matchedTerms: ['Please enter or'],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    })

    const candidate = enriched.steps[1]?.semanticMarkerCandidate
    expect(candidate?.proofText).toBe('Please enter or select an item')
    expect(candidate?.query?.target).toBe('Please enter or select an item')
    expect(candidate?.canonicalRecovery).toEqual({
      fromText: 'Please enter or',
      sourceFile: 'src/modules/validators.ts',
      toText: 'Please enter or select an item',
    })
  })

  it('does not recover from test files or hidden implementation strings', async () => {
    const projectRoot = await createProject()
    await mkdir(join(projectRoot, 'src', 'modules'), { recursive: true })
    await mkdir(join(projectRoot, 'src', 'modules', '__tests__'), { recursive: true })
    await writeFile(
      join(projectRoot, 'src', 'modules', '__tests__', 'validation.test.tsx'),
      `expect(screen.getByText("Please enter or select an item")).toBeVisible()\n`,
      'utf-8'
    )
    await writeFile(
      join(projectRoot, 'src', 'modules', 'selectors.ts'),
      `export const selector = "[data-testid='please-enter-or-select-an-item']"\n`,
      'utf-8'
    )

    const recording = createRecording()
    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: 'src/modules/__tests__/validation.test.tsx',
          kind: 'test',
          matchedTerms: ['Please enter or'],
          score: 30,
        },
        {
          filePath: 'src/modules/selectors.ts',
          kind: 'source',
          matchedTerms: ['Please enter or'],
          score: 20,
        },
      ],
      projectRoot,
      recording,
    })

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe('Please enter or')
    expect(enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery).toBeUndefined()
  })

  it('never rewrites concrete-value markers from source literals', async () => {
    const projectRoot = await createProject()
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(
      join(projectRoot, 'src', 'values.ts'),
      `export const savedValue = "USD 4,800.00"\n`,
      'utf-8'
    )

    const recording = createRecording('USD 4,800.')
    const valueStep = recording.steps[1]!
    valueStep.semanticMarkerCandidate = {
      ...valueStep.semanticMarkerCandidate!,
      proofSubject: 'concrete-value',
      target: 'USD 4,800.',
      proofText: 'USD 4,800.',
    }
    valueStep.metadata = {
      semanticMarkerCandidate: valueStep.semanticMarkerCandidate,
    }

    const enriched = await enrichCanonicalSemanticMarkers({
      contextMatches: [
        {
          filePath: 'src/values.ts',
          kind: 'source',
          matchedTerms: ['USD 4,800.'],
          score: 25,
        },
      ],
      projectRoot,
      recording,
    })

    expect(enriched.steps[1]?.semanticMarkerCandidate?.proofText).toBe('USD 4,800.')
    expect(enriched.steps[1]?.semanticMarkerCandidate?.canonicalRecovery).toBeUndefined()
  })
})
