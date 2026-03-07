import type {
  AnalyzedRecording,
  IntentGroup,
  NormalizedRecording,
  NormalizedStep,
  RecordingDiagnostics,
} from '../types/recording.js'

export interface NoiseFilterResult {
  steps: NormalizedStep[]
  diagnostics: Pick<
    RecordingDiagnostics,
    'removedCursorWander' | 'removedDoubleClickNoise' | 'removedRedundantClicks'
  >
}

function hasPointerMetadata(step: NormalizedStep): boolean {
  return [step.x, step.y, step.offsetX, step.offsetY].some(
    (value) => typeof value === 'number'
  )
}

function isDoubleClickVariant(step: NormalizedStep): boolean {
  return /doubleclick|dblclick|tripleclick/i.test(step.originalType)
}

function isMovementType(step: NormalizedStep): boolean {
  return /hover|mousemove|pointermove|movemouse/i.test(step.originalType)
}

function isCursorWanderStep(step: NormalizedStep): boolean {
  if (isMovementType(step)) {
    return true
  }

  if (step.action === 'unknown' && (hasPointerMetadata(step) || !step.target)) {
    return true
  }

  return step.action === 'scroll' && !step.target && !step.value
}

function normalizedTarget(target?: string): string | undefined {
  const trimmed = target?.trim()
  return trimmed ? trimmed : undefined
}

function isSameClickTarget(current: NormalizedStep, candidate: NormalizedStep): boolean {
  return (
    current.action === 'click' &&
    candidate.action === 'click' &&
    normalizedTarget(current.target) !== undefined &&
    normalizedTarget(current.target) === normalizedTarget(candidate.target)
  )
}

function pickRepresentativeClick(cluster: NormalizedStep[]): NormalizedStep {
  return cluster.find((step) => !isDoubleClickVariant(step)) ?? cluster[0]!
}

function deriveIntentLabel(steps: NormalizedStep[]): string {
  const primary = steps.find((step) => step.action !== 'assert')

  switch (primary?.action) {
    case 'navigate':
      return 'navigation flow'
    case 'fill':
    case 'select':
      return 'form interaction'
    case 'click':
      return primary.target ? `interact with ${primary.target}` : 'click interaction'
    default:
      return 'recorded flow'
  }
}

export function inferIntentGroups(steps: NormalizedStep[]): IntentGroup[] {
  if (steps.length === 0) {
    return []
  }

  return [{ name: deriveIntentLabel(steps), steps }]
}

export function filterNoiseSteps(steps: NormalizedStep[]): NoiseFilterResult {
  let removedRedundantClicks = 0
  let removedDoubleClickNoise = 0
  let removedCursorWander = 0
  const filtered: NormalizedStep[] = []

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!

    if (isCursorWanderStep(step)) {
      removedCursorWander += 1
      continue
    }

    if (step.action !== 'click' || !normalizedTarget(step.target)) {
      filtered.push(step)
      continue
    }

    const cluster: NormalizedStep[] = [step]

    for (let nextIndex = index + 1; nextIndex < steps.length; nextIndex += 1) {
      const candidate = steps[nextIndex]!

      if (isCursorWanderStep(candidate)) {
        removedCursorWander += 1
        index = nextIndex
        continue
      }

      if (!isSameClickTarget(step, candidate)) {
        break
      }

      cluster.push(candidate)
      index = nextIndex
    }

    const extraClicks = cluster.length - 1
    if (extraClicks > 0) {
      const removedDoubleClicks = cluster
        .slice(1)
        .filter((candidate) => isDoubleClickVariant(candidate)).length

      removedDoubleClickNoise += removedDoubleClicks
      removedRedundantClicks += extraClicks - removedDoubleClicks
    }

    filtered.push(pickRepresentativeClick(cluster))
  }

  return {
    steps: filtered,
    diagnostics: {
      removedCursorWander,
      removedDoubleClickNoise,
      removedRedundantClicks,
    },
  }
}

export function analyzeRecording(recording: NormalizedRecording): AnalyzedRecording {
  const filtered = filterNoiseSteps(recording.steps)
  const intentGroups = inferIntentGroups(filtered.steps)

  return {
    ...recording,
    steps: filtered.steps,
    diagnostics: {
      ...filtered.diagnostics,
      rawStepCount: recording.rawStepCount,
      filteredStepCount: filtered.steps.length,
      intentGroupCount: intentGroups.length,
    },
    intentGroups,
  }
}
