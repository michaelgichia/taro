/**
 * TypeScript types for Chrome Recorder exports and normalized steps.
 */

export interface AssertedEvent {
  type: string
  url?: string
  title?: string
}

export interface ChromeRecorderSettings {
  url?: string
  viewport?: {
    width: number
    height: number
  }
  [key: string]: unknown
}

export type NormalizedAction =
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'assert'
  | 'navigate'
  | 'keyDown'
  | 'waitForSelector'
  | 'doubleClick'
  | 'unknown'

export type StepType = Exclude<NormalizedAction, 'unknown'> | (string & {})
export type RecordingSource = 'json' | 'js'
export type StepId = `${RecordingSource}-step-${number}` | (string & {})

export interface ChromeStep {
  type: StepType
  target?: string
  selectors?: string[][]
  value?: string
  key?: string
  url?: string
  assertedEvents?: AssertedEvent[]
  assert?: {
    expression: string
  }
  timeout?: number
  offsetX?: number
  offsetY?: number
  x?: number
  y?: number
  width?: number
  height?: number
  deviceScaleFactor?: number
  isMobile?: boolean
  hasTouch?: boolean
  isLandscape?: boolean
  modifiedTime?: number
}

export interface ChromeRecorderExport {
  title?: string
  steps: ChromeStep[]
  settings?: ChromeRecorderSettings
}

export interface NormalizedStep {
  action: NormalizedAction
  target?: string
  value?: string
  originalType: string
  source?: RecordingSource
  selectors?: string[][]
  assertedEvents?: AssertedEvent[]
  key?: string
  line?: number
  offsetX?: number
  offsetY?: number
  x?: number
  y?: number
  id?: StepId
  type?: StepType
  selector?: string
  timestamp?: number
  metadata?: Record<string, unknown>
  semanticMarkerCandidate?: SemanticMarkerCandidate
  semanticMarkerLink?: SemanticMarkerLink
  unresolvedSemanticMarker?: UnresolvedSemanticMarker
}

export interface RecordingStep extends NormalizedStep {
  id: StepId
  type: StepType
  action: Exclude<NormalizedAction, 'unknown'>
  target: string
}

export interface NormalizedRecording {
  title: string
  steps: NormalizedStep[]
  rawStepCount: number
  url?: string
  settings?: ChromeRecorderSettings
  baseline?: JsBaselineMetadata
}

export interface RecordingDiagnostics {
  removedRedundantClicks: number
  removedDoubleClickNoise: number
  removedCursorWander: number
  preservedSemanticMarkers?: number
  unresolvedSemanticMarkers?: number
  rawStepCount: number
  filteredStepCount: number
  intentGroupCount: number
}

export interface IntentGroup {
  name: string
  steps: NormalizedStep[]
}

export interface AnalyzedRecording extends NormalizedRecording {
  diagnostics: RecordingDiagnostics
  intentGroups: IntentGroup[]
  semanticMarkerLinks?: SemanticMarkerLink[]
  unresolvedSemanticMarkers?: UnresolvedSemanticMarker[]
}

export interface DialogState {
  role: 'dialog' | 'alertdialog' | null
  title: string | null
  description: string | null
  actions: string[]
  isOpen: boolean
}

export interface VisualInterrupt {
  kind: 'auth-required'
  actualTitle: string
  expectedTitle?: string
  expectedUrl?: string
  path?: string
  reachedUrl: string
  signals: string[]
  strategy?: 'storageState' | 'instructions'
}

export interface VisualAuthRecovery {
  completedAt?: string
  error?: string
  instructionsPath?: string
  persistedAuthPath?: string
  retryToExpectedUrl?: {
    attempted: boolean
    completedAt?: string
    error?: string
    outcome: 'succeeded' | 'failed'
    targetUrl: string
  }
  startedAt: string
  status: 'succeeded' | 'failed' | 'timed-out'
  timeoutMs: number
}

export interface VisualState {
  authRecovery?: VisualAuthRecovery
  capturedAt: string
  element: ElementInfo | null
  finalUrl: string
  interrupt?: VisualInterrupt
  matchedLandmarks?: string[]
  pageTitle: string
  reason: string
  screenshotPath?: string
  selector?: string
  startingPointConfirmed?: boolean
  status:
    | 'captured'
    | 'capture-failed'
    | 'auth-interrupted'
    | 'auth-recovered'
    | 'auth-recovery-failed'
    | 'auth-recovery-timed-out'
  url: string
  dialog: DialogState | null
  warnings: string[]
}

export type QueryQuality = 'excellent' | 'good' | 'acceptable' | 'fragile'

export type QueryRoot = 'screen' | 'within' | 'document'
export type SelectorEvidenceKind = 'document.querySelector' | 'document.querySelectorAll'
export type AssertionEvidenceKind =
  | 'query-result'
  | 'marker'
  | 'location'
  | 'document-title'
  | 'custom'

