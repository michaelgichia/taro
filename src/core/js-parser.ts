/**
 * Babel AST-based parser for Testing Library Recorder JS output.
 * Parses the JavaScript recording format and produces truthful baseline metadata.
 */

import * as babelParser from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import {
  createStepId,
  type AssertionDescriptor,
  type ItGroup,
  type NormalizedAction,
  type NormalizedStep,
  type QueryDescriptor,
  type QueryQuality,
  type SemanticMarkerCandidate,
  type SemanticMarkerProofSubject,
  type SelectorDescriptor,
} from '#types/recording.ts'
import {
  classifySupportedQueryMethod,
  isDisplayValueQueryMethod,
  isLabelTextQueryMethod,
  isRoleQueryMethod,
  isSupportedTestingLibraryQueryMethod,
  isTextQueryMethod,
} from '#core/query-policy.ts'

// ESM interop for @babel/traverse
const traverse = (_traverse as any).default ?? _traverse

interface RecoveredQueryDescriptor extends QueryDescriptor {
  name?: string
  options?: Record<string, string | number | boolean>
  role?: string
}

interface RecoveredAssertionDescriptor extends AssertionDescriptor {
  expected?: string
  matcher?: string
  subject?: string
}

/**
 * Classifies a Testing Library query method by quality tier.
 * @param method - The RTL query method name (e.g., 'getByRole', 'getByText')
 * @returns QueryQuality tier
 */
export function classifyQuery(method: string): QueryQuality {
  return classifySupportedQueryMethod(method)
}

/**
 * Extracts the environment URL from @jest-environment-options comment.
 * @param code - The JS file content
 * @returns The URL string or undefined if not found
 */
export function extractEnvironmentUrl(code: string): string | undefined {
  const match = code.match(/@jest-environment-options\s*(\{[^}]+\})/)
  if (!match) {
    return undefined
  }
  
  try {
    const parsed = JSON.parse(match[1])
    if (typeof parsed.url === 'string') {
      return parsed.url
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Segments steps into ItGroup[] based on modal boundary detection.
 * Modal boundary: click + assert with matching target name (within 1-2 steps)
 * @param steps - Normalized steps to segment
 * @returns Array of ItGroup
 */
export function segmentIntoItGroups(steps: NormalizedStep[]): ItGroup[] {
  if (steps.length === 0) {
    return []
  }

  const groups: ItGroup[] = []
  let current: NormalizedStep[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    
    // Check for modal boundary BEFORE adding current step
    // Boundary: current step is click, next step is assert with matching target
    const next = steps[i + 1]
    const isBoundary = 
      step.action === 'click' &&
      step.target &&
      next &&
      next.action === 'assert' &&
      next.target &&
      next.target.toLowerCase().includes(step.target.toLowerCase())

    if (isBoundary) {
      // Check that there's no navigate between click and assert
      const hasNavigateBetween = false // immediate next step is assert
      
      if (!hasNavigateBetween) {
        // Close current group (everything before the boundary click)
        if (current.length > 0) {
          groups.push({ name: current[0]?.target ?? 'flow', steps: current })
        }
        
        // Start new group with the boundary click
        current = [step]
        // Add the assert too
        current.push(next)
        i++ // Skip the assert since we added it
        continue
      }
    }
    
    current.push(step)
  }

  // Push remaining steps as final group
  if (current.length > 0) {
    groups.push({ name: current[0]?.target ?? 'recorded flow', steps: current })
  }

  // If no boundaries found, return single group with all steps
  if (groups.length === 0 && steps.length > 0) {
    return [{ name: 'recorded flow', steps }]
  }

  return groups
}

/**
 * Query selector call extracted from AST
 */
export interface QuerySelectorCall {
  selector: string
  line: number
  stepId?: string
}

interface ResolvedTargetDetails {
  metadata?: Record<string, unknown>
  query?: RecoveredQueryDescriptor
  selector?: SelectorDescriptor
  target?: string
}

/**
 * Result of parsing a JS recording
 */
export interface JsParseResult {
  title: string
  environmentUrl: string | undefined
  steps: NormalizedStep[]
  queries: QueryDescriptor[]
  selectors: SelectorDescriptor[]
  assertions: AssertionDescriptor[]
  semanticMarkerCandidates: SemanticMarkerCandidate[]
  querySelectorCalls: QuerySelectorCall[]
  itGroups: ItGroup[]
}

/**
 * Extracts a string-like value from a Babel AST node
 */
function extractLiteralValue(node?: t.Node | null): string | undefined {
  if (!node) return undefined

  if (t.isStringLiteral(node)) {
    return node.value
  }

  if (t.isNumericLiteral(node) || t.isBooleanLiteral(node)) {
    return String(node.value)
  }

  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined
  }

  return undefined
}

function sliceSource(code: string, node?: t.Node | null): string | undefined {
  if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') {
    return undefined
  }

  return code.slice(node.start, node.end)
}

