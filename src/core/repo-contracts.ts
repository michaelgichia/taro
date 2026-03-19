import { analyzeBoundaryIsolation } from '#core/boundary-intelligence.ts'

type RepoContractIssueCode =
  | 'helper-assertion'
  | 'query-to-be-defined'
  | 'loose-payload'
  | 'shared-mutable-mock-state'
  | 'split-async-mock-assertions'
  | 'manual-dom-repair'
  | 'regex-text-matcher'
  | 'mixed-reset-boundary'
  | 'generic-component-contract'
  | 'anonymous-asset-mock'

interface RepoContractIssue {
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
    'Avoid mutable shared objects to control mock behavior - hoist plain vi.fn() mocks, keep vi.mock factories shape-only, set the default mockImplementation in beforeEach, and override per-test with a complete mockImplementation.',
  'split-async-mock-assertions':
    'Keep async mock call count and payload assertions inside the same waitFor callback to avoid race conditions.',
  'manual-dom-repair':
    'Avoid teardown that combines cleanup() with manual document.body mutations - fix the component leak at the source instead.',
  'regex-text-matcher':
    'Avoid regex text matchers for exact rendered contracts unless the pattern itself is the behavior under test.',
  'mixed-reset-boundary':
    'Avoid mixed reset boundaries - use either a shared reset helper or explicit suite-local mock resets, not both.',
  'generic-component-contract':
    'Avoid umbrella component-only buckets like "renders the primary UI contract" or "exposes the main interactive controls" - emit one behavior per it(...) block.',
  'anonymous-asset-mock':
    'Asset mocks should expose a stable queryable identity and forward props; anonymous <svg /> mocks hide which branch rendered.',
}

const DETECTORS: Array<[RepoContractIssueCode, RegExp]> = [
  [
    'query-to-be-defined',
    /\bexpect\s*\(\s*(?:await\s+)?(?:screen|within\([^)]*\)|[a-zA-Z_$][\w$]*\.(?:getBy|findBy|queryBy))/m,
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
  [
    'generic-component-contract',
    /\bit\s*\(\s*['"](?:renders the primary UI contract|exposes the main interactive controls)['"]/,
  ],
  [
    'anonymous-asset-mock',
    /(?:vi|jest)\.mock\s*\(\s*['"][^'"]+\.svg['"][\s\S]*?<svg\b(?![^>]*data-testid=)[^>]*\/>/,
  ],
]

export function detectRepoContractIssues(code: string): RepoContractIssue[] {
  const issues: RepoContractIssue[] = []

  const hasHelperAssertion = analyzeBoundaryIsolation(code).some(
    (issue) => issue.kind === 'helper-embedded-assertion'
  )
  if (hasHelperAssertion) {
    issues.push({
      code: 'helper-assertion',
      message: ISSUE_MESSAGES['helper-assertion'],
    })
  }

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
