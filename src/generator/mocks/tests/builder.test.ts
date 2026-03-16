import { describe, expect, it } from 'vitest'

import type { ApiCallInfo } from '#analyzer/mocks/detector.ts'
import type { MockTarget } from '#analyzer/mocks/target-analyzer.ts'
import {
  buildMock,
  buildMocks,
  generateInlineMock,
  generateMockFile,
} from '#generator/mocks/builder.ts'

function createTarget(
  overrides: Partial<MockTarget> = {}
): MockTarget {
  return {
    apiCallId: 'call-1',
    url: 'https://api.example.com/users',
    method: 'GET',
    mockLibrary: 'msw',
    extractionRecommendation: 'inline',
    confidence: 0.9,
    reason: 'test',
    ...overrides,
  }
}

function createApiCall(
  overrides: Partial<ApiCallInfo> = {}
): ApiCallInfo {
  return {
    id: 'call-1',
    method: 'fetch',
    httpMethod: 'GET',
    url: 'https://api.example.com/users',
    isExternal: true,
    source: 'codebase',
    ...overrides,
  }
}

describe('buildMock', () => {
  it('builds an MSW mock using user-shaped data for user endpoints', () => {
    const decision = buildMock(
      createTarget({
        mockLibrary: 'msw',
        url: 'https://api.example.com/user/profile',
        method: 'GET',
        extractionRecommendation: 'inline',
      }),
      createApiCall()
    )

    expect(decision.imports).toEqual(['http', 'HttpResponse'])
    expect(decision.isInline).toBe(true)
    expect(decision.code).toContain("http.get('https://api.example.com/user/profile'")
    expect(decision.code).toContain('"email": "user@example.com"')
  })

  it('builds a jest.fn mock and defaults unknown libraries to jest.fn', () => {
    const explicit = buildMock(
      createTarget({
        mockLibrary: 'jest.fn',
        method: 'DELETE',
      }),
      createApiCall()
    )
    const fallback = buildMock(
      createTarget({
        mockLibrary: 'unknown-library' as MockTarget['mockLibrary'],
      }),
      createApiCall()
    )

    expect(explicit.code).toContain('jest.fn().mockResolvedValue({ ok: true })')
    expect(explicit.setupCode).toContain('global.fetch')
    expect(fallback.code).toContain('jest.fn().mockResolvedValue')
  })

  it('builds sinon, fetch-mock, nock, and undici mocks with library-specific setup', () => {
    const sinonDecision = buildMock(
      createTarget({ mockLibrary: 'sinon' }),
      createApiCall()
    )
    const fetchMockDecision = buildMock(
      createTarget({
        mockLibrary: 'fetch-mock',
        method: 'POST',
        extractionRecommendation: 'file',
      }),
      createApiCall()
    )
    const nockDecision = buildMock(
      createTarget({
        mockLibrary: 'nock',
        url: 'https://api.example.com/orders?status=open',
        extractionRecommendation: 'file',
      }),
      createApiCall()
    )
    const undiciDecision = buildMock(
      createTarget({
        mockLibrary: 'undici',
        method: 'PATCH',
        extractionRecommendation: 'file',
      }),
      createApiCall()
    )

    expect(sinonDecision.imports).toEqual(['sinon'])
    expect(sinonDecision.setupCode).toContain("sinon.stub(global, 'fetch')")

    expect(fetchMockDecision.imports).toEqual(['fetch-mock'])
    expect(fetchMockDecision.code).toContain("fetchMock.post('https://api.example.com/users'")
    expect(fetchMockDecision.isInline).toBe(false)

    expect(nockDecision.imports).toEqual(['nock'])
    expect(nockDecision.code).toContain("nock('https://api.example.com')")
    expect(nockDecision.code).toContain(".get('/orders')")

    expect(undiciDecision.imports).toEqual(['undici'])
    expect(undiciDecision.code).toContain('new MockAgent()')
    expect(undiciDecision.code).toContain("method: 'PATCH'")
  })
})

describe('buildMocks', () => {
  it('falls back to a synthetic api call when one is missing from the map', () => {
    const [decision] = buildMocks(
      [
        createTarget({
          apiCallId: 'missing',
          mockLibrary: 'msw',
          url: 'not-a-valid-url',
        }),
      ],
      new Map()
    )

    expect(decision.target.apiCallId).toBe('missing')
    expect(decision.code).toContain("http.get('not-a-valid-url'")
  })
})

describe('generateMockFile', () => {
  it('builds a combined mock file with shared imports and vitest hooks', () => {
    const content = generateMockFile([
      buildMock(
        createTarget({
          mockLibrary: 'msw',
          extractionRecommendation: 'file',
          url: 'https://api.example.com/list',
        }),
        createApiCall()
      ),
      buildMock(
        createTarget({
          apiCallId: 'call-2',
          mockLibrary: 'fetch-mock',
          extractionRecommendation: 'file',
          url: 'https://api.example.com/orders',
          method: 'POST',
        }),
        createApiCall({ id: 'call-2', url: 'https://api.example.com/orders', httpMethod: 'POST' })
      ),
    ], { framework: 'vitest' })

    expect(content).toContain("import { http, HttpResponse, fetch-mock }")
    expect(content).toContain('export function setupMocks()')
    expect(content).toContain('export function teardownMocks()')
    expect(content).toContain('beforeAll(() => setupMocks());')
    expect(content).toContain('afterAll(() => teardownMocks());')
  })

  it('omits vitest hooks when generating a jest-oriented mock file', () => {
    const content = generateMockFile([
      buildMock(
        createTarget({
          mockLibrary: 'msw',
          extractionRecommendation: 'file',
        }),
        createApiCall()
      ),
    ])

    expect(content).not.toContain('beforeAll(() => setupMocks());')
  })
})

describe('generateInlineMock', () => {
  it('renders inline imports, setup code, and teardown code', () => {
    const decision = buildMock(
      createTarget({
        mockLibrary: 'sinon',
      }),
      createApiCall()
    )

    const inlineCode = generateInlineMock(decision)

    expect(inlineCode).toContain("import { sinon } from 'sinon';")
    expect(inlineCode).toContain('// Setup mock for https://api.example.com/users')
    expect(inlineCode).toContain('// Cleanup after test')
  })
})
