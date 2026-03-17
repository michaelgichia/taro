import { describe, expect, it } from 'vitest'

import {
  InstallValidationError,
  normalizeInstallOptions,
  toInstallSelection,
} from '#install/options.ts'

describe('normalizeInstallOptions', () => {
  it('materializes non-interactive all-runtime global installs from flags', () => {
    const result = normalizeInstallOptions({
      all: true,
      global: true,
    })

    expect(result).toEqual({
      mode: 'non-interactive',
      runtimes: ['claude', 'opencode', 'gemini', 'codex'],
      locations: {
        claude: 'global',
        opencode: 'global',
        gemini: 'global',
        codex: 'global',
      },
      needsRuntimePrompt: false,
      runtimesNeedingLocation: [],
      source: 'flags',
    })
  })

  it('returns interactive mixed-mode state when runtimes are selected but location is missing', () => {
    const result = normalizeInstallOptions(
      {
        claude: true,
        codex: true,
      },
      {
        input: { isTTY: true },
        output: { isTTY: true },
      }
    )

    expect(result).toEqual({
      mode: 'interactive',
      runtimes: ['claude', 'codex'],
      locations: {},
      needsRuntimePrompt: false,
      runtimesNeedingLocation: ['claude', 'codex'],
      source: 'mixed',
    })
  })

  it('returns prompt mode when no flags are supplied and prompt capability exists', () => {
    const result = normalizeInstallOptions(
      {},
      {
        input: { isTTY: true },
        output: { isTTY: true },
      }
    )

    expect(result).toEqual({
      mode: 'interactive',
      runtimes: [],
      locations: {},
      needsRuntimePrompt: true,
      runtimesNeedingLocation: [],
      source: 'prompt',
    })
  })

  it('keeps the chosen local location while still requiring runtime prompts', () => {
    const result = normalizeInstallOptions(
      { local: true },
      {
        input: { isTTY: true },
        output: { isTTY: true },
      }
    )

    expect(result).toEqual({
      mode: 'interactive',
      runtimes: [],
      locations: {},
      needsRuntimePrompt: true,
      runtimesNeedingLocation: [],
      source: 'mixed',
    })
  })

  it('throws for conflicting location flags or missing prompt capability', () => {
    expect(() =>
      normalizeInstallOptions({
        global: true,
        local: true,
      })
    ).toThrowError(
      new InstallValidationError('Choose either `--global` or `--local`, not both.')
    )

    expect(() =>
      normalizeInstallOptions(
        {
          claude: true,
        },
        {
          input: { isTTY: false },
          output: { isTTY: false },
        }
      )
    ).toThrowError(
      new InstallValidationError(
        'Non-interactive install requires runtime flags (`--claude`, `--opencode`, `--gemini`, `--codex`, or `--all`) and exactly one location flag (`--global` or `--local`).'
      )
    )
  })
})

describe('toInstallSelection', () => {
  it('materializes a complete non-interactive selection', () => {
    const selection = toInstallSelection({
      mode: 'non-interactive',
      runtimes: ['claude', 'gemini'],
      locations: {
        claude: 'global',
        gemini: 'local',
      },
      needsRuntimePrompt: false,
      runtimesNeedingLocation: [],
      source: 'mixed',
    })

    expect(selection).toEqual({
      mode: 'non-interactive',
      runtimes: ['claude', 'gemini'],
      locations: {
        claude: 'global',
        gemini: 'local',
      },
      source: 'mixed',
    })
  })

  it('throws when prompts are still required or a runtime location is missing', () => {
    expect(() =>
      toInstallSelection({
        mode: 'interactive',
        runtimes: ['claude'],
        locations: {},
        needsRuntimePrompt: false,
        runtimesNeedingLocation: ['claude'],
        source: 'mixed',
      })
    ).toThrowError(
      new InstallValidationError(
        'Cannot materialize install selection before interactive prompts complete.'
      )
    )

    expect(() =>
      toInstallSelection({
        mode: 'non-interactive',
        runtimes: ['claude'],
        locations: {},
        needsRuntimePrompt: false,
        runtimesNeedingLocation: [],
        source: 'flags',
      })
    ).toThrowError(
      new InstallValidationError('Missing install location for claude.')
    )
  })
})
