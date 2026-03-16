import type { QueryQuality, QueryResult } from '../types/recording.js'
import pc from 'picocolors'

export function emitQuerySummary(queryResults: QueryResult[]): void {
  if (queryResults.length === 0) return

  const grouped = new Map<string, { quality: QueryQuality; lines: number[] }>()
  for (const queryResult of queryResults) {
    const existing = grouped.get(queryResult.method)
    if (existing) {
      grouped.set(queryResult.method, {
        ...existing,
        lines: [...existing.lines, ...(queryResult.line !== undefined ? [queryResult.line] : [])],
      })
    } else {
      grouped.set(queryResult.method, {
        quality: queryResult.quality,
        lines: queryResult.line !== undefined ? [queryResult.line] : [],
      })
    }
  }

  for (const [method, { quality, lines }] of grouped) {
    const count = queryResults.filter((queryResult) => queryResult.method === method).length
    const lineInfo =
      quality === 'fragile' && lines.length > 0
        ? ` — see line${lines.length > 1 ? 's' : ''} ${lines.join(', ')}`
        : ''
    process.stderr.write(
      pc.dim('[taro]') +
        ` ${count} ${method} (${quality}${lineInfo})` + '\n'
    )
  }
}
