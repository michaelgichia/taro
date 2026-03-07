export const SUPPORTED_RUNTIMES = ['claude', 'opencode', 'gemini', 'codex'] as const
export const INSTALL_LOCATIONS = ['global', 'local'] as const

export type RuntimeTarget = (typeof SUPPORTED_RUNTIMES)[number]
export type InstallLocation = (typeof INSTALL_LOCATIONS)[number]
export type InstallSelectionSource = 'flags' | 'prompt' | 'mixed'

export interface InstallCommandOptions {
  claude?: boolean
  opencode?: boolean
  gemini?: boolean
  codex?: boolean
  all?: boolean
  global?: boolean
  local?: boolean
}

export type RuntimeLocationMap = Partial<Record<RuntimeTarget, InstallLocation>>
export type RuntimeLocationSelections = Record<RuntimeTarget, InstallLocation>

export interface NormalizedInstallOptions {
  mode: 'interactive' | 'non-interactive'
  runtimes: RuntimeTarget[]
  locations: RuntimeLocationMap
  needsRuntimePrompt: boolean
  runtimesNeedingLocation: RuntimeTarget[]
  source: InstallSelectionSource
}

export interface InstallSelection {
  mode: 'interactive' | 'non-interactive'
  runtimes: RuntimeTarget[]
  locations: RuntimeLocationSelections
  source: InstallSelectionSource
}

export interface RuntimeMetadata {
  id: RuntimeTarget
  displayName: string
  globalDirectorySegments: string[]
  localDirectoryName: string
  verificationCommand: string
}

export interface ResolvedInstallTarget extends RuntimeMetadata {
  location: InstallLocation
  destinationDirectory: string
}

export interface InstallPlan {
  packageName: '@tayo-dev/rtl'
  commandName: 'taro'
  stage: 'prewrite-preview'
  source: InstallSelectionSource
  mode: 'interactive' | 'non-interactive'
  targets: ResolvedInstallTarget[]
}

export const RUNTIME_METADATA: Record<RuntimeTarget, RuntimeMetadata> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    globalDirectorySegments: ['.claude'],
    localDirectoryName: '.claude',
    verificationCommand: '/@tayo-dev/rtl:help',
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    globalDirectorySegments: ['.config', 'opencode'],
    localDirectoryName: '.opencode',
    verificationCommand: '/@tayo-dev/rtl-help',
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini CLI',
    globalDirectorySegments: ['.gemini'],
    localDirectoryName: '.gemini',
    verificationCommand: '/@tayo-dev/rtl:help',
  },
  codex: {
    id: 'codex',
    displayName: 'Codex',
    globalDirectorySegments: ['.codex'],
    localDirectoryName: '.codex',
    verificationCommand: '$@tayo-dev/rtl-help',
  },
}