function extractPlainObject(
  node?: t.Node | null
): Record<string, string | number | boolean> | undefined {
  if (!t.isObjectExpression(node)) {
    return undefined
  }

  const entries = node.properties.flatMap((property) => {
    if (!t.isObjectProperty(property) || property.computed) {
      return []
    }

    const key = t.isIdentifier(property.key)
      ? property.key.name
      : t.isStringLiteral(property.key)
        ? property.key.value
        : undefined
    const value = extractLiteralValue(property.value)

    if (!key || value === undefined) {
      return []
    }

    return [[key, value]]
  })

  return Object.fromEntries(entries)
}

function memberExpressionToSubject(node?: t.Node | null): string | undefined {
  if (!node) {
    return undefined
  }

  if (t.isIdentifier(node)) {
    return node.name
  }

  if (t.isThisExpression(node)) {
    return 'this'
  }

  if (t.isMemberExpression(node) && !node.computed) {
    const object = memberExpressionToSubject(node.object)
    const property = t.isIdentifier(node.property) ? node.property.name : undefined
    if (object && property) {
      return `${object}.${property}`
    }
  }

  return undefined
}

function getLine(node?: t.Node | null): number {
  return node?.loc?.start?.line ?? 0
}

function isUserEventCall(node: t.CallExpression): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: 'userEvent' }) &&
    t.isIdentifier(node.callee.property)
  )
}

function isPageGotoCall(node: t.CallExpression): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: 'page' }) &&
    t.isIdentifier(node.callee.property, { name: 'goto' })
  )
}

function isScreenQueryCall(node: t.CallExpression): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    isSupportedTestingLibraryQueryMethod(node.callee.property.name) &&
    ((t.isIdentifier(node.callee.object, { name: 'screen' }) ||
      (t.isCallExpression(node.callee.object) &&
        t.isIdentifier(node.callee.object.callee, { name: 'within' }))) ||
      t.isIdentifier(node.callee.object, { name: 'document' }))
  )
}

function isSelectorCall(node: t.CallExpression): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: 'document' }) &&
    t.isIdentifier(node.callee.property) &&
    ['querySelector', 'querySelectorAll'].includes(node.callee.property.name)
  )
}

function isExpectationCall(node: t.CallExpression): boolean {
  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    t.isCallExpression(node.callee.object) &&
    t.isIdentifier(node.callee.object.callee, { name: 'expect' })
  )
}

function isRecorderTitleCall(node: t.CallExpression): boolean {
  return t.isIdentifier(node.callee) && ['test', 'it'].includes(node.callee.name)
}

function isStandaloneExpression(path: NodePath<t.CallExpression>): boolean {
  return (
    path.parentPath.isExpressionStatement() ||
    (path.parentPath.isAwaitExpression() && path.parentPath.parentPath?.isExpressionStatement())
  )
}

