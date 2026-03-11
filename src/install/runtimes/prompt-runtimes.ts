import { join } from 'node:path'
import { resolveAssetSource } from '../assets.js'
import { TARO_REFERENCE_FILES } from '../reference-files.js'
import type {
  InstallFileOperation,
  ResolvedInstallTarget,
  RuntimeAssetDefinition,
  RuntimeTarget,
} from '../types.js'

type PromptRuntimeTarget = Extract<RuntimeTarget, 'claude' | 'gemini' | 'opencode'>

const PROMPT_RUNTIME_ASSETS: Record<PromptRuntimeTarget, RuntimeAssetDefinition[]> = {
  claude: [
    {
      id: 'help',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@tayo-dev', 'rtl', 'help.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'help.md'],
      entrypoint: '/@tayo-dev/rtl:help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@tayo-dev', 'rtl', 'init.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'init.md'],
      entrypoint: '/@tayo-dev/rtl:init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@tayo-dev', 'rtl', 'generate.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'generate.md'],
      entrypoint: '/@tayo-dev/rtl:generate',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@tayo-dev', 'rtl', 'refresh.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'refresh.md'],
      entrypoint: '/@tayo-dev/rtl:refresh',
    },
    ...TARO_REFERENCE_FILES.map((fileName) => ({
      id: `generate-reference-${fileName.replace(/\.md$/, '')}`,
      kind: 'command' as const,
      sourceSegments: ['taro', 'references', fileName],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'references', fileName],
    })),
  ],
  gemini: [
    {
      id: 'help',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@tayo-dev', 'rtl', 'help.toml'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'help.toml'],
      entrypoint: '/@tayo-dev/rtl:help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@tayo-dev', 'rtl', 'init.toml'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'init.toml'],
      entrypoint: '/@tayo-dev/rtl:init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@tayo-dev', 'rtl', 'generate.toml'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'generate.toml'],
      entrypoint: '/@tayo-dev/rtl:generate',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@tayo-dev', 'rtl', 'refresh.toml'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl', 'refresh.toml'],
      entrypoint: '/@tayo-dev/rtl:refresh',
    },
  ],
  opencode: [
    {
      id: 'help',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@tayo-dev', 'rtl-help.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl-help.md'],
      entrypoint: '/@tayo-dev/rtl-help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@tayo-dev', 'rtl-init.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl-init.md'],
      entrypoint: '/@tayo-dev/rtl-init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@tayo-dev', 'rtl-generate.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl-generate.md'],
      entrypoint: '/@tayo-dev/rtl-generate',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@tayo-dev', 'rtl-refresh.md'],
      destinationSegments: ['commands', '@tayo-dev', 'rtl-refresh.md'],
      entrypoint: '/@tayo-dev/rtl-refresh',
    },
  ],
}

function isPromptRuntime(runtime: RuntimeTarget): runtime is PromptRuntimeTarget {
  return runtime === 'claude' || runtime === 'gemini' || runtime === 'opencode'
}

export function buildPromptRuntimeOperations(
  target: ResolvedInstallTarget,
  fromModuleUrl: string = import.meta.url
): InstallFileOperation[] {
  if (!isPromptRuntime(target.id)) {
    throw new Error(`Prompt runtime operations do not support ${target.id}.`)
  }

  return PROMPT_RUNTIME_ASSETS[target.id].map((asset) => {
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
