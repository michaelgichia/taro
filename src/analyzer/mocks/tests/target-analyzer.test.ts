import { describe, expect, it } from 'vitest'

import {
  analyzeMockLibraryUsage,
  analyzeMockTargets,
  decideMockExtraction,
  detectMockLibraries,
  groupMockTargetsByApproach,
  selectMockLibrary,
  suggestMockFilePath,
} from '#analyzer/mocks/target-analyzer.ts'
import type { ApiCallInfo } from '#analyzer/mocks/detector.ts'

function createApiCall(
  overrides: Partial<ApiCallInfo> = {}
): ApiCallInfo {
  return {
    id: 'api-1',
    method: 'fetch',
    url: 'https://api.example.com/orders',
    httpMethod: 'GET',
    isExternal: true,
    source: 'codebase',
    ...overrides,
  }
}

describe('detectMockLibraries', () => {
  it('detects supported libraries from dependencies and devDependencies', () => {
    expect(detectMockLibraries({
      dependencies: {
        msw: '^2.0.0',
        sinon: '^17.0.0',
        undici: '^6.0.0',
      },
      devDependencies: {
        jest: '^29.0.0',
        'fetch-mock': '^10.0.0',
        nock: '^14.0.0',
      },
    })).toEqual([
      expect.objectContaining({ name: 'msw', version: '^2.0.0', isConfigured: false }),
      expect.objectContaining({ name: 'jest.fn', version: '^29.0.0', isConfigured: true }),
      expect.objectContaining({ name: 'sinon', version: '^17.0.0', isConfigured: false }),
      expect.objectContaining({ name: 'fetch-mock', version: '^10.0.0', isConfigured: false }),
      expect.objectContaining({ name: 'undici', version: '^6.0.0', isConfigured: false }),
      expect.objectContaining({ name: 'nock', version: '^14.0.0', isConfigured: false }),
    ])
  })
})

describe('analyzeMockLibraryUsage', () => {
  it('detects configured library usage from code files without duplicates', () => {
    const result = analyzeMockLibraryUsage([
      {
        path: 'src/msw.ts',
        content: "import { setupWorker, http } from 'msw/'\nsetupWorker()\nhttp.get('/api')",
      },
      {
        path: 'src/jest.ts',
        content: 'vi.fn()\njest.mock("x")',
      },
      {
        path: 'src/sinon.ts',
        content: "sinon.stub(global, 'fetch')",
      },
      {
        path: 'src/network.ts',
        content: 'fetchMock.get("/api")\nconst agent = new MockAgent(); import "undici";\nnock("https://api.example.com")',
      },
    ])

    expect(result).toEqual([
      { name: 'msw', isConfigured: true, sourceFile: 'src/msw.ts' },
      { name: 'jest.fn', isConfigured: true, sourceFile: 'src/jest.ts' },
      { name: 'sinon', isConfigured: true, sourceFile: 'src/sinon.ts' },
      { name: 'fetch-mock', isConfigured: true, sourceFile: 'src/network.ts' },
      { name: 'undici', isConfigured: true, sourceFile: 'src/network.ts' },
      { name: 'nock', isConfigured: true, sourceFile: 'src/network.ts' },
    ])
  })
})

describe('selectMockLibrary and decideMockExtraction', () => {
  it('prefers configured libraries based on call type and explicit preference', () => {
    const libs = [
      { name: 'msw', isConfigured: true },
      { name: 'fetch-mock', isConfigured: false },
      { name: 'sinon', isConfigured: true },
      { name: 'jest.fn', isConfigured: true },
      { name: 'nock', isConfigured: false },
    ] as const

    expect(selectMockLibrary(createApiCall(), libs, { preferredLibrary: 'fetch-mock' })).toBe('fetch-mock')
    expect(selectMockLibrary(createApiCall({ method: 'fetch' }), libs)).toBe('msw')
    expect(selectMockLibrary(createApiCall({ method: 'XMLHttpRequest' }), libs)).toBe('sinon')
    expect(selectMockLibrary(createApiCall({ method: 'unknown' }), libs)).toBe('jest.fn')

    expect(
      decideMockExtraction(createApiCall(), ['src/__mocks__/https://api.example.com/orders.mock.ts'])
    ).toBe('shared')
    expect(decideMockExtraction(createApiCall(), [])).toBe('extracted')
    expect(
      decideMockExtraction(
        createApiCall({
          isExternal: false,
          url: '/api/orders',
          httpMethod: 'GET',
        }),
        []
      )
    ).toBe('inline')
  })
})

describe('suggestMockFilePath', () => {
  it('creates sanitized mock file paths and falls back for invalid URLs', () => {
    expect(
      suggestMockFilePath(createApiCall({ url: 'https://api.example.com/users/profile?tab=info' }), 'mocks')
    ).toBe('mocks/api.example.com/users-profile.ts')

    expect(suggestMockFilePath(createApiCall({ url: 'not a url' }))).toBe('__mocks__/api-mock.ts')
    expect(suggestMockFilePath(createApiCall({ url: undefined }))).toBe('__mocks__/api-mock.ts')
  })
})

describe('analyzeMockTargets and groupMockTargetsByApproach', () => {
  it('builds mock targets with merged library detection, rationales, and grouping', () => {
    const targets = analyzeMockTargets(
      [
        createApiCall({
          id: 'api-1',
          method: 'fetch',
          url: 'https://api.example.com/orders',
          httpMethod: 'POST',
        }),
        createApiCall({
          id: 'api-2',
          method: 'XMLHttpRequest',
          url: '/api/internal',
          httpMethod: 'GET',
          isExternal: false,
        }),
      ],
      {
        packageJson: {
          dependencies: {
            msw: '^2.0.0',
            sinon: '^17.0.0',
          },
        },
        codebaseFiles: [
          {
            path: 'src/test/setup-msw.ts',
            content: "import { setupWorker, http } from 'msw/'\nsetupWorker()\nhttp.get('/api')",
          },
          {
            path: 'src/__mocks__/orders.mock.ts',
            content: 'existing mock',
          },
        ],
      }
    )

    expect(targets).toEqual([
      expect.objectContaining({
        id: 'mock-target-api-1',
        apiCallId: 'api-1',
        mockLibrary: 'msw',
        extractionRecommendation: 'extracted',
        suggestedFilePath: '__mocks__/api.example.com/orders.ts',
        rationale: expect.stringContaining('Using msw (already configured in project). extracted to separate file'),
      }),
      expect.objectContaining({
        id: 'mock-target-api-2',
        apiCallId: 'api-2',
        mockLibrary: 'sinon',
        extractionRecommendation: 'inline',
        suggestedFilePath: undefined,
        rationale: expect.stringContaining('Using sinon (detected in dependencies). inline for simplicity (simple mock)'),
      }),
    ])

    const grouped = groupMockTargetsByApproach(targets)

    expect(grouped.get('msw:extracted')).toEqual([targets[0]])
    expect(grouped.get('sinon:inline')).toEqual([targets[1]])
  })

  it('defaults to jest.fn when no libraries are detected', () => {
    const [target] = analyzeMockTargets([createApiCall({ url: '/api/simple', isExternal: false })])

    expect(target.mockLibrary).toBe('jest.fn')
    expect(target.extractionRecommendation).toBe('inline')
    expect(target.rationale).toContain('Using jest.fn')
  })
})
