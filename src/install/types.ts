export const SUPPORTED_RUNTIMES = ['claude', 'opencode', 'gemini', 'codex'] as const
export const INSTALL_LOCATIONS = ['global', 'local'] as const
export const RUNTIME_FAMILIES = ['prompt', 'skill'] as const
export const INSTALL_ASSET_KINDS = ['prompt', 'command', 'skill', 'manifest'] as const

export type RuntimeTarget = (typeof SUPPORTED_RUNTIMES)[number]
export type InstallLocation = (typeof INSTALL_LOCATIONS)[number]
export type RuntimeFamily = (typeof RUNTIME_FAMILIES)[number]
export type InstallAssetKind = (typeof INSTALL_ASSET_KINDS)[number]
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

export interface RuntimeAssetDefinition {
  id: string
  kind: InstallAssetKind
  sourceSegments: string[]
  destinationSegments: string[]
  entrypoint?: string
}

export interface RuntimeDefinition {
  id: RuntimeTarget
  displayName: string
  family: RuntimeFamily
  globalDirectorySegments: string[]
  localDirectoryName: string
  packageContainerSegments: string[]
  verificationCommand: string
  ownershipMarkerFileName: string
  assets: RuntimeAssetDefinition[]
}

export interface ResolvedInstallTarget extends RuntimeDefinition {
  location: InstallLocation
  destinationDirectory: string
}

export interface InstallOwnedFile {
  relativePath: string
  kind: InstallAssetKind
  checksum?: string
}

export interface InstallFileOperation {
  assetId: string
  runtime: RuntimeTarget
  location: InstallLocation
  kind: InstallAssetKind
  sourcePath: string
  relativeDestinationPath: string
  targetPath: string
  entrypoint?: string
}

export interface PlannedInstallTarget extends ResolvedInstallTarget {
  operations: InstallFileOperation[]
}

export interface RuntimeVerificationResult {
  verificationCommand: string
  status: 'verified' | 'missing-entrypoint' | 'missing-installed-assets'
  checkedPath?: string
  missingPaths: string[]
}

export interface InstallOwnershipManifest {
  packageName: '@taro-dev/rtl'
  runtime: RuntimeTarget
  location: InstallLocation
  manifestVersion: 1
  generatedAt: string
  files: InstallOwnedFile[]
}

export type InstallAssetConflictKind =
  | 'missing'
  | 'installer-owned'
  | 'installer-owned-modified'
  | 'external-collision'

export interface InstallAssetConflict {
  kind: InstallAssetConflictKind
  targetPath: string
}

export interface InstallPlan {
  packageName: '@taro-dev/rtl'
  commandName: 'taro'
  stage: 'prewrite-preview' | 'ready-to-write'
  source: InstallSelectionSource
  mode: 'interactive' | 'non-interactive'
  targets: PlannedInstallTarget[]
}

export interface RuntimeInstallResult {
  runtime: RuntimeTarget
  displayName: string
  location: InstallLocation
  destinationDirectory: string
  verificationCommand: string
  status: 'installed' | 'updated' | 'repaired' | 'blocked'
  writtenFiles: string[]
  manifestPath?: string
  conflicts: InstallAssetConflict[]
  verification?: RuntimeVerificationResult
}

export interface InstallExecutionResult {
  packageName: '@taro-dev/rtl'
  status: 'installed' | 'partial' | 'blocked'
  targets: RuntimeInstallResult[]
}
