import { join } from 'node:path'
import { resolveAssetSource } from '../assets.js'
import type { InstallFileOperation, ResolvedInstallTarget, RuntimeAssetDefinition } from '../types.js'

const CODEX_GENERATE_REFERENCE_FILES = [
  'assertion-markers.md',
  'auth.md',
  'conventions-schema.md',
  'entry-path-fidelity.md',
  'intent-model.md',
  'mock-store.md',
  'quality-scoring.md',
  'state-schema.md',
  'test-index.md',
  'verification-gate.md',
] as const

const CODEX_SKILL_ASSETS: RuntimeAssetDefinition[] = [
  {
    id: 'help',
    kind: 'skill',
    sourceSegments: ['agents', 'tayo-help.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-help', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-help',
  },
  {
    id: 'generate',
    kind: 'skill',
    sourceSegments: ['agents', 'tayo-generate.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-generate', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-generate',
  },
  ...CODEX_GENERATE_REFERENCE_FILES.map((fileName) => ({
    id: `generate-reference-${fileName.replace(/\.md$/, '')}`,
    kind: 'skill' as const,
    sourceSegments: ['taro', 'references', fileName],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-generate', 'references', fileName],
  })),
  {
    id: 'conventions',
    kind: 'skill',
    sourceSegments: ['agents', 'tayo-conventions.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-conventions', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-conventions',
  },
  {
    id: 'mocks',
    kind: 'skill',
    sourceSegments: ['agents', 'tayo-mocks.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-mocks', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-mocks',
  },
]

export function buildCodexOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (target.id !== 'codex') {
    throw new Error(`Codex runtime builder received ${target.id}.`)
  }

  return CODEX_SKILL_ASSETS.map((asset) => {
    const relativeDestinationPath = join(...asset.destinationSegments)

    return {
      assetId: asset.id,
      runtime: target.id,
      location: target.location,
      kind: asset.kind,
      sourcePath: resolveAssetSource(asset.sourceSegments, fromModuleUrl),
      relativeDestinationPath,
      targetPath: join(target.destinationDirectory, relativeDestinationPath),
      entrypoint: asset.entrypoint,
    }
  })
}
