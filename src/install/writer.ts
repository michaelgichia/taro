import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  classifyAssetConflict,
  createOwnedFile,
  createOwnershipManifest,
} from './manifest.js'
import type {
  InstallAssetConflict,
  InstallOwnedFile,
  InstallOwnershipManifest,
  PlannedInstallTarget,
  RuntimeInstallResult,
} from './types.js'

export interface ReplaceConfirmationRequest {
  target: PlannedInstallTarget
  conflicts: InstallAssetConflict[]
}

export interface WriteInstallPlanOptions {
  confirmReplace?: (request: ReplaceConfirmationRequest) => Promise<boolean>
  generatedAt?: string
}

type WriteAction = 'created' | 'updated' | 'repaired'

async function readOwnershipManifest(
  manifestPath: string
): Promise<InstallOwnershipManifest | null> {
  try {
    const manifestContent = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(manifestContent) as InstallOwnershipManifest

    return manifest.packageName === '@taro-dev/rtl' ? manifest : null
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException

    if (fsError.code === 'ENOENT') {
      return null
    }

    return null
  }
}

export async function writeInstallPlan(
  target: PlannedInstallTarget,
  options: WriteInstallPlanOptions = {}
): Promise<RuntimeInstallResult> {
  const manifestPath = join(target.destinationDirectory, target.ownershipMarkerFileName)
  const manifest = await readOwnershipManifest(manifestPath)
  const conflicts: InstallAssetConflict[] = []
  const writeActions = new Map<string, WriteAction>()

  for (const operation of target.operations) {
    let existingContent: string | null = null

    try {
      existingContent = await readFile(operation.targetPath, 'utf8')
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException
      if (fsError.code !== 'ENOENT') {
        throw error
      }
    }

    const conflict = classifyAssetConflict({
      targetPath: operation.targetPath,
      existingContent,
      manifest,
      relativePath: operation.relativeDestinationPath,
    })

    if (conflict.kind !== 'missing') {
      conflicts.push(conflict)
      if (conflict.kind === 'installer-owned') {
        writeActions.set(operation.targetPath, 'updated')
      }
      continue
    }

    const ownedFileExists = Boolean(
      manifest?.files.find((file) => file.relativePath === operation.relativeDestinationPath)
    )
    writeActions.set(operation.targetPath, ownedFileExists ? 'repaired' : 'created')
  }

  if (
    conflicts.some(
      (conflict) =>
        conflict.kind === 'installer-owned-modified' ||
        conflict.kind === 'external-collision'
    )
  ) {
    return {
      runtime: target.id,
      displayName: target.displayName,
      location: target.location,
      destinationDirectory: target.destinationDirectory,
      verificationCommand: target.verificationCommand,
      status: 'blocked',
      writtenFiles: [],
      manifestPath,
      conflicts,
    }
  }

  const ownedFiles: InstallOwnedFile[] = []
  const writtenFiles: string[] = []

  for (const operation of target.operations) {
    await mkdir(dirname(operation.targetPath), { recursive: true })
    await copyFile(operation.sourcePath, operation.targetPath)

    const writtenContent = await readFile(operation.sourcePath, 'utf8')
    ownedFiles.push(
      createOwnedFile({
        relativePath: operation.relativeDestinationPath,
        kind: operation.kind,
        content: writtenContent,
      })
    )
    writtenFiles.push(operation.targetPath)
  }

  const ownershipManifest = createOwnershipManifest({
    runtime: target.id,
    location: target.location,
    generatedAt: options.generatedAt,
    files: ownedFiles,
  })

  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(`${manifestPath}`, `${JSON.stringify(ownershipManifest, null, 2)}\n`)

  const actionSet = new Set(writeActions.values())
  const status =
    actionSet.has('repaired') ? 'repaired' : actionSet.has('updated') ? 'updated' : 'installed'

  return {
    runtime: target.id,
    displayName: target.displayName,
    location: target.location,
    destinationDirectory: target.destinationDirectory,
    verificationCommand: target.verificationCommand,
    status,
    writtenFiles,
    manifestPath,
    conflicts,
  }
}
