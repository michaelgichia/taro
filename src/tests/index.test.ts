import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  parseGenerateMock,
  parseInitMock,
  parseOverridesMock,
  parseRefreshMock,
  createGenerateCommandMock,
  createInitCommandMock,
  createOverridesCommandMock,
  createRefreshCommandMock,
  createInstallCommandMock,
  createVersionCommandMock,
  applyInstallOptionsMock,
  runInstallCommandMock,
} = vi.hoisted(() => ({
  parseGenerateMock: vi.fn(),
  parseInitMock: vi.fn(),
  parseOverridesMock: vi.fn(),
  parseRefreshMock: vi.fn(),
  createGenerateCommandMock: vi.fn(() => ({ parseAsync: parseGenerateMock })),
  createInitCommandMock: vi.fn(() => ({ parseAsync: parseInitMock })),
  createOverridesCommandMock: vi.fn(() => ({ parseAsync: parseOverridesMock })),
  createRefreshCommandMock: vi.fn(() => ({ parseAsync: parseRefreshMock })),
  createInstallCommandMock: vi.fn(() => ({ name: () => 'install' })),
  createVersionCommandMock: vi.fn(() => ({ name: () => 'version' })),
  applyInstallOptionsMock: vi.fn((command) => command),
  runInstallCommandMock: vi.fn().mockResolvedValue(undefined),
}))

class MockCommand {
  addedCommands: unknown[] = []
  storedAction?: () => unknown
  opts = { codex: true, local: true }

  name(): this {
    return this
  }

  description(): this {
    return this
  }

  version(): this {
    return this
  }

  helpOption(): this {
    return this
  }

  addHelpText(): this {
    return this
  }

  action(callback: () => unknown): this {
    this.storedAction = callback
    return this
  }

  addCommand(command: unknown): this {
    this.addedCommands.push(command)
    return this
  }

  optsWithGlobals(): typeof this.opts {
    return this.opts
  }

  parse(): this {
    void this.storedAction?.()
    return this
  }
}

vi.mock('commander', () => ({
  Command: MockCommand,
}))

vi.mock('#cli/commands/generate.ts', () => ({
  createGenerateCommand: createGenerateCommandMock,
}))

vi.mock('#cli/commands/init.ts', () => ({
  createInitCommand: createInitCommandMock,
}))

vi.mock('#cli/commands/overrides.ts', () => ({
  createOverridesCommand: createOverridesCommandMock,
}))

vi.mock('#cli/commands/refresh.ts', () => ({
  createRefreshCommand: createRefreshCommandMock,
}))

vi.mock('#cli/commands/install.ts', () => ({
  applyInstallOptions: applyInstallOptionsMock,
  createInstallCommand: createInstallCommandMock,
  runInstallCommand: runInstallCommandMock,
}))

vi.mock('#cli/commands/version.ts', () => ({
  createVersionCommand: createVersionCommandMock,
}))

vi.mock('#version.ts', () => ({
  TARO_VERSION: '1.2.3',
}))

async function importIndexWithArg(command?: string, extraArgs: string[] = []) {
  vi.resetModules()
  process.argv = ['node', 'taro', ...(command ? [command] : []), ...extraArgs]
  await import('../index.ts')
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('src/index.ts', () => {
  it('routes __generate to the internal generate command', async () => {
    await importIndexWithArg('__generate', ['recording.js'])

    expect(createGenerateCommandMock).toHaveBeenCalled()
    expect(parseGenerateMock).toHaveBeenCalledWith(['recording.js'], { from: 'user' })
  })

  it('routes __init to the internal init command', async () => {
    await importIndexWithArg('__init', ['--force'])

    expect(createInitCommandMock).toHaveBeenCalled()
    expect(parseInitMock).toHaveBeenCalledWith(['--force'], { from: 'user' })
  })

  it('routes __overrides to the internal overrides command', async () => {
    await importIndexWithArg('__overrides', ['--stdout'])

    expect(createOverridesCommandMock).toHaveBeenCalled()
    expect(parseOverridesMock).toHaveBeenCalledWith(['--stdout'], { from: 'user' })
  })

  it('routes __refresh to the internal refresh command', async () => {
    await importIndexWithArg('__refresh', ['--verbose'])

    expect(createRefreshCommandMock).toHaveBeenCalled()
    expect(parseRefreshMock).toHaveBeenCalledWith(['--verbose'], { from: 'user' })
  })

  it('configures the installer-first CLI path and runs the default action', async () => {
    await importIndexWithArg(undefined, ['--codex', '--local'])
    await Promise.resolve()

    expect(applyInstallOptionsMock).toHaveBeenCalled()
    expect(createInstallCommandMock).toHaveBeenCalled()
    expect(createVersionCommandMock).toHaveBeenCalled()
    expect(runInstallCommandMock).toHaveBeenCalledWith({ codex: true, local: true })
  })
})
