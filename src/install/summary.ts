import { homedir } from 'node:os'
import { relative } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import pc from 'picocolors'
import type {
  InstallExecutionResult,
  InstallPlan,
  ResolvedInstallTarget,
} from './types.js'
import type { ReplaceConfirmationRequest } from './writer.js'

interface PromptIO {
  input?: typeof stdin
  output?: typeof stdout
}

function formatTargetDirectory(target: ResolvedInstallTarget): string {
  const homeDirectory = homedir()

  if (target.location === 'global' && target.destinationDirectory.startsWith(homeDirectory)) {
    const suffix = relative(homeDirectory, target.destinationDirectory)
    return suffix.length > 0 ? `~/${suffix}` : '~'
  }

  if (target.location === 'local') {
    const suffix = relative(process.cwd(), target.destinationDirectory)
    return suffix.length > 0 ? `./${suffix}` : '.'
  }

  return target.destinationDirectory
}

export function renderInstallSummary(plan: InstallPlan): string {
  const lines = plan.targets.map((target) => {
    const assetCount = target.operations.length
    const label = assetCount === 1 ? 'asset' : 'assets'
    return `- ${target.displayName}: ${target.location} (${formatTargetDirectory(target)}) — ${assetCount} ${label}`
  })

  return [
    pc.bold(`Install plan for ${plan.packageName}`),
    ...lines,
    '',
    pc.dim('No files will be written until confirmation completes.'),
  ].join('\n')
}

export async function confirmInstallPlan(
  plan: InstallPlan,
  io: PromptIO = { input: stdin, output: stdout }
): Promise<boolean> {
  const rl = createInterface({
    input: io.input ?? stdin,
    output: io.output ?? stdout,
  })

  try {
    while (true) {
      const answer = await rl.question(
        `Proceed with the ${plan.targets.length}-target install plan? [y/N]: `
      )
      const normalized = answer.trim().toLowerCase()

      if (normalized === '' || normalized === 'n' || normalized === 'no') {
        return false
      }

      if (normalized === 'y' || normalized === 'yes') {
        return true
      }

      console.log(pc.yellow('Answer `y` to continue or `n` to cancel.'))
    }
  } finally {
    rl.close()
  }
}

export function renderInstallCancelledMessage(): string {
  return 'Install cancelled. Nothing changed.'
}

async function confirmWithPrompt(
  question: string,
  io: PromptIO = { input: stdin, output: stdout }
): Promise<boolean> {
  const rl = createInterface({
    input: io.input ?? stdin,
    output: io.output ?? stdout,
  })

  try {
    while (true) {
      const answer = await rl.question(question)
      const normalized = answer.trim().toLowerCase()

      if (normalized === '' || normalized === 'n' || normalized === 'no') {
        return false
      }

      if (normalized === 'y' || normalized === 'yes') {
        return true
      }

      console.log(pc.yellow('Answer `y` to continue or `n` to cancel.'))
    }
  } finally {
    rl.close()
  }
}

export async function confirmInstallReplacement(
  request: ReplaceConfirmationRequest,
  io: PromptIO = { input: stdin, output: stdout }
): Promise<boolean> {
  return confirmWithPrompt(
    `Replace ${request.conflicts.length} existing ${request.target.displayName} asset(s)? [y/N]: `,
    io
  )
}

function renderResultLine(target: InstallExecutionResult['targets'][number]): string {
  if (target.status === 'installed') {
    return `- ${target.displayName}: wrote ${target.writtenFiles.length} asset(s) to ${target.destinationDirectory} (${target.verificationCommand})`
  }

  if (target.status === 'requires-replace-confirmation') {
    return `- ${target.displayName}: replace confirmation required for ${target.conflicts.length} existing asset(s)`
  }

  const blockedReasons = target.conflicts
    .map((conflict) => `${conflict.kind} at ${conflict.targetPath}`)
    .join('; ')

  return `- ${target.displayName}: blocked by ${blockedReasons}`
}

export function renderInstallExecutionResult(result: InstallExecutionResult): string {
  const heading =
    result.status === 'installed'
      ? pc.green('Install complete.')
      : result.status === 'partial'
        ? pc.yellow('Install finished with conflicts.')
        : pc.red('Install blocked.')

  const verificationLines = result.targets
    .filter((target) => target.status === 'installed')
    .map((target) => `- ${target.displayName}: ${target.verificationCommand}`)

  const manifestLines = result.targets
    .filter((target) => target.status === 'installed' && target.manifestPath)
    .map((target) => `- ${target.displayName}: ${target.manifestPath}`)

  return [
    heading,
    ...result.targets.map(renderResultLine),
    verificationLines.length > 0 ? '' : null,
    verificationLines.length > 0 ? 'Verification commands:' : null,
    ...verificationLines,
    manifestLines.length > 0 ? '' : null,
    manifestLines.length > 0 ? 'Ownership markers:' : null,
    ...manifestLines,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}