function mapAssertionKind(subject?: string): AssertionDescriptor['kind'] {
  if (subject === 'location.href') {
    return 'location'
  }

  if (subject === 'document.title') {
    return 'document-title'
  }

  return 'custom'
}

function fallbackDocCommentTitle(code: string): string | undefined {
  const titleMatch = code.match(/\/\*\*\s*\n\s*\*\s*([^@\*]+)/)
  const title = titleMatch?.[1]?.trim()
  return title ? title.replace(/\s+at\s+\d{1,2}:\d{2}:\d{2}/, '').replace(/-/g, ' ') : undefined
}

function extractQueryDescriptor(
  code: string,
  node: t.CallExpression,
  stepId: string
): RecoveredQueryDescriptor | undefined {
  if (!isScreenQueryCall(node) || !t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return undefined
  }

  const method = node.callee.property.name
  const queryRoot = t.isIdentifier(node.callee.object, { name: 'screen' })
    ? 'screen'
    : t.isCallExpression(node.callee.object) &&
        t.isIdentifier(node.callee.object.callee, { name: 'within' })
      ? 'within'
      : 'document'
  const primaryTarget = extractLiteralValue(node.arguments[0])
  const options = extractPlainObject(node.arguments[1])
  const name = typeof options?.name === 'string' ? options.name : undefined
  const role = isRoleQueryMethod(method) ? primaryTarget : undefined

  return {
    stepId,
    method,
    queryRoot,
    line: getLine(node),
    target: name ?? primaryTarget,
    quality: classifyQuery(method),
    raw: sliceSource(code, node),
    options,
    role,
    name,
  }
}

function extractSelectorDescriptor(
  code: string,
  node: t.CallExpression,
  stepId: string
): SelectorDescriptor | undefined {
  if (!isSelectorCall(node) || !t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return undefined
  }

  const selector = extractLiteralValue(node.arguments[0])
  if (!selector) {
    return undefined
  }

  return {
    stepId,
    selector,
    selectorKind: `document.${node.callee.property.name}` as SelectorDescriptor['selectorKind'],
    line: getLine(node),
    raw: sliceSource(code, node),
  }
}

function resolveTarget(
  code: string,
  node: t.CallExpression['arguments'][number] | undefined,
  stepId: string
): ResolvedTargetDetails {
  if (!node || !t.isExpression(node)) {
    return {}
  }

  if (t.isAwaitExpression(node)) {
    return resolveTarget(code, node.argument, stepId)
  }

  if (t.isCallExpression(node)) {
    const query = extractQueryDescriptor(code, node, stepId)
    if (query) {
      return {
        query,
        target: query.target ?? query.role ?? query.method,
        metadata: {
          query: {
            method: query.method,
            queryRoot: query.queryRoot,
            target: query.target,
            role: query.role,
            name: query.name,
            options: query.options,
            raw: query.raw,
          },
        },
      }
    }

    const selector = extractSelectorDescriptor(code, node, stepId)
    if (selector) {
      return {
        selector,
        target: selector.selector,
        metadata: {
          selector,
        },
      }
    }
  }

  const literalValue = extractLiteralValue(node)
  if (literalValue !== undefined) {
    return { target: literalValue }
  }

  const subject = memberExpressionToSubject(node)
  if (subject) {
    return { target: subject }
  }

  return {}
}

function normalizeProofText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : undefined
}

function looksLikeConcreteValue(value?: string): boolean {
  if (!value) {
    return false
  }

  return (
    /@/.test(value) ||
    /^\+?[\d()\s.-]{6,}$/.test(value) ||
    /(?:KES|USD|EUR|GBP|\$|€|£)\s?[\d,.]+/.test(value)
  )
}

function looksLikeVisibleMessage(value?: string): boolean {
  if (!value) {
    return false
  }

  return /^(please|saved|success|error|warning|failed|updated|deleted)\b/i.test(value)
}