export interface QueryDescriptor {
  stepId: StepId
  method: string
  queryRoot: QueryRoot
  line?: number
  target?: string
  role?: string
  name?: string
  options?: Record<string, unknown>
  quality?: QueryQuality
  matcher?: string
  raw?: string
}

export interface SelectorDescriptor {
  stepId: StepId
  selector: string
  selectorKind: SelectorEvidenceKind
  line?: number
  raw?: string
}

export interface AssertionDescriptor {
  stepId: StepId
  kind: AssertionEvidenceKind
  line?: number
  target?: string
  queryMethod?: string
  raw?: string
}

export type SemanticMarkerCandidateStatus = 'qualified' | 'unresolved'
export type SemanticMarkerProofSubject =
  | 'heading'
  | 'visible-message'
  | 'concrete-value'
  | 'field-label'
  | 'selector-target'
  | 'unknown'
export type SemanticMarkerGesture = 'dblClick'
export type SemanticMarkerAnchorRelation = 'precedes' | 'follows' | 'same-target'

export interface SemanticMarkerAnchorLink {
  anchorStepId?: StepId
  relation?: SemanticMarkerAnchorRelation
}

export interface SemanticMarkerLink {
  markerStepId: StepId
  anchorStepId: StepId
  relation: SemanticMarkerAnchorRelation
  proofSubject: SemanticMarkerProofSubject
  target?: string
  proofText?: string
  line?: number
  sourceContext: SemanticMarkerSourceContext
  query?: QueryDescriptor
  selector?: SelectorDescriptor
}

export type UnresolvedSemanticMarkerReason =
  | 'missing-anchor'
  | 'ambiguous-field-context'
  | 'unsupported-proof-subject'

export interface SemanticMarkerSourceContext {
  line?: number
  originalType: string
  raw?: string
}

export interface SemanticMarkerCandidate {
  stepId: StepId
  status: SemanticMarkerCandidateStatus
  originalGesture: SemanticMarkerGesture
  proofSubject: SemanticMarkerProofSubject
  target?: string
  proofText?: string
  line?: number
  sourceContext: SemanticMarkerSourceContext
  query?: QueryDescriptor
  selector?: SelectorDescriptor
  anchor?: SemanticMarkerAnchorLink
  canonicalRecovery?: SemanticMarkerCanonicalRecovery
}

export interface UnresolvedSemanticMarker {
  stepId: StepId
  reason: UnresolvedSemanticMarkerReason
  proofSubject: SemanticMarkerProofSubject
  target?: string
  proofText?: string
  line?: number
  sourceContext: SemanticMarkerSourceContext
  query?: QueryDescriptor
  selector?: SelectorDescriptor
  anchor?: SemanticMarkerAnchorLink
}

export type SemanticMarkerAssertionProofKind =
  | 'role-name'
  | 'visible-text'
  | 'visible-value'
  | 'label-text'
  | 'placeholder-text'

export type SemanticMarkerAssertionExpectation = 'visibility'
export type SemanticMarkerAssertionMatcher = 'toBeVisible'

export interface SemanticMarkerCanonicalRecovery {
  fromText: string
  sourceFile: string
  toText: string
}

export interface SemanticMarkerAssertion {
  markerStepId: StepId
  anchorStepId: StepId
  relation: SemanticMarkerAnchorRelation
  proofKind: SemanticMarkerAssertionProofKind
  proofSubject: SemanticMarkerProofSubject
  target?: string
  proofText?: string
  line?: number
  query: QueryDescriptor
  queryExpression: string
  expectation: SemanticMarkerAssertionExpectation
  matcher: SemanticMarkerAssertionMatcher
  sourceContext: SemanticMarkerSourceContext
}

export type PlannedMarkerAssertionPlacement =
  | {
      kind: 'after-step'
      stepId: StepId
    }
  | {
      kind: 'after-helper'
      helperName: string
      stepId: StepId
    }

export interface PlannedMarkerAssertionPlacementCorrection {
  fromScenarioName: string
  toScenarioName: string
}

export interface PlannedMarkerAssertionDiagnostics {
  canonicalRecovery?: SemanticMarkerCanonicalRecovery
  placementCorrection?: PlannedMarkerAssertionPlacementCorrection
}

export interface PlannedMarkerAssertion {
  markerStepId: StepId
  anchorStepId: StepId
  placement: PlannedMarkerAssertionPlacement
  assertion: SemanticMarkerAssertion
  diagnostics?: PlannedMarkerAssertionDiagnostics
}

export type SemanticMarkerAssertionUnresolvedReason =
  | 'missing-marker-candidate'
  | 'missing-anchor'
  | 'missing-query'
  | 'unsupported-proof-subject'
  | 'ambiguous-field-context'
  | 'unsupported-field-context'
  | 'generic-container'
  | 'css-only-evidence'
  | 'icon-only-target'
  | 'hidden-evidence'
  | 'boundary-placement-conflict'

