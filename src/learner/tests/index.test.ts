import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyConvention } from '#learner/types.ts'

const {
  extractConventionsMock,
  createStoreMock,
  saveConventionsMock,
  closeStoreMock,
  findReadableProjectStatePathSyncMock,
  initConventionStoreMock,
  loadConventionsMock,
  closeConventionStoreMock,
} = vi.hoisted(() => ({
  extractConventionsMock: vi.fn(),
  createStoreMock: vi.fn(),
  saveConventionsMock: vi.fn(),
  closeStoreMock: vi.fn(),
  findReadableProjectStatePathSyncMock: vi.fn(),
  initConventionStoreMock: vi.fn(),
  loadConventionsMock: vi.fn(),
  closeConventionStoreMock: vi.fn(),
}))

vi.mock('#learner/analyzer.ts', () => ({
  extractConventions: extractConventionsMock,
}))

vi.mock('#learner/storage.ts', () => {
  class MockConventionStore {
    public dbPath: string

    constructor(dbPath: string) {
      this.dbPath = dbPath
    }

    init(): void {
      initConventionStoreMock(this.dbPath)
    }

    loadConventions(): unknown {
      return loadConventionsMock(this.dbPath)
    }

    close(): void {
      closeConventionStoreMock(this.dbPath)
    }
  }

  return {
    ConventionStore: MockConventionStore,
    createStore: createStoreMock,
  }
})

vi.mock('#project-state.ts', () => ({
  findReadableProjectStatePathSync: findReadableProjectStatePathSyncMock,
}))

import {
  getConventions,
  InMemoryConventionStore,
  learnConventions,
} from '#learner/index.ts'

const sandboxRoots: string[] = []

afterEach(() => {
  sandboxRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function createSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'taro-learner-index-'))
  sandboxRoots.push(root)
  return root
}

function convention(overrides: Partial<ReturnType<typeof createEmptyConvention>> = {}) {
  return {
    ...createEmptyConvention(),
    ...overrides,
    naming: {
      ...createEmptyConvention().naming,
      ...overrides.naming,
    },
    structure: {
      ...createEmptyConvention().structure,
      ...overrides.structure,
    },
    queries: {
      ...createEmptyConvention().queries,
      ...overrides.queries,
    },
    matchers: {
      ...createEmptyConvention().matchers,
      ...overrides.matchers,
    },
    imports: {
      ...createEmptyConvention().imports,
      ...overrides.imports,
    },
  }
}

describe('learnConventions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createStoreMock.mockReturnValue({
      saveConventions: saveConventionsMock,
      close: closeStoreMock,
    })
    extractConventionsMock.mockImplementation((dir: string) => {
      if (dir.endsWith('/tests')) {
        return convention({
          naming: {
            pattern: 'kebab-case',
            describePrefix: 'checkout-flow',
            itTemplate: 'renders {description}',
          },
          queries: {
            preferred: ['getByRole'],
            avoided: [],
          },
          imports: {
            common: ['vitest'],
          },
        })
      }

      if (dir.endsWith('/__tests__')) {
        return convention({
          structure: {
            describePerComponent: true,
            helpersInDescribe: true,
            setupLocation: 'beforeeach',
          },
          queries: {
            preferred: ['findByText'],
            avoided: ['getByTestId'],
          },
          matchers: {
            common: ['toBeVisible'],
          },
          imports: {
            common: ['@testing-library/react'],
          },
        })
      }

      return convention({
        matchers: {
          common: ['toBeInTheDocument'],
        },
      })
    })
  })

  it('learns conventions from discovered test directories and files, then persists them', () => {
    const root = createSandbox()
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'tests'), { recursive: true })
    mkdirSync(join(root, '__tests__'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    mkdirSync(join(root, '.hidden'), { recursive: true })
    writeFileSync(join(root, 'tests', 'checkout.test.ts'), '')
    writeFileSync(join(root, '__tests__', 'cart.spec.tsx'), '')
    writeFileSync(join(root, 'node_modules', 'pkg', 'ignored.test.ts'), '')
    writeFileSync(join(root, '.hidden', 'ignored.test.ts'), '')

    const result = learnConventions(root)

    expect(extractConventionsMock).toHaveBeenCalledWith(join(root, 'tests'))
    expect(extractConventionsMock).toHaveBeenCalledWith(join(root, '__tests__'))
    expect(result.naming).toEqual({
      pattern: 'kebab-case',
      describePrefix: 'checkout-flow',
      itTemplate: 'renders {description}',
    })
    expect(result.structure).toEqual({
      describePerComponent: true,
      helpersInDescribe: true,
      setupLocation: 'inside-describe',
    })
    expect(result.queries.preferred).toEqual(
      expect.arrayContaining(['getByRole', 'findByText'])
    )
    expect(result.queries.avoided).toEqual(['getByTestId'])
    expect(result.matchers.common).toEqual(['toBeVisible'])
    expect(result.imports.common).toEqual(
      expect.arrayContaining(['vitest', '@testing-library/react'])
    )
    expect(createStoreMock).toHaveBeenCalledWith(root)
    expect(saveConventionsMock).toHaveBeenCalledWith(result)
    expect(closeStoreMock).toHaveBeenCalled()
  })

  it('returns learned conventions even when persistence fails', () => {
    const root = createSandbox()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createStoreMock.mockImplementation(() => {
      throw new Error('db unavailable')
    })
    mkdirSync(join(root, 'tests'), { recursive: true })
    writeFileSync(join(root, 'tests', 'checkout.test.ts'), '')

    const result = learnConventions(root)

    expect(result.naming.pattern).toBe('kebab-case')
    expect(warnSpy).toHaveBeenCalledWith(
      '[learnConventions] Failed to save conventions:',
      expect.any(Error)
    )
  })
})

