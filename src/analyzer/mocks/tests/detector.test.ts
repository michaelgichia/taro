import { describe, expect, it } from 'vitest'

import {
  detectApiCalls,
  detectApiCallsFromCodebase,
  detectApiCallsFromRecording,
  filterMockableCalls,
  groupApiCallsByDomain,
} from '#analyzer/mocks/detector.ts'
import type { NormalizedRecording } from '#types/recording.ts'

describe('detectApiCallsFromRecording', () => {
  it('detects API calls from step URLs, selectors, and explicit network metadata', () => {
    const recording: NormalizedRecording = {
      title: 'Flow',
      rawStepCount: 3,
      steps: [
        {
          id: 'json-step-1',
          type: 'assert',
          action: 'assert',
          target: '/api/orders?status=open',
        },
        {
          id: 'json-step-2',
          type: 'fill',
          action: 'fill',
          target: 'graphql',
          value: 'https://api.example.com/users.json',
        },
        {
          id: 'json-step-3',
          type: 'click',
          action: 'click',
          target: 'button',
          metadata: {
            networkCall: true,
            networkMethod: 'axios',
            networkUrl: 'https://service.io/rest/items',
          },
        },
      ],
    }

    expect(detectApiCallsFromRecording(recording)).toEqual([
      expect.objectContaining({
        id: 'recording-json-step-2',
        method: 'fetch',
        url: 'https://api.example.com/users.json',
        isExternal: true,
        source: 'recording',
        recordingStepId: 'json-step-2',
      }),
      expect.objectContaining({
        id: 'recording-network-json-step-3',
        method: 'axios',
        url: 'https://service.io/rest/items',
        isExternal: true,
        source: 'recording',
        recordingStepId: 'json-step-3',
      }),
    ])
  })
})

describe('detectApiCallsFromCodebase', () => {
  it('detects fetch, XMLHttpRequest, and axios calls from source files', () => {
    const result = detectApiCallsFromCodebase([
      {
        path: 'src/api.ts',
        content: [
          "await fetch(apiUrl, { method: 'post' })",
          'const xhr = new XMLHttpRequest()',
          "axios.get('https://api.example.com/users')",
        ].join('\n'),
      },
    ])

    expect(result).toEqual([
      expect.objectContaining({
        id: 'codebase-src/api.ts-1',
        method: 'fetch',
        url: '[dynamic - ${apiUrl}]',
        httpMethod: 'POST',
        isExternal: false,
        source: 'codebase',
        codebaseLocation: { file: 'src/api.ts', line: 1 },
      }),
      expect.objectContaining({
        id: 'codebase-src/api.ts-2',
        method: 'XMLHttpRequest',
        isExternal: true,
        codebaseLocation: { file: 'src/api.ts', line: 2 },
      }),
      expect.objectContaining({
        id: 'codebase-src/api.ts-3',
        method: 'axios',
        url: 'https://api.example.com/users',
        httpMethod: 'GET',
        isExternal: true,
        codebaseLocation: { file: 'src/api.ts', line: 3 },
      }),
    ])
  })
})

describe('detectApiCalls', () => {
  it('combines recording and codebase results, deduplicating URL-based calls', () => {
    const recording: NormalizedRecording = {
      title: 'Flow',
      rawStepCount: 1,
      steps: [
        {
          id: 'json-step-1',
          type: 'click',
          action: 'click',
          target: 'button',
          metadata: {
            networkCall: true,
            networkMethod: 'fetch',
            networkUrl: 'https://api.example.com/orders',
          },
        },
      ],
    }

    const result = detectApiCalls(recording, [
      {
        path: 'src/orders.ts',
        content: "fetch('https://api.example.com/orders')",
      },
      {
        path: 'src/xhr.ts',
        content: 'const xhr = new XMLHttpRequest()',
      },
    ])

    expect(result).toEqual([
      expect.objectContaining({
        method: 'fetch',
        url: 'https://api.example.com/orders',
        source: 'both',
      }),
      expect.objectContaining({
        method: 'XMLHttpRequest',
        source: 'codebase',
      }),
    ])
  })
})

describe('filterMockableCalls and groupApiCallsByDomain', () => {
  it('filters external calls and groups valid, invalid, and missing URLs', () => {
    const calls = [
      {
        id: 'a',
        method: 'fetch' as const,
        url: 'https://api.example.com/orders',
        isExternal: true,
        source: 'recording' as const,
      },
      {
        id: 'b',
        method: 'fetch' as const,
        url: '/api/orders',
        isExternal: false,
        source: 'codebase' as const,
      },
      {
        id: 'c',
        method: 'axios' as const,
        url: 'not a valid url',
        isExternal: true,
        source: 'codebase' as const,
      },
      {
        id: 'd',
        method: 'unknown' as const,
        isExternal: true,
        source: 'codebase' as const,
      },
    ]

    expect(filterMockableCalls(calls).map((call) => call.id)).toEqual(['a', 'c', 'd'])

    const grouped = groupApiCallsByDomain(calls)

    expect(grouped.get('api.example.com')).toEqual([calls[0]])
    expect(grouped.get('unknown')).toEqual([calls[1], calls[2], calls[3]])
  })
})
