import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  isLabelTextQueryMethod,
  isPlaceholderTextQueryMethod,
  isRoleQueryMethod,
  isTestIdQueryMethod,
  isTextQueryMethod,
} from '#core/query-policy.ts'
import type {
  JsBaselineMetadata,
  NormalizedRecording,
  NormalizedStep,
  QueryDescriptor,
  SemanticMarkerCandidate,
  SemanticMarkerCanonicalRecovery,
} from '#types/recording.ts'

export interface SemanticMarkerContextMatch {
  filePath: string
  kind: 'source' | 'test'
  matchedTerms: string[]
  score: number
}

interface RecoveryCandidate {
  score: number
  sourceFile: string
  text: string
}

const STRING_LITERAL_REGEX =
  /(?<quote>['"`])(?<value>(?:\\.|(?!\k<quote>)[^\\\r\n]){4,})\k<quote>/g
const HIDDEN_EVIDENCE_PATTERN =
  /data-testid|data-test-id|getBy(?:TestId|Role|Text|LabelText|PlaceholderText)|findBy(?:TestId|Role|Text|LabelText|PlaceholderText)|querySelector|nth-(?:of-type|child)|\.css-[\w-]+|#radix-[\w-]+|^\.\w|^\#\w|^\//i

function normalizeText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

function escapeSingleQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function looksLikeHiddenEvidence(value: string): boolean {
  return HIDDEN_EVIDENCE_PATTERN.test(value)
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0)
}

function isTokenCompatible(fragment: string, candidate: string): boolean {
  const fragmentTokens = tokenize(fragment)
  const candidateTokens = tokenize(candidate)
  if (fragmentTokens.length === 0 || candidateTokens.length === 0) {
    return false
  }

  let searchIndex = 0
  for (const token of fragmentTokens) {
    const foundIndex = candidateTokens.findIndex(
      (candidateToken, index) => index >= searchIndex && candidateToken.startsWith(token)
    )
    if (foundIndex === -1) {
      return false
    }

    searchIndex = foundIndex + 1
  }

  return true
}

function buildRecoveredQuery(
  query: QueryDescriptor,
  recoveredText: string
): QueryDescriptor | undefined {
  if (query.queryRoot === 'document' || isTestIdQueryMethod(query.method)) {
    return undefined
  }

  if (isRoleQueryMethod(query.method)) {
    if (!query.role) {
      return undefined
    }

    return {
      ...query,
      name: recoveredText,
      target: recoveredText,
      raw: `screen.${query.method}('${escapeSingleQuote(query.role)}', { name: '${escapeSingleQuote(recoveredText)}' })`,
    }
  }

  if (
    !isTextQueryMethod(query.method) &&
    !isLabelTextQueryMethod(query.method) &&
    !isPlaceholderTextQueryMethod(query.method)
  ) {
    return undefined
  }

  return {
    ...query,
    target: recoveredText,
    raw: `screen.${query.method}('${escapeSingleQuote(recoveredText)}')`,
  }
}

function extractUserVisibleStrings(content: string): string[] {
  const unique = new Set<string>()

  for (const match of content.matchAll(STRING_LITERAL_REGEX)) {
    const rawValue = match.groups?.value
    const normalized = normalizeText(rawValue?.replace(/\\n/g, ' '))
    if (!normalized || looksLikeHiddenEvidence(normalized)) {
      continue
    }

    unique.add(normalized)
  }

  return [...unique]
}

function canRecoverCandidate(candidate: SemanticMarkerCandidate): boolean {
  if (candidate.proofSubject === 'concrete-value') {
    return false
  }

  if (
    candidate.proofSubject !== 'heading' &&
    candidate.proofSubject !== 'visible-message' &&
    candidate.proofSubject !== 'field-label'
  ) {
    return false
  }

  if (!candidate.query) {
    return false
  }

  return Boolean(buildRecoveredQuery(candidate.query, candidate.proofText ?? candidate.target ?? ''))
}

function scoreRecoveryCandidate(
  fragment: string,
  candidateText: string,
  fileScore: number
): number {
  const fragmentLower = fragment.toLowerCase()
  const candidateLower = candidateText.toLowerCase()
  if (candidateLower === fragmentLower || !candidateLower.includes(fragmentLower)) {
    return Number.NEGATIVE_INFINITY
  }

  if (!isTokenCompatible(fragment, candidateText)) {
    return Number.NEGATIVE_INFINITY
  }

  let score = fileScore
  score += candidateLower.startsWith(fragmentLower) ? 40 : 24
  score += Math.max(0, 20 - Math.max(0, candidateText.length - fragment.length))
  score += /[:.!?)]$/.test(candidateText) ? 3 : 0
  score += candidateText.split(/\s+/).length > fragment.split(/\s+/).length ? 4 : 0

  return score
}