describe('getConventions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no readable conventions database exists', () => {
    const root = createSandbox()
    findReadableProjectStatePathSyncMock.mockReturnValue(null)

    expect(getConventions(root)).toBeNull()

    findReadableProjectStatePathSyncMock.mockReturnValue(join(root, 'missing.db'))
    expect(getConventions(root)).toBeNull()
  })

  it('loads persisted conventions through ConventionStore', () => {
    const root = createSandbox()
    const dbPath = join(root, 'conventions.db')
    writeFileSync(dbPath, 'placeholder')
    const persisted = convention({
      naming: {
        pattern: 'snake_case',
        describePrefix: 'orders',
        itTemplate: 'shows {description}',
      },
    })
    findReadableProjectStatePathSyncMock.mockReturnValue(dbPath)
    loadConventionsMock.mockReturnValue(persisted)

    expect(getConventions(root)).toEqual(persisted)
    expect(initConventionStoreMock).toHaveBeenCalledWith(dbPath)
    expect(closeConventionStoreMock).toHaveBeenCalledWith(dbPath)
  })

  it('warns and returns null when store loading throws', () => {
    const root = createSandbox()
    const dbPath = join(root, 'conventions.db')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    writeFileSync(dbPath, 'placeholder')
    findReadableProjectStatePathSyncMock.mockReturnValue(dbPath)
    initConventionStoreMock.mockImplementation(() => {
      throw new Error('init failed')
    })

    expect(getConventions(root)).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      '[getConventions] Failed to load conventions:',
      expect.any(Error)
    )
  })
})

describe('InMemoryConventionStore', () => {
  it('adds, reads, clones, clears, and merges conventions', () => {
    const primary = new InMemoryConventionStore()
    const other = new InMemoryConventionStore()
    const appConvention = convention({
      naming: {
        pattern: 'snake_case',
        describePrefix: 'user',
        itTemplate: 'should {description}',
      },
      queries: {
        preferred: ['getByRole'],
        avoided: [],
      },
      imports: {
        common: ['vitest'],
      },
    })
    const sharedConvention = convention({
      structure: {
        describePerComponent: true,
        helpersInDescribe: true,
        setupLocation: 'beforeeach',
      },
      queries: {
        preferred: ['findByText'],
        avoided: ['getByTestId'],
      },
      matchers: {
        common: ['toBeVisible'],
      },
      imports: {
        common: ['@testing-library/react'],
      },
    })

    primary.add('app', appConvention)
    other.add('shared', sharedConvention)

    expect(primary.has('app')).toBe(true)
    expect(primary.get('app')).toEqual(appConvention)

    const cloned = primary.getAll()
    cloned.set('mutated', createEmptyConvention())
    expect(primary.has('mutated')).toBe(false)

    const merged = primary.merge(other)

    expect(merged.naming.pattern).toBe('camelCase')
    expect(merged.structure).toEqual({
      describePerComponent: true,
      helpersInDescribe: true,
      setupLocation: 'inside-describe',
    })
    expect(merged.queries.preferred).toEqual(['findByText'])
    expect(merged.queries.avoided).toEqual(['getByTestId'])
    expect(merged.matchers.common).toEqual(['toBeVisible'])
    expect(merged.imports.common).toEqual(['@testing-library/react'])

    primary.clear()
    expect(primary.getAll().size).toBe(0)
  })

  it('promotes a non-default naming pattern when merging from the other store', () => {
    const primary = new InMemoryConventionStore()
    const other = new InMemoryConventionStore()

    other.add(
      'named',
      convention({
        naming: {
          pattern: 'snake_case',
          describePrefix: 'orders',
          itTemplate: 'shows {description}',
        },
      })
    )

    expect(primary.merge(other).naming.pattern).toBe('snake_case')
  })
})
