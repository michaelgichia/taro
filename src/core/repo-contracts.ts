export type RepoContractIssueCode =
  | 'helper-assertion'
  | 'query-to-be-defined'
  | 'loose-payload'
  | 'shared-mutable-mock-state'
  | 'split-async-mock-assertions'
  | 'manual-dom-repair'
  | 'regex-text-matcher'
  | 'mixed-reset-boundary'

export interface RepoContractIssue {
  code: RepoContractIssueCode
  message: string
}

const ISSUE_MESSAGES: Record<RepoContractIssueCode, string> = {
  'helper-assertion':
    'Keep assertions out of setup helpers - shared interaction utilities should prepare state, not assert outcomes.',
  'query-to-be-defined':
    'Avoid .toBeDefined() on RTL query results - rely on the query throw or use .toBeInTheDocument().',
  'loose-payload':
    'Avoid loose payload matchers for known user-driven values - assert exact mutation payload fields when the test set them explicitly.',
  'shared-mutable-mock-state':
    'Avoid mutable shared objects to control mock behavior - hoist plain vi.fn() mocks, set a default mockImplementation in beforeEach, and override per-test with a complete mockImplementation.',
  'split-async-mock-assertions':
    'Keep async mock call count and payload assertions inside the same waitFor callback to avoid race conditions.',
  'manual-dom-repair':
    'Avoid teardown that combines cleanup() with manual document.body mutations - fix the component leak at the source instead.',
  'regex-text-matcher':
    'Avoid regex text matchers for exact rendered contracts unless the pattern itself is the behavior under test.',
  'mixed-reset-boundary':
    'Avoid mixed reset boundaries - use either a shared reset helper or explicit suite-local mock resets, not both.',
}

const DETECTORS: Array<[RepoContractIssueCode, RegExp]> = [
  [
    'query-to-be-defined',
    /\bexpect\s*\(\s*(?:await\s+)?(?:screen|within\([^)]*\)|[a-zA-Z_$][\w$]*\.(?:getBy|findBy|queryBy))/m,
  ],
  [
    'helper-assertion',
    /(?:const|function)\s+(?:setup|plan[A-Z]\w*|open[A-Z]\w*|prepare[A-Z]\w*|render[A-Z]\w*)[\s\S]{0,1200}?\bexpect\s*\(/,
  ],
  ['loose-payload', /toHaveBeenCalledWith\s*\([\s\S]*expect\.(?:any|anything)\s*\(/],
  [
    'shared-mutable-mock-state',
    /(?:const\s+\w+\s*=\s*\{[\s\S]*?\bbeforeEach\s*\([\s\S]*?\b\w+\.\w+\s*=|vi\.hoisted\s*\(\s*\(\)\s*=>[\s\S]*?(?::\s*(?:false|true|null|"|'|\d)|(?:outcome|control|state|shouldFail)\s*:))/,
  ],
  [
    'split-async-mock-assertions',
    /waitFor\s*\([\s\S]*toHaveBeenCalledTimes\([\s\S]*\)\s*\)[\s\S]*toHaveBeenCalledWith\(/,
  ],
  [
    'manual-dom-repair',
    /afterEach\s*\([\s\S]*cleanup\s*\([\s\S]*document\.body\./,
  ],
  [
    'regex-text-matcher',
    /(?:getByText|findByText|queryByText)\s*\(\s*\/.*\/[gimsuy]*\s*[),]/,
  ],
  [
    'mixed-reset-boundary',
    /\breset[A-Z]\w*\s*\(\s*\)[\s\S]*\.\s*mock(?:Clear|Reset)\s*\(/,
  ],
]

export function detectRepoContractIssues(code: string): RepoContractIssue[] {
  const issues: RepoContractIssue[] = []

  const hasQueryToBeDefined =
    DETECTORS[0]![1].test(code) && /\.toBeDefined\s*\(\s*\)/.test(code)
  if (hasQueryToBeDefined) {
    issues.push({
      code: 'query-to-be-defined',
      message: ISSUE_MESSAGES['query-to-be-defined'],
    })
  }

  for (const [codeKey, pattern] of DETECTORS.slice(1)) {
    if (!pattern.test(code)) {
      continue
    }

    issues.push({
      code: codeKey,
      message: ISSUE_MESSAGES[codeKey],
    })
  }

  return issues
}
