import { describe, expect, it } from 'vitest'
import { createVersionCommand, runVersionCommand } from './version.js'
import { TARO_VERSION } from '../../version.js'

function createLogger() {
  const logs: string[] = []

  return {
    logs,
    logger: {
      log: (value: string) => logs.push(value),
    },
  }
}

describe('runVersionCommand', () => {
  it('prints the current Taro version', () => {
    const { logs, logger } = createLogger()

    runVersionCommand({ logger })

    expect(logs).toEqual([TARO_VERSION])
  })
})

describe('createVersionCommand', () => {
  it('creates a version subcommand that prints the current version', async () => {
    const { logs, logger } = createLogger()
    const command = createVersionCommand({ logger })

    await command.parseAsync([], { from: 'user' })

    expect(command.name()).toBe('version')
    expect(logs).toEqual([TARO_VERSION])
  })
})