function classifySemanticMarkerProofSubject(
  resolvedTarget: ResolvedTargetDetails
): SemanticMarkerProofSubject {
  const proofText = normalizeProofText(resolvedTarget.query?.target ?? resolvedTarget.target)

  if (resolvedTarget.query?.role === 'heading') {
    return 'heading'
  }

  if (resolvedTarget.query?.role === 'alert' || resolvedTarget.query?.role === 'status') {
    return 'visible-message'
  }

  if (isDisplayValueQueryMethod(resolvedTarget.query?.method) || looksLikeConcreteValue(proofText)) {
    return 'concrete-value'
  }

  if (looksLikeVisibleMessage(proofText)) {
    return 'visible-message'
  }

  if (resolvedTarget.selector) {
    return 'selector-target'
  }

  if (
    isTextQueryMethod(resolvedTarget.query?.method) ||
    isLabelTextQueryMethod(resolvedTarget.query?.method)
  ) {
    return 'field-label'
  }

  return 'unknown'
}

function buildSemanticMarkerCandidate(
  code: string,
  node: t.CallExpression,
  stepId: string,
  resolvedTarget: ResolvedTargetDetails
): SemanticMarkerCandidate {
  return {
    stepId,
    status: 'unresolved',
    originalGesture: 'dblClick',
    proofSubject: classifySemanticMarkerProofSubject(resolvedTarget),
    target: resolvedTarget.target,
    proofText: normalizeProofText(resolvedTarget.query?.target ?? resolvedTarget.target),
    line: getLine(node),
    sourceContext: {
      line: getLine(node),
      originalType: 'dblClick',
      raw: sliceSource(code, node),
    },
    query: resolvedTarget.query,
    selector: resolvedTarget.selector,
    anchor: {},
  }
}

/**
 * Maps userEvent method calls to NormalizedAction
 */
function mapUserEventCall(method: string): NormalizedAction {
  const mapping: Record<string, NormalizedAction> = {
    click: 'click',
    dblClick: 'click',
    tripleClick: 'click',
    type: 'fill',
    keyboard: 'keyDown',
    selectOptions: 'select',
    clear: 'fill',
  }
  return mapping[method] ?? 'unknown'
}

/**
 * Parses a Testing Library Recorder JS file into structured result.
 * @param code - The JavaScript file content
 * @returns Promise<JsParseResult>
 */
