import { homedir } from 'node:os'
import { relative } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import pc from 'picocolors'
import type { InstallPlan, ResolvedInstallTarget } from './types.js'

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
    return `- ${target.displayName}: ${target.location} (${formatTargetDirectory(target)})`
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

export function renderInstallPendingMessage(plan: InstallPlan): string {
  const verificationLines = plan.targets.map((target) => {
    return `- ${target.displayName}: ${target.verificationCommand}`
  })

  return [
    pc.green('Install plan confirmed.'),
    pc.dim('Runtime asset writes land in Phase 11; this run stops at the prewrite checkpoint.'),
    '',
    'Planned verification commands:',
    ...verificationLines,
  ].join('\n')
}