export interface ResolvedSemanticMarkerAssertionResolution {
  status: 'resolved'
  markerStepId: StepId
  anchorStepId: StepId
  assertion: SemanticMarkerAssertion
}

export interface UnresolvedSemanticMarkerAssertionResolution {
  status: 'unresolved'
  markerStepId: StepId
  anchorStepId?: StepId
  relation?: SemanticMarkerAnchorRelation
  reason: SemanticMarkerAssertionUnresolvedReason
  proofSubject: SemanticMarkerProofSubject
  target?: string
  proofText?: string
  line?: number
  sourceContext: SemanticMarkerSourceContext
  query?: QueryDescriptor
  selector?: SelectorDescriptor
  conflictingScenarioNames?: string[]
}

export type SemanticMarkerAssertionResolution =
  | ResolvedSemanticMarkerAssertionResolution
  | UnresolvedSemanticMarkerAssertionResolution

export interface ElementInfo {
  tagName: string
  role: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
  labelText: string | null
  innerText: string
  altText: string | null
  title: string | null
  testId: string | null
  value: string | undefined
  type: string | undefined
  placeholder: string | null
  isPresent: boolean
}

export interface QueryResult {
  query: string
  quality: QueryQuality
  method: string
  matcher?: string
  line?: number
}

export type SelectorResolutionStatus = 'resolved' | 'unresolved'
export type SelectorResolutionOutcome =
  | 'accessible-query'
  | 'preserved-query'
  | 'no-url'
  | 'inspection-failed'
  | 'selector-not-found'
  | 'selector-inaccessible'
  | 'unsupported-selector'

interface BaseSelectorResolutionResult {
  stepId: StepId
  selector: SelectorDescriptor
  url?: string
  warnings: string[]
}

export interface ResolvedSelectorResolutionResult
  extends BaseSelectorResolutionResult {
  status: 'resolved'
  outcome: 'accessible-query' | 'preserved-query'
  source: 'baseline' | 'live-dom'
  query: QueryDescriptor
  inspectedElement?: ElementInfo
}

export interface UnresolvedSelectorResolutionResult
  extends BaseSelectorResolutionResult {
  status: 'unresolved'
  outcome:
    | 'no-url'
    | 'inspection-failed'
    | 'selector-not-found'
    | 'selector-inaccessible'
    | 'unsupported-selector'
  reason: string
  inspectionError?: string
}

export type SelectorResolutionResult =
  | ResolvedSelectorResolutionResult
  | UnresolvedSelectorResolutionResult

export interface ItGroup {
  name: string
  steps: NormalizedStep[]
}

export type JsHelperAssertionPolicy = 'sync-only'
export type JsStateSafetyStatus = 'safe-multi-it' | 'setup-replay-required' | 'unknown'
export type JsScenarioGoal = 'flow' | 'validation' | 'review' | 'mutation-state'
export type JsScenarioProvenance = 'recorded' | 'synthesized-companion'
export type JsInteractionContractKind = 'mutation-form'
export type JsInteractionCompanionState = 'in-flight' | 'failed-completion'

export interface JsDetectedInteractionContract {
  kind: JsInteractionContractKind
  source: 'repo-contract' | 'repo-signal'
  confidence: 'low' | 'medium' | 'high'
  companionStates: JsInteractionCompanionState[]
  evidence: string[]
}

export interface JsHelperPlan {
  name: string
  sourceGroup: string
  purpose: string
  steps: NormalizedStep[]
  assertionPolicy: JsHelperAssertionPolicy
}

export interface JsScenarioPlan {
  name: string
  goal: JsScenarioGoal
  steps: NormalizedStep[]
  helperRefs: string[]
  requiresFreshRender: boolean
  provenance?: JsScenarioProvenance
  contractKind?: JsInteractionContractKind
  companionState?: JsInteractionCompanionState
  annotations?: string[]
  markerAssertions?: PlannedMarkerAssertion[]
  unresolvedMarkerAssertions?: UnresolvedSemanticMarkerAssertionResolution[]
}

export interface JsStateSafetyAssessment {
  status: JsStateSafetyStatus
  reason: string
}

export interface GeneratedItBlock {
  name: string
  stepLines: string[]
  hasUserEvent: boolean
}

export interface JsBaselineMetadata {
  environmentUrl?: string
  queries: QueryDescriptor[]
  selectors: SelectorDescriptor[]
  assertions: AssertionDescriptor[]
  itGroups: ItGroup[]
  semanticMarkerCandidates?: SemanticMarkerCandidate[]
}

export interface ParsedJsonInput {
  source: 'json'
  recording: NormalizedRecording
}

export interface ParsedJsInput {
  source: 'js'
  recording: NormalizedRecording
  baseline: JsBaselineMetadata
}

export type ParsedInput = ParsedJsonInput | ParsedJsInput

export function createStepId(source: RecordingSource, index: number): StepId {
  return `${source}-step-${index + 1}`
}
