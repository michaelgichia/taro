import { TARO_REFERENCE_FILES } from '../reference-files.js'
import { buildRuntimeOperationsFromAssets } from '../runtime-launcher.js'
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
      sourceSegments: ['commands', 'claude', '@taro-dev', 'rtl', 'help.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'help.md'],
      entrypoint: '/@taro-dev/rtl:help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@taro-dev', 'rtl', 'init.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'init.md'],
      entrypoint: '/@taro-dev/rtl:init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@taro-dev', 'rtl', 'generate.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'generate.md'],
      entrypoint: '/@taro-dev/rtl:generate',
    },
    {
      id: 'generate-i',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@taro-dev', 'rtl', 'generate-i.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'generate-i.md'],
      entrypoint: '/@taro-dev/rtl:generate-i',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'claude', '@taro-dev', 'rtl', 'refresh.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'refresh.md'],
      entrypoint: '/@taro-dev/rtl:refresh',
    },
    ...TARO_REFERENCE_FILES.map((fileName) => ({
      id: `generate-reference-${fileName.replace(/\.md$/, '')}`,
      kind: 'command' as const,
      sourceSegments: ['taro', 'references', fileName],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'references', fileName],
    })),
  ],
  gemini: [
    {
      id: 'help',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@taro-dev', 'rtl', 'help.toml'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'help.toml'],
      entrypoint: '/@taro-dev/rtl:help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@taro-dev', 'rtl', 'init.toml'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'init.toml'],
      entrypoint: '/@taro-dev/rtl:init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@taro-dev', 'rtl', 'generate.toml'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'generate.toml'],
      entrypoint: '/@taro-dev/rtl:generate',
    },
    {
      id: 'generate-i',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@taro-dev', 'rtl', 'generate-i.toml'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'generate-i.toml'],
      entrypoint: '/@taro-dev/rtl:generate-i',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'gemini', '@taro-dev', 'rtl', 'refresh.toml'],
      destinationSegments: ['commands', '@taro-dev', 'rtl', 'refresh.toml'],
      entrypoint: '/@taro-dev/rtl:refresh',
    },
  ],
  opencode: [
    {
      id: 'help',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@taro-dev', 'rtl-help.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl-help.md'],
      entrypoint: '/@taro-dev/rtl-help',
    },
    {
      id: 'init',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@taro-dev', 'rtl-init.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl-init.md'],
      entrypoint: '/@taro-dev/rtl-init',
    },
    {
      id: 'generate',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@taro-dev', 'rtl-generate.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl-generate.md'],
      entrypoint: '/@taro-dev/rtl-generate',
    },
    {
      id: 'generate-i',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@taro-dev', 'rtl-generate-i.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl-generate-i.md'],
      entrypoint: '/@taro-dev/rtl-generate-i',
    },
    {
      id: 'refresh',
      kind: 'command',
      sourceSegments: ['commands', 'opencode', '@taro-dev', 'rtl-refresh.md'],
      destinationSegments: ['commands', '@taro-dev', 'rtl-refresh.md'],
      entrypoint: '/@taro-dev/rtl-refresh',
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

  return buildRuntimeOperationsFromAssets(target, PROMPT_RUNTIME_ASSETS[target.id], fromModuleUrl)
}
