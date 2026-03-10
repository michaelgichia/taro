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

export interface VisualState {
  capturedAt: string
  element: ElementInfo | null
  pageTitle: string
  reason: string
  screenshotPath?: string
  selector?: string
  url: string
  dialog: DialogState | null
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

export interface ElementInfo {
  tagName: string
  role: string | null
  ariaLabel: string | null
  ariaLabelledBy: string | null
  innerText: string
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
export type JsStateSafetyStatus = 'safe-multi-it' | 'single-flow-required' | 'unknown'
export type JsScenarioGoal = 'flow' | 'validation' | 'review' | 'mutation-state'

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
