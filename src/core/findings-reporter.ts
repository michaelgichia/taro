export type FindingsSeverity = 'BLOCKING' | 'HIGH' | 'ADVISORY'

export interface Finding {
  severity: FindingsSeverity
  /** Short free-form label: boundary | data-layer | mutation | follow-up | fixture | instability */
  category: string
  /** Plain text only — no ANSI/picocolors codes. stdout must be machine-readable. */
  message: string
}

export function formatFindingsBlock(findings: Finding[]): string {
  if (findings.length === 0) return ''
  const lines = findings.map(
    (f) => `[${f.severity}] ${f.category} — ${f.message}`
  )
  return [
    '=== taro:findings:start ===',
    ...lines,
    '=== taro:findings:end ===',
  ].join('\n')
}

export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'BLOCKING')
}
