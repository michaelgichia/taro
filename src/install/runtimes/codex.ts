import { join } from 'node:path'
import { resolveAssetSource } from '../assets.js'
import { TARO_REFERENCE_FILES } from '../reference-files.js'
import type { InstallFileOperation, ResolvedInstallTarget, RuntimeAssetDefinition } from '../types.js'

const CODEX_SKILL_ASSETS: RuntimeAssetDefinition[] = [
  {
    id: 'help',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-help.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-help', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-help',
  },
  {
    id: 'init',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-init.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-init', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-init',
  },
  {
    id: 'generate',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-generate.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-generate', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-generate',
  },
  {
    id: 'refresh',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-refresh.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-refresh', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-refresh',
  },
  ...TARO_REFERENCE_FILES.map((fileName) => ({
    id: `generate-reference-${fileName.replace(/\.md$/, '')}`,
    kind: 'skill' as const,
    sourceSegments: ['taro', 'references', fileName],
    destinationSegments: ['skills', '@taro-dev', 'rtl-generate', 'references', fileName],
  })),
  {
    id: 'conventions',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-conventions.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-conventions', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-conventions',
  },
  {
    id: 'mocks',
    kind: 'skill',
    sourceSegments: ['agents', 'taro-mocks.md'],
    destinationSegments: ['skills', '@taro-dev', 'rtl-mocks', 'SKILL.md'],
    entrypoint: '$@taro-dev/rtl-mocks',
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