function findBestRecoveryCandidate(
  fragment: string,
  matches: Array<SemanticMarkerContextMatch & { strings: string[] }>
): RecoveryCandidate | undefined {
  const rankedByText = new Map<string, RecoveryCandidate>()

  for (const match of matches) {
    for (const candidateText of match.strings) {
      const score = scoreRecoveryCandidate(fragment, candidateText, match.score)
      if (!Number.isFinite(score)) {
        continue
      }

      const existing = rankedByText.get(candidateText)
      if (!existing || score > existing.score) {
        rankedByText.set(candidateText, {
          score,
          sourceFile: match.filePath,
          text: candidateText,
        })
      }
    }
  }

  const ranked = [...rankedByText.values()].sort(
    (left, right) => right.score - left.score || left.text.localeCompare(right.text)
  )
  const best = ranked[0]
  const second = ranked[1]
  if (!best) {
    return undefined
  }

  if (second && best.score - second.score < 8) {
    return undefined
  }

  return best
}

function applyRecoveryToCandidate(
  candidate: SemanticMarkerCandidate,
  recovery: SemanticMarkerCanonicalRecovery
): SemanticMarkerCandidate {
  const query = candidate.query ? buildRecoveredQuery(candidate.query, recovery.toText) : undefined
  if (candidate.query && !query) {
    return candidate
  }

  return {
    ...candidate,
    target: recovery.toText,
    proofText: recovery.toText,
    query,
    canonicalRecovery: recovery,
  }
}

function updateStepCandidate(
  step: NormalizedStep,
  recoveriesByStepId: Map<string, SemanticMarkerCanonicalRecovery>
): NormalizedStep {
  const candidate = step.metadata?.semanticMarkerCandidate ?? step.semanticMarkerCandidate
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('stepId' in candidate) ||
    typeof candidate.stepId !== 'string'
  ) {
    return step
  }

  const recovery = recoveriesByStepId.get(candidate.stepId)
  if (!recovery) {
    return step
  }

  const nextCandidate = applyRecoveryToCandidate(candidate as SemanticMarkerCandidate, recovery)
  return {
    ...step,
    target: nextCandidate.target,
    semanticMarkerCandidate: nextCandidate,
    metadata: {
      ...(step.metadata ?? {}),
      semanticMarkerCandidate: nextCandidate,
    },
  }
}

function updateBaselineCandidates(
  baseline: JsBaselineMetadata | undefined,
  recoveriesByStepId: Map<string, SemanticMarkerCanonicalRecovery>
): JsBaselineMetadata | undefined {
  if (!baseline) {
    return undefined
  }

  return {
    ...baseline,
    semanticMarkerCandidates: baseline.semanticMarkerCandidates?.map((candidate) => {
      const recovery = recoveriesByStepId.get(candidate.stepId)
      return recovery ? applyRecoveryToCandidate(candidate, recovery) : candidate
    }),
    itGroups: baseline.itGroups.map((group) => ({
      ...group,
      steps: group.steps.map((step) => updateStepCandidate(step, recoveriesByStepId)),
    })),
  }
}

export async function enrichCanonicalSemanticMarkers(params: {
  contextMatches: SemanticMarkerContextMatch[]
  projectRoot: string
  recording: NormalizedRecording
}): Promise<NormalizedRecording> {
  const sourceMatches = params.contextMatches.filter((match) => match.kind === 'source')
  if (sourceMatches.length === 0) {
    return params.recording
  }

  const enrichedMatches = (
    await Promise.all(
      sourceMatches.map(async (match) => {
        const content = await readFile(join(params.projectRoot, match.filePath), 'utf-8').catch(
          () => null
        )
        if (!content) {
          return null
        }

        const strings = extractUserVisibleStrings(content)
        return strings.length > 0 ? { ...match, strings } : null
      })
    )
  ).filter((match): match is SemanticMarkerContextMatch & { strings: string[] } => Boolean(match))

  if (enrichedMatches.length === 0) {
    return params.recording
  }

  const recoveriesByStepId = new Map<string, SemanticMarkerCanonicalRecovery>()

  for (const step of params.recording.steps) {
    const candidate = step.metadata?.semanticMarkerCandidate ?? step.semanticMarkerCandidate
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('stepId' in candidate) ||
      typeof candidate.stepId !== 'string'
    ) {
      continue
    }

    const normalizedCandidate = candidate as SemanticMarkerCandidate
    if (!canRecoverCandidate(normalizedCandidate)) {
      continue
    }

    const fragment = normalizeText(
      normalizedCandidate.proofText ??
        normalizedCandidate.query?.name ??
        normalizedCandidate.query?.target ??
        normalizedCandidate.target
    )
    if (!fragment || fragment.length < 4 || looksLikeHiddenEvidence(fragment)) {
      continue
    }

    const best = findBestRecoveryCandidate(fragment, enrichedMatches)
    if (!best || best.text.length <= fragment.length) {
      continue
    }

    recoveriesByStepId.set(normalizedCandidate.stepId, {
      fromText: fragment,
      sourceFile: best.sourceFile,
      toText: best.text,
    })
  }

  if (recoveriesByStepId.size === 0) {
    return params.recording
  }

  return {
    ...params.recording,
    steps: params.recording.steps.map((step) => updateStepCandidate(step, recoveriesByStepId)),
    baseline: updateBaselineCandidates(params.recording.baseline, recoveriesByStepId),
  }
}
