import { join } from 'node:path'
import { resolveAssetSource } from '../assets.js'
import type { InstallFileOperation, ResolvedInstallTarget, RuntimeAssetDefinition } from '../types.js'

const CODEX_SKILL_ASSETS: RuntimeAssetDefinition[] = [
  {
    id: 'help',
    kind: 'skill',
    sourceSegments: ['@tayo-dev', 'rtl-help', 'SKILL.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-help', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-help',
  },
  {
    id: 'generate',
    kind: 'skill',
    sourceSegments: ['@tayo-dev', 'rtl-generate', 'SKILL.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-generate', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-generate',
  },
  {
    id: 'conventions',
    kind: 'skill',
    sourceSegments: ['@tayo-dev', 'rtl-conventions', 'SKILL.md'],
    destinationSegments: ['skills', '@tayo-dev', 'rtl-conventions', 'SKILL.md'],
    entrypoint: '$@tayo-dev/rtl-conventions',
  },
  {
    id: 'mocks',
    kind: 'skill',
    sourceSegments: ['@tayo-dev', 'rtl-mocks', 'SKILL.md'],
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
      sourcePath: resolveAssetSource(target.id, asset.sourceSegments, fromModuleUrl),
      relativeDestinationPath,
      targetPath: join(target.destinationDirectory, relativeDestinationPath),
      entrypoint: asset.entrypoint,
    }
  })
}
