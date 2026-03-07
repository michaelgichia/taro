import { access } from 'node:fs/promises'
import type { PlannedInstallTarget, RuntimeVerificationResult } from './types.js'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function verifyInstalledRuntime(
  target: PlannedInstallTarget
): Promise<RuntimeVerificationResult> {
  const entrypointOperation = target.operations.find(
    (operation) => operation.entrypoint === target.verificationCommand
  )

  if (!entrypointOperation) {
    return {
      verificationCommand: target.verificationCommand,
      status: 'missing-entrypoint',
      missingPaths: [],
    }
  }

  const missingPaths: string[] = []

  for (const operation of target.operations) {
    const exists = await pathExists(operation.targetPath)
    if (!exists) {
      missingPaths.push(operation.targetPath)
    }
  }

  return {
    verificationCommand: target.verificationCommand,
    status: missingPaths.length > 0 ? 'missing-installed-assets' : 'verified',
    checkedPath: entrypointOperation.targetPath,
    missingPaths,
  }
}