export async function parseJsRecording(code: string): Promise<JsParseResult> {
  // Validate: detect JSON input
  const trimmed = code.trim()
  if (trimmed.startsWith('{')) {
    throw new Error(
      'Expected a Testing Library Recorder JS export. Chrome Recorder JSON exports are no longer supported.'
    )
  }

  const environmentUrl = extractEnvironmentUrl(code)

  // Parse with Babel
  const ast = babelParser.parse(code, {
    plugins: ['jsx', 'typescript'],
    sourceType: 'unambiguous',
  })

  let title: string | undefined
  const steps: NormalizedStep[] = []
  const queries: QueryDescriptor[] = []
  const selectors: SelectorDescriptor[] = []
  const assertions: AssertionDescriptor[] = []
  const semanticMarkerCandidates: SemanticMarkerCandidate[] = []
  const querySelectorCalls: QuerySelectorCall[] = []

  // Traverse AST
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!title && isRecorderTitleCall(path.node)) {
        const candidateTitle = extractLiteralValue(path.node.arguments[0])
        if (candidateTitle) {
          title = candidateTitle
        }
      }

      if (isUserEventCall(path.node) && t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
        const stepId = createStepId('js', steps.length)
        const methodName = path.node.callee.property.name
        const action = mapUserEventCall(methodName)
        const resolvedTarget = resolveTarget(code, path.node.arguments[0], stepId)
        const value = extractLiteralValue(path.node.arguments[1])
        const semanticMarkerCandidate =
          methodName === 'dblClick'
            ? buildSemanticMarkerCandidate(code, path.node, stepId, resolvedTarget)
            : undefined

        if (resolvedTarget.query) {
          queries.push(resolvedTarget.query)
        }

        if (resolvedTarget.selector) {
          selectors.push(resolvedTarget.selector)
          querySelectorCalls.push({
            selector: resolvedTarget.selector.selector,
            line: resolvedTarget.selector.line ?? getLine(path.node),
            stepId,
          })
        }

        if (semanticMarkerCandidate) {
          semanticMarkerCandidates.push(semanticMarkerCandidate)
        }

        steps.push({
          id: stepId,
          action,
          target: resolvedTarget.target ?? methodName,
          value,
          originalType: methodName,
          line: getLine(path.node),
          source: 'js',
          semanticMarkerCandidate,
          metadata: {
            ...resolvedTarget.metadata,
            ...(semanticMarkerCandidate ? { semanticMarkerCandidate } : {}),
          },
        })

        return
      }

      if (
        isExpectationCall(path.node) &&
        t.isMemberExpression(path.node.callee) &&
        t.isIdentifier(path.node.callee.property) &&
        t.isCallExpression(path.node.callee.object)
      ) {
        const matcher = path.node.callee.property.name
        const expectCall = path.node.callee.object
        const subject = memberExpressionToSubject(expectCall.arguments[0])
        const expected = extractLiteralValue(path.node.arguments[0])
        const stepId = createStepId('js', steps.length)
        const assertion: RecoveredAssertionDescriptor = {
          stepId,
          kind: mapAssertionKind(subject),
          line: getLine(path.node),
          target: subject,
          raw: sliceSource(code, path.node),
          expected,
          matcher,
          subject,
        }

        assertions.push(assertion)
        steps.push({
          id: stepId,
          action: 'assert',
          target: subject ?? matcher,
          value: expected,
          originalType: matcher,
          line: getLine(path.node),
          source: 'js',
          metadata: {
            assertion,
          },
        })

        return
      }

      if (isPageGotoCall(path.node)) {
        const target = extractLiteralValue(path.node.arguments[0])
        if (target) {
          const stepId = createStepId('js', steps.length)
          steps.push({
            id: stepId,
            action: 'navigate',
            target,
            value: undefined,
            originalType: 'goto',
            line: getLine(path.node),
            source: 'js',
          })
        }

        return
      }

      if (isStandaloneExpression(path)) {
        const stepId = createStepId('js', steps.length)
        const query = extractQueryDescriptor(code, path.node, stepId)
        if (query) {
          queries.push(query)
          const assertion: AssertionDescriptor = {
            stepId,
            kind: 'query-result',
            line: getLine(path.node),
            target: query.target,
            queryMethod: query.method,
            raw: query.raw,
          }
          assertions.push(assertion)
          steps.push({
            id: stepId,
            action: 'assert',
            target: query.target ?? query.method,
            value: undefined,
            originalType: query.method,
            line: getLine(path.node),
            source: 'js',
            metadata: {
              query: {
                method: query.method,
                queryRoot: query.queryRoot,
                target: query.target,
                role: query.role,
                name: query.name,
                options: query.options,
                raw: query.raw,
              },
              assertion,
            },
          })
          return
        }

        const selector = extractSelectorDescriptor(code, path.node, stepId)
        if (selector) {
          selectors.push(selector)
          querySelectorCalls.push({
            selector: selector.selector,
            line: selector.line ?? getLine(path.node),
            stepId,
          })
        }
      }
    },
  })

  const resolvedTitle = title ?? fallbackDocCommentTitle(code) ?? 'Recorded Flow'
  // Segment into ItGroups
  const itGroups = segmentIntoItGroups(steps)

  return {
    title: resolvedTitle,
    environmentUrl,
    steps,
    queries,
    selectors,
    assertions,
    semanticMarkerCandidates,
    querySelectorCalls,
    itGroups,
  }
}
