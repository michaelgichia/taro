import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import pc from 'picocolors'
import type {
  InstallLocation,
  InstallSelection,
  NormalizedInstallOptions,
  RuntimeLocationSelections,
  RuntimeTarget,
} from './types.js'
import { SUPPORTED_RUNTIMES } from './types.js'
import { RUNTIME_REGISTRY } from './registry.js'

interface PromptIO {
  input?: typeof stdin
  output?: typeof stdout
}

const ALL_RUNTIMES_CHOICE = SUPPORTED_RUNTIMES.length + 1

function runtimeMenu(): string {
  const lines = SUPPORTED_RUNTIMES.map((runtime, index) => {
    return `  ${index + 1}. ${RUNTIME_REGISTRY[runtime].displayName}`
  })

  lines.push(`  ${ALL_RUNTIMES_CHOICE}. All runtimes`)

  return lines.join('\n')
}

function parseRuntimeSelection(answer: string): RuntimeTarget[] | null {
  const selections = answer
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => !Number.isNaN(value))

  if (selections.length === 0) {
    return null
  }

  if (selections.includes(ALL_RUNTIMES_CHOICE)) {
    return [...SUPPORTED_RUNTIMES]
  }

  const runtimes = Array.from(
    new Set(
      selections
        .filter((value) => value >= 1 && value <= SUPPORTED_RUNTIMES.length)
        .map((value) => SUPPORTED_RUNTIMES[value - 1]!)
    )
  )

  return runtimes.length > 0 ? runtimes : null
}

function parseLocation(answer: string): InstallLocation | null {
  const normalized = answer.trim().toLowerCase()

  if (normalized === '1' || normalized === 'g' || normalized === 'global') {
    return 'global'
  }

  if (normalized === '2' || normalized === 'l' || normalized === 'local') {
    return 'local'
  }

  return null
}

function deriveSelectionSource(
  normalized: NormalizedInstallOptions
): InstallSelection['source'] {
  if (normalized.source === 'flags' && normalized.mode === 'non-interactive') {
    return 'flags'
  }

  if (normalized.source === 'prompt') {
    return 'prompt'
  }

  return 'mixed'
}

export async function promptForInstallChoices(
  normalized: NormalizedInstallOptions,
  io: PromptIO = { input: stdin, output: stdout }
): Promise<InstallSelection> {
  const rl = createInterface({
    input: io.input ?? stdin,
    output: io.output ?? stdout,
  })

  try {
    let runtimes = [...normalized.runtimes]

    if (normalized.needsRuntimePrompt) {
      while (runtimes.length === 0) {
        console.log(pc.bold('Choose the runtimes to install:'))
        console.log(runtimeMenu())
        const answer = await rl.question(
          'Enter one or more numbers separated by commas: '
        )
        const selectedRuntimes = parseRuntimeSelection(answer)

        if (selectedRuntimes) {
          runtimes = selectedRuntimes
          break
        }

        console.log(pc.yellow('Select at least one runtime to continue.\n'))
      }
    }

    const locations = { ...normalized.locations } as Partial<RuntimeLocationSelections>

    for (const runtime of runtimes) {
      if (locations[runtime]) {
        continue
      }

      let location: InstallLocation | null = null

      while (!location) {
        console.log(
          `\n${pc.bold(RUNTIME_REGISTRY[runtime].displayName)} installation location:`
        )
        console.log('  1. Global')
        console.log('  2. Local')

        const answer = await rl.question('Choose 1 or 2: ')
        location = parseLocation(answer)

        if (!location) {
          console.log(pc.yellow('Choose `1` for global or `2` for local.'))
        }
      }

      locations[runtime] = location
    }

    return {
      mode: 'interactive',
      runtimes,
      locations: locations as RuntimeLocationSelections,
      source: deriveSelectionSource(normalized),
    }
  } finally {
    rl.close()
  }
}
