import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'

import type { PlannedInstallTarget, RuntimeVerificationResult } from '#install/types.ts'

const execFileAsync = promisify(execFile)

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

  if (!(await pathExists(target.runtimeEntrypointPath))) {
    missingPaths.push(target.runtimeEntrypointPath)
  }

  if (missingPaths.length > 0) {
    return {
      verificationCommand: target.verificationCommand,
      status: 'missing-installed-assets',
      checkedPath: target.runtimeEntrypointPath,
      launcherCommand: target.runtimeCommand,
      missingPaths,
    }
  }

  try {
    await execFileAsync(target.runtimeNodePath, [target.runtimeEntrypointPath, '--version'])
  } catch (error) {
    const runtimeError = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
    const errorMessage =
      runtimeError.stderr?.trim() ||
      runtimeError.stdout?.trim() ||
      runtimeError.message ||
      'Runtime verification failed.'

    return {
      verificationCommand: target.verificationCommand,
      status: 'runtime-check-failed',
      checkedPath: target.runtimeEntrypointPath,
      launcherCommand: target.runtimeCommand,
      errorMessage,
      missingPaths: [],
    }
  }

  return {
    verificationCommand: target.verificationCommand,
    status: 'verified',
    checkedPath: target.runtimeEntrypointPath,
    launcherCommand: target.runtimeCommand,
    missingPaths: [],
  }
}
